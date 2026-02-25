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
const SYSTEM_PROMPT = `You are an expert at modifying MasterControl Mx template JSON files.

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no code fences, no explanations
2. Preserve the exact structure of the input template
3. Only modify what the user requests
4. Keep all existing fields intact

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

// Helper function: Recursively regenerate ONLY UUIDs (keep numeric IDs unchanged)
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
      // Generate new UUID for these fields only
      newObj[key] = uuidv4();
    } else {
      // Recursively process nested objects/arrays, keep everything else unchanged
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

// Helper function: Apply simple programmatic modifications
function applySimpleModifications(template, request) {
  const clonedTemplate = JSON.parse(JSON.stringify(template));

  // Parse request for specific commands
  const lowerRequest = request.toLowerCase().trim();

  // Command: "add phase" with name and properties
  // Example: "add phase Quality Check with witness"
  // Example: "add phase Verification with witness and verify"
  if (lowerRequest.includes('add phase') || lowerRequest.includes('add a phase')) {
    return addPhaseWithOptions(clonedTemplate, request);
  }

  // No recognized command - return unchanged
  return { modified: false, template: clonedTemplate, message: 'Command not recognized. Try: "add phase [Name] with [witness/verify/notes]"' };
}

// Add a new phase with custom name and properties
function addPhaseWithOptions(template, request) {
  // Find UNIT_PROCEDURE (contains phases)
  const unitProcedure = template.children?.[0];
  if (!unitProcedure || unitProcedure.level !== 'UNIT_PROCEDURE') {
    return { modified: false, template, message: 'Could not find UNIT_PROCEDURE' };
  }

  // Find OPERATION (contains phases)
  const operation = unitProcedure.children?.[0];
  if (!operation || operation.level !== 'OPERATION') {
    return { modified: false, template, message: 'Could not find OPERATION' };
  }

  // Find phases
  const phases = operation.children?.filter(child => child.level === 'PHASE') || [];
  if (phases.length === 0) {
    return { modified: false, template, message: 'No phases found to duplicate' };
  }

  // Clone the last phase
  const lastPhase = phases[phases.length - 1];
  const newPhase = JSON.parse(JSON.stringify(lastPhase));

  // Generate new UUIDs only (keep numeric IDs unchanged - MasterControl is okay with duplicates)
  function updateUUIDs(node) {
    if (node.globalSerialId) node.globalSerialId = uuidv4();
    if (node.localReferenceId) node.localReferenceId = uuidv4();

    // Update UUIDs in dataCaptureSteps
    if (node.dataCaptureSteps) {
      node.dataCaptureSteps.forEach(step => {
        if (step.localReferenceId) step.localReferenceId = uuidv4();
      });
    }

    // Recursively update children
    if (node.children) {
      node.children.forEach(child => updateUUIDs(child));
    }
  }

  updateUUIDs(newPhase);

  // Parse phase name from request
  // Example: "add phase Quality Check with witness"
  let phaseName = 'New Phase';
  const phaseMatch = request.match(/add (?:a )?phase\s+([^w]+?)(?:\s+with|$)/i);
  if (phaseMatch && phaseMatch[1]) {
    phaseName = phaseMatch[1].trim();
  }

  // Parse properties from request
  const hasWitness = /with\s+witness|witness/i.test(request);
  const hasVerify = /with\s+verify|verify/i.test(request);
  const hasNotes = /with\s+notes|notes/i.test(request);

  // Update phase properties
  newPhase.phaseOrderNumber = lastPhase.phaseOrderNumber + 1;
  newPhase.title = phaseName;

  // Add witness/verify/notes to first DATA_ENTRY step if requested
  if (hasWitness || hasVerify || hasNotes) {
    const dataEntryStep = findFirstDataEntryStep(newPhase);
    if (dataEntryStep && dataEntryStep.dataCaptureSteps) {
      if (hasWitness && !hasSignOffType(dataEntryStep, 'WITNESS')) {
        addSignOff(dataEntryStep, 'WITNESS');
      }
      if (hasVerify && !hasSignOffType(dataEntryStep, 'VERIFY')) {
        addSignOff(dataEntryStep, 'VERIFY');
      }
      if (hasNotes && !hasDataCaptureType(dataEntryStep, 'NOTES')) {
        addNotes(dataEntryStep);
      }
    }
  }

  // Add to operation
  operation.children.push(newPhase);
  console.log(`Phase added. Operation now has ${operation.children.length} children`);
  console.log(`New phase title: ${newPhase.title}, order: ${newPhase.phaseOrderNumber}`);

  const props = [];
  if (hasWitness) props.push('witness');
  if (hasVerify) props.push('verify');
  if (hasNotes) props.push('notes');
  const propsText = props.length > 0 ? ` with ${props.join(', ')}` : '';

  return {
    modified: true,
    template,
    message: `Added new phase: "${phaseName}"${propsText}`
  };
}

// Helper: Find first DATA_ENTRY step in phase
function findFirstDataEntryStep(phase) {
  if (!phase.children) return null;
  for (const child of phase.children) {
    if (child.type === 'DATA_ENTRY' && child.level === 'PHASE_STEP') {
      return child;
    }
  }
  return null;
}

// Helper: Check if step has a specific sign-off type
function hasSignOffType(step, signOffType) {
  if (!step.dataCaptureSteps) return false;
  return step.dataCaptureSteps.some(dcs =>
    dcs.type === 'SIGN_OFF' && dcs.signOffType === signOffType
  );
}

// Helper: Check if step has a specific data capture type
function hasDataCaptureType(step, type) {
  if (!step.dataCaptureSteps) return false;
  return step.dataCaptureSteps.some(dcs => dcs.type === type);
}

// Helper: Add sign-off to step
function addSignOff(step, signOffType) {
  const signOff = {
    type: 'SIGN_OFF',
    signOffType: signOffType,
    primaryStep: false,
    optionalStep: true,
    uniqueSignOffRequired: signOffType === 'VERIFY',
    multiIterationSignOffAllowed: false,
    allValuesCurrent: true,
    autoCaptured: false,
    configurationGroup: false,
    appendToProductId: false,
    replaceDefaultQuantity: false,
    attachedToTableCell: false,
    dataCaptureRoles: [],
    notificationRoleIds: [],
    actionTriggers: [],
    receivedDataProjections: [],
    projectedDataProjections: [],
    autoNaEnabled: false,
    temporaryChange: false,
    dataCaptureStepNotifications: []
  };
  step.dataCaptureSteps.push(signOff);
}

// Helper: Add notes to step
function addNotes(step) {
  const notes = {
    type: 'NOTES',
    allValuesCurrent: true,
    optionalStep: true,
    primaryStep: false,
    autoCaptured: false,
    configurationGroup: false,
    appendToProductId: false,
    replaceDefaultQuantity: false,
    attachedToTableCell: false,
    dataCaptureRoles: [],
    notificationRoleIds: [],
    actionTriggers: [],
    receivedDataProjections: [],
    projectedDataProjections: [],
    autoNaEnabled: false,
    temporaryChange: false,
    dataCaptureStepNotifications: []
  };
  step.dataCaptureSteps.push(notes);
}

// Strip verbose arrays from template to reduce token count while preserving structure
function stripTemplateForAI(template) {
  const stripped = JSON.parse(JSON.stringify(template)); // Deep clone

  function stripNode(node) {
    // Only remove truly verbose array fields that Claude never modifies
    // Keep everything else intact so Claude's response is valid
    const verboseArrays = [
      'instructionParts',       // Can be very long text
      'apiColumns',             // Technical metadata
      'logbookTemplateIds',     // Reference IDs
      'tags',                   // Metadata
      'productStructures',      // Can be large nested structures
      'templateTableEntities',  // Table data
      'simplifiedNavigationRoleIds',  // Role IDs
      'structureRoles',         // Role configuration
      'simplifiedNavigationRoles',
      'receivedDataProjections',
      'projectedDataProjections'
    ];

    // Replace verbose arrays with empty arrays (preserves structure)
    verboseArrays.forEach(field => {
      if (node[field] && Array.isArray(node[field]) && node[field].length > 0) {
        node[field] = [];
      }
    });

    // Recursively strip children
    if (node.children && Array.isArray(node.children)) {
      node.children = node.children.map(child => stripNode(child));
    }

    return node;
  }

  return stripNode(stripped);
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

    // Apply modifications if requested
    let modificationMessage = null;
    if (request && request.trim()) {
      try {
        console.log('Applying modifications...');
        const result = applySimpleModifications(templateData, request);

        if (result.modified) {
          console.log('✓ Modification applied:', result.message);
          const phaseCount = templateData.children?.[0]?.children?.[0]?.children?.filter(c => c.level === 'PHASE').length || 0;
          console.log(`Before assignment: ${phaseCount} phases`);
          templateData = result.template;
          const newPhaseCount = templateData.children?.[0]?.children?.[0]?.children?.filter(c => c.level === 'PHASE').length || 0;
          console.log(`After assignment: ${newPhaseCount} phases`);
          modificationMessage = result.message;
        } else {
          console.log('✗ No modification applied:', result.message);
          modificationMessage = result.message;
        }
      } catch (error) {
        console.error('Modification failed:', error.message);
        modificationMessage = `Error: ${error.message}`;
      }
    } else {
      console.log('No modifications requested - creating clone with unique UUIDs');
    }

    // CRITICAL: Regenerate all UUIDs to avoid duplicate ID errors
    console.log('Regenerating UUIDs...');
    templateData = regenerateUUIDs(templateData);
    console.log('UUIDs regenerated successfully');

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
      template: templateData
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
