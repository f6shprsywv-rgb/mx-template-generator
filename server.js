// server.js - The main web server file

// Load dependencies
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk').default;
// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
  timeout: 300000, // 5 minutes
  maxRetries: 2
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
const SYSTEM_PROMPT = `You are a MasterControl Mx template expert. You can add phases, steps, and properties based on your knowledge of the structure.

ISA-88 HIERARCHY:
PROCEDURE → UNIT_PROCEDURE → OPERATION → PHASE → PHASE_STEP → SUB_PHASE_STEP

PHASE STRUCTURE TEMPLATE:
{
  "id": <unique_number>,
  "globalSerialId": "<uuid>",
  "localReferenceId": "<uuid>",
  "title": "Phase Name",
  "repeatable": false,
  "notApplicableConfigured": false,
  "alwaysDisplayedOnReviewByException": false,
  "type": "PARENT",
  "masterTemplateId": <root_id>,
  "unitProcedureId": <unit_id>,
  "operationId": <operation_id>,
  "phaseId": <this_phase_id>,
  "unitProcedureOrderNumber": 1,
  "operationOrderNumber": 1,
  "phaseOrderNumber": <increment>,
  "parentId": <operation_id>,
  "level": "PHASE",
  "children": [<PHASE_STEPs>],
  "simplifiedNavigationRoleIds": [],
  "structureRoles": [],
  "instructionParts": [],
  "receivedDataProjections": [],
  "projectedDataProjections": [],
  "dataCaptureSteps": [
    {"type": "TRAINING_OVERRIDE", "optionalStep": true, "primaryStep": false, ...},
    {"type": "STRUCTURE_COMPLETE", "autoCaptured": true, "primaryStep": true, ...},
    {"type": "PHASE_COMPLETE_BUTTON", "primaryStep": true, ...},
    {"type": "PREDECESSOR_OVERRIDE", "optionalStep": true, "primaryStep": false, ...}
  ],
  "apiColumns": [], "logbookTemplateIds": [], "tags": [],
  "productStructures": [], "templateTableEntities": [],
  "subTemplate": false, "temporaryChangeStructure": false,
  "optionStructure": false, "configurationGroupPlaceholder": false,
  "simplifiedNavigationRoles": [], "isSubTemplate": false
}

PHASE MUST CONTAIN: ITERATION_REVIEW step at phaseStepOrderNumber 1000

DATA_ENTRY PHASE_STEP (for user input):
{
  "id": <unique>,
  "title": "Step Name",
  "type": "DATA_ENTRY",
  "level": "PHASE_STEP",
  "phaseStepOrderNumber": <1, 2, 3...>,
  "parentId": <phase_id>,
  "structureDisplay": {"structureId": <this_step_id>, "displayOrderNumber": <order>},
  "children": [<CORRECTION_SUB_PHASE_STEP>],
  "dataCaptureSteps": [
    <primary_step_GENERAL_TEXT_or_NUMERIC>,
    <optional: WITNESS>,
    <optional: VERIFY>,
    <optional: NOTES>
  ],
  <all other standard fields>
}

CORRECTION SUB_PHASE_STEP (required for DATA_ENTRY):
{
  "level": "SUB_PHASE_STEP",
  "type": "CORRECTION",
  "correctionType": "PRIMARY_DATA_ENTRY",
  "parentId": <data_entry_step_id>,
  "dataCaptureSteps": [
    {"type": "CORRECTION_START", "optionalStep": true, ...},
    {"type": "CORRECTION_END", "optionalStep": true, ...},
    {"type": "CORRECTION_CANCEL", "optionalStep": true, ...}
  ]
}

DATA CAPTURE STEP TYPES:

WITNESS (sign-off):
{"type": "SIGN_OFF", "signOffType": "WITNESS", "primaryStep": false, "uniqueSignOffRequired": false, "multiIterationSignOffAllowed": false}

VERIFY (sign-off):
{"type": "SIGN_OFF", "signOffType": "VERIFY", "primaryStep": false, "uniqueSignOffRequired": true, "multiIterationSignOffAllowed": false}

NOTES (optional notes):
{"type": "NOTES", "optionalStep": true, "primaryStep": false, "allValuesCurrent": true}

GENERAL_TEXT (text entry):
{"type": "GENERAL_TEXT", "primaryStep": true, "headerStep": false, "suggestedEntries": [], "linkProductionRecordConfigured": false, "qrIncludedInGeneralText": false}

GENERAL_NUMERIC (numeric entry):
{"type": "GENERAL_NUMERIC", "primaryStep": true, "decimalPrecision": 16, "minDecimalPrecision": 0, "precisionMethod": "DOWN", "displayPrecision": false, "scientificNotation": false, "scientificNotationExponent": 0, "measureIncludedInGeneralNumeric": false}

All dataCaptureSteps need: id, localReferenceId, structureId, allValuesCurrent, autoCaptured, optionalStep, configurationGroup, appendToProductId, replaceDefaultQuantity, primaryStep, attachedToTableCell, dataCaptureRoles: [], notificationRoleIds: [], actionTriggers: [], receivedDataProjections: [], projectedDataProjections: [], autoNaEnabled, temporaryChange, dataCaptureStepNotifications: []

INSTRUCTIONS:
- When adding phase: Create complete structure from templates above
- Use existing template for ID ranges and increment appropriately
- Generate new UUIDs for globalSerialId and localReferenceId
- If user requests properties (witness, verify, notes), add corresponding dataCaptureSteps
- Always include ITERATION_REVIEW step at phaseStepOrderNumber 1000
- DATA_ENTRY steps must have structureDisplay and CORRECTION child

Return ONLY the modified JSON template.`;

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

