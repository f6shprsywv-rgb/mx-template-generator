// server.js - The main web server file

// Load dependencies
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk').default;
// Initialize Anthropic client for LiteLLM proxy
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL
});

// Create Express app
const app = express();

// Get PORT from environment variable (defaults to 3000 if not set)
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' folder
// This means when someone visits your site, they automatically get files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.json());

// System prompt for Claude API - explains Mx template structure
const SYSTEM_PROMPT = `You are a MasterControl Mx template modifier. You receive a baseline template JSON and a user request, and you return the modified template JSON.

STRUCTURE (ISA-88 hierarchy):
- PROCEDURE (level: "PROCEDURE") - The root/master template
  - UNIT_PROCEDURE (level: "UNIT_PROCEDURE") - Major sections
    - OPERATION (level: "OPERATION") - Groups of phases
      - PHASE (level: "PHASE") - Individual process phases
        - PHASE_STEP (level: "PHASE_STEP") - Steps within phases

KEY RULES:
1. Always preserve the hierarchy - children must have correct parentId pointing to parent's id
2. Each node needs: id (number), globalSerialId (UUID), localReferenceId (UUID), title, type, level, children array
3. Order numbers: unitProcedureOrderNumber, operationOrderNumber, phaseOrderNumber, phaseStepOrderNumber (1-based, *1000 for steps)
4. Keep masterTemplateId consistent (points to root PROCEDURE id)
5. Preserve dataCaptureSteps arrays - these define data capture behavior
6. When adding new nodes, generate placeholder IDs (any number) - they'll be regenerated
7. When adding new nodes, ensure they have the same structure as existing nodes of the same level
8. Preserve all required fields: repeatable, notApplicableConfigured, alwaysDisplayedOnReviewByException, type, simplifiedNavigationRoleIds, structureRoles, instructionParts, receivedDataProjections, projectedDataProjections, apiColumns, logbookTemplateIds, tags, productStructures, templateTableEntities, subTemplate, temporaryChangeStructure, optionStructure, configurationGroupPlaceholder, simplifiedNavigationRoles, isSubTemplate

COMMON MODIFICATIONS:
- "Add a phase for X" - Create new PHASE node (level: "PHASE") with title "X" as child of an OPERATION node
  - PHASE must have: type="PARENT", phaseId (unique number), phaseOrderNumber (increment from last phase)
  - PHASE must contain at least one PHASE_STEP child with ITERATION_REVIEW type and proper dataCaptureSteps
  - Copy the structure from existing PHASEs in the template, including all required fields
- "Add a step for Y" - Create new PHASE_STEP node (level: "PHASE_STEP") with title "Y" as child of a PHASE
  - PHASE_STEP must have: phaseStepId, phaseStepOrderNumber (increment by 1000), type (usually GENERAL_TEXT)
  - PHASE_STEP should have empty arrays but must include: dataCaptureSteps (can be empty for non-ITERATION_REVIEW types)
- "Rename X to Y" - Find node with title containing X, change title to Y
- "Add an operation for Z" - Create new OPERATION (level: "OPERATION") as child of UNIT_PROCEDURE

CRITICAL: When adding a PHASE, look at existing PHASEs in the template and copy their structure exactly, including:
- All required fields (repeatable, notApplicableConfigured, alwaysDisplayedOnReviewByException, etc.)
- At least one ITERATION_REVIEW PHASE_STEP child with proper dataCaptureSteps array
- All empty arrays (simplifiedNavigationRoleIds, structureRoles, etc.)

Return ONLY valid JSON - no explanation, no markdown code blocks, just the modified template JSON.`;

// API Routes
// GET /api/templates - List all available templates
app.get('/api/templates', (req, res) => {
  try {
    const templatesDir = path.join(__dirname, 'templates');

    // Read all .mt files from templates directory
    const files = fs.readdirSync(templatesDir)
      .filter(file => file.endsWith('.mt'));

    // Create response array with template metadata
    const templates = files.map(file => {
      const id = file.replace('.mt', '');
      const displayName = id
        .replace('baseline-', '')
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return {
        id: id,
        name: displayName,
        filename: file
      };
    });

    res.json(templates);
  } catch (error) {
    console.error('Error reading templates:', error);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

// GET /api/templates/:id - Get specific template
app.get('/api/templates/:id', (req, res) => {
  try {
    const templateId = req.params.id;
    const filePath = path.join(__dirname, 'templates', `${templateId}.mt`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Read and parse the template file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const templateData = JSON.parse(fileContent);

    res.json(templateData);
  } catch (error) {
    console.error('Error loading template:', error);
    res.status(500).json({ error: 'Failed to load template' });
  }
});

// Helper function: Recursively regenerate all UUIDs in template
function regenerateUUIDs(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => regenerateUUIDs(item));
  }

  const newObj = {};
  for (const key in obj) {
    if (key === 'globalSerialId' || key === 'localReferenceId') {
      // Generate new UUID for these fields
      newObj[key] = uuidv4();
    } else {
      // Recursively process nested objects/arrays
      newObj[key] = regenerateUUIDs(obj[key]);
    }
  }
  return newObj;
}

// POST /api/generate - Generate modified template with unique IDs
app.post('/api/generate', async (req, res) => {
  try {
    const { templateId, request } = req.body;

    // Validate inputs
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }

    // Load the baseline template
    const filePath = path.join(__dirname, 'templates', `${templateId}.mt`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    let templateData = JSON.parse(fileContent);

    // If user provided a modification request, use Claude API to modify the template
    let modifiedByAI = false;
    let aiError = null;

    if (request && request.trim()) {
      try {
        console.log('Sending request to Claude API...');
        const message = await anthropic.messages.create({
          model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
          max_tokens: 16000,
          timeout: 180000, // 3 minutes for large templates
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Baseline template:\n${JSON.stringify(templateData, null, 2)}\n\nUser request: ${request}\n\nReturn the modified template JSON only.`
            }
          ]
        });

        // Extract text content from response
        let responseText = message.content[0].text;
        console.log('Received response from Claude API');

        // Strip markdown code blocks if present
        responseText = responseText.trim();
        if (responseText.startsWith('```')) {
          // Remove opening ```json or ``` and closing ```
          responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        // Parse Claude's response as JSON
        templateData = JSON.parse(responseText);
        modifiedByAI = true;
      } catch (error) {
        console.error('Claude API error:', error);
        aiError = error.message;
        // Fall back to just UUID regeneration if Claude fails
      }
    }

    // CRITICAL: Regenerate all UUIDs to avoid duplicate ID errors in MasterControl
    templateData = regenerateUUIDs(templateData);

    // Update title to indicate it's a generated copy
    if (templateData.title) {
      const timestamp = new Date().toISOString().split('T')[0];
      templateData.title = `${templateData.title} (Generated ${timestamp})`;
    }

    // Update productId to make it unique
    if (templateData.masterTemplateDetails && templateData.masterTemplateDetails.productId) {
      const timestamp = new Date().toISOString().split('T')[0];
      templateData.masterTemplateDetails.productId = `${templateData.masterTemplateDetails.productId}-GEN-${timestamp}`;
    }

    // Generate filename with template name and timestamp
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `${templateId}-${timestamp}.mt`;

    res.json({
      success: true,
      filename: filename,
      template: templateData,
      modifiedByAI: modifiedByAI,
      aiError: aiError
    });
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Root route - serves the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📂 Serving files from: ${path.join(__dirname, 'public')}`);
  console.log('Press Ctrl+C to stop the server');
});