// Validate template structure follows ISA-88 hierarchy
function validateTemplateStructure(template) {
  const errors = [];

  // Root level checks
  if (!template.level || template.level !== 'PROCEDURE') {
    errors.push('Root must be level PROCEDURE');
  }
  if (!template.masterTemplateDetails) {
    errors.push('Missing masterTemplateDetails');
  }
  if (!Array.isArray(template.children)) {
    errors.push('Root must have children array');
  }

  // Recursive validation
  function validateNode(node, expectedLevel, parentId) {
    if (!node.globalSerialId) {
      errors.push(`Node "${node.title}" missing globalSerialId`);
    }
    if (!node.localReferenceId) {
      errors.push(`Node "${node.title}" missing localReferenceId`);
    }
    if (node.level !== expectedLevel) {
      errors.push(`Node "${node.title}" has wrong level: ${node.level}, expected ${expectedLevel}`);
    }

    // Validate children
    if (Array.isArray(node.children)) {
      const childLevels = {
        'PROCEDURE': 'UNIT_PROCEDURE',
        'UNIT_PROCEDURE': 'OPERATION',
        'OPERATION': 'PHASE',
        'PHASE': 'PHASE_STEP'
      };
      const expectedChildLevel = childLevels[expectedLevel];

      node.children.forEach(child => {
        if (expectedChildLevel) {
          validateNode(child, expectedChildLevel, node.id);
        }
      });
    }
  }

  validateNode(template, 'PROCEDURE', null);

  return {
    valid: errors.length === 0,
    errors: errors
  };
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
          model: "claude-sonnet-4-20250514",
          max_tokens: 10000,  // Reduced to fit within 200k context window
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" }
            }
          ],
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Baseline template:\n${JSON.stringify(templateData, null, 2)}`,
                  cache_control: { type: "ephemeral" }
                },
                {
                  type: "text",
                  text: `\n\nUser request: ${request}\n\nReturn the modified template JSON only.`
                }
              ]
            }
          ]
        });

        // Extract text content from response
        let responseText = message.content[0].text;
        console.log('Received response from Claude API');

        // Try to extract JSON if Claude wrapped it in markdown
        let jsonText = responseText.trim();
        const jsonMatch = responseText.match(/```json?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }

        // Parse Claude's response as JSON
        const modifiedTemplate = JSON.parse(jsonText);

        // Validate structure
        const validation = validateTemplateStructure(modifiedTemplate);
        if (!validation.valid) {
          console.error('Validation errors:', validation.errors);
          throw new Error('Invalid template structure: ' + validation.errors.join(', '));
        }

        // If validation passed, use the modified template
        templateData = modifiedTemplate;
        modifiedByAI = true;
      } catch (error) {
        console.error('AI modification failed:', error.message);
        aiError = error.message;
        // Fall back to original template - UUID regeneration happens below
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
