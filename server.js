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

// Disable caching for all responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

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
- **ID GENERATION (CRITICAL):**
  1. Find the maximum "id" value in the entire template using recursive search
  2. New phase ID = max_id + 1
  3. All child steps/substeps must also have unique IDs: max_id + 2, max_id + 3, etc.
  4. For PHASE level: "id" and "phaseId" must be THE SAME value
  5. All "structureId" references must match their parent structure's "id"
  6. Never reuse existing IDs - this causes silent import failures
- Generate new UUIDs for globalSerialId and localReferenceId
- If user requests properties (witness, verify, notes), add corresponding dataCaptureSteps
- Always include ITERATION_REVIEW step at phaseStepOrderNumber 1000
- DATA_ENTRY steps must have structureDisplay and CORRECTION child
- New phase should be inserted BEFORE the ITERATION_REVIEW phase (order < 1000)

Return ONLY the modified JSON template.`;

// API Routes
// GET /api/templates - List all available templates
app.get('/api/templates', (req, res) => {
  try {
    const templatesDir = path.join(__dirname, 'templates');

    // Read all .mt files from templates directory
    const files = fs.readdirSync(templatesDir)
      .filter(file => file.endsWith('.mt'));

    // Custom display names for templates
    const nameMap = {
      'baseline-simple': 'Simple Baseline Template',
      'WunderDrug-5678': 'WunderDrug Manufacturing (Realistic Example)',
      'Levera_Drug_-_Albert-Levera_Drug_-_Albert': 'Levera Drug Production (Complex Example)',
      'Equipment_Linking_to_PR-ABCD-REVISED': 'Equipment Linking Example',
      'Simple_MT-Test_Record_Creation-REVISED': 'Simple Master Template'
    };

    // Create response array with template metadata
    const templates = files.map(file => {
      const id = file.replace('.mt', '');
      const displayName = nameMap[id] || id
        .replace('baseline-', '')
        .split(/[-_]/)
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

    // If user provided a modification request, apply it programmatically
    let modifiedByAI = false;
    let aiError = null;

    if (request && request.trim()) {
      try {
        // Parse the modification request
        let addPhaseMatch = request.match(/add (?:a )?phase\s+(.+?)(?:\s+with|$)/i);

        // Try alternate pattern: "phase step called [name]"
        if (!addPhaseMatch) {
          addPhaseMatch = request.match(/phase step called\s+(.+?)(?:\.|$)/i);
        }

        if (addPhaseMatch) {
          const phaseTitle = addPhaseMatch[1].trim();

          // Parse optional properties
          const hasWitness = /\bwitness\b/i.test(request);
          const hasVerify = /\bverify\b/i.test(request);
          const displayOnRBE = /\bdisplay on rbe\b/i.test(request) || /\breview by exception\b/i.test(request);

          // Check if user wants a general text step (data entry)
          const wantsGeneralText = /\bgeneral text\b/i.test(request) || /\bphase step\b/i.test(request);

          console.log(`Adding phase: "${phaseTitle}" (witness: ${hasWitness}, verify: ${hasVerify}, generalText: ${wantsGeneralText}, displayOnRBE: ${displayOnRBE})`);

          // Find max ID in entire template
          const findMaxId = (obj) => {
            let maxId = 0;
            const traverse = (o) => {
              if (typeof o === 'object' && o !== null) {
                if (o.id && typeof o.id === 'number') {
                  maxId = Math.max(maxId, o.id);
                }
                Object.values(o).forEach(v => traverse(v));
              }
            };
            traverse(obj);
            return maxId;
          };

          const maxId = findMaxId(templateData);
          const newPhaseId = maxId + 1;

          console.log(`Max ID found: ${maxId}, New phase ID: ${newPhaseId}`);

          // Find the OPERATION node
          const operation = templateData.children[0].children[0];

          // Find ITERATION_REVIEW phase (phaseOrderNumber 1000)
          const iterationReviewIndex = operation.children.findIndex(
            c => c.level === 'PHASE' && c.phaseOrderNumber === 1000
          );

          // Calculate next phaseOrderNumber (max of existing non-ITERATION_REVIEW phases + 1)
          const maxPhaseOrder = Math.max(...operation.children
            .filter(c => c.level === 'PHASE' && c.phaseOrderNumber < 1000)
            .map(c => c.phaseOrderNumber), 0);
          const newPhaseOrderNumber = maxPhaseOrder + 1;

          // Create ITERATION_REVIEW step for the new phase
          let currentId = newPhaseId + 1;
          const iterationReviewStepId = currentId++;

          const iterationReviewStep = {
            id: iterationReviewStepId,
            globalSerialId: uuidv4(),
            localReferenceId: uuidv4(),
            title: "",
            repeatable: false,
            notApplicableConfigured: false,
            alwaysDisplayedOnReviewByException: false,
            type: "ITERATION_REVIEW",
            masterTemplateId: templateData.id,
            unitProcedureId: templateData.children[0].id,
            operationId: operation.id,
            phaseId: newPhaseId,
            phaseStepId: iterationReviewStepId,
            unitProcedureOrderNumber: 1,
            operationOrderNumber: 1,
            phaseOrderNumber: newPhaseOrderNumber,
            phaseStepOrderNumber: 1000,
            parentId: newPhaseId,
            level: "PHASE_STEP",
            children: [],
            simplifiedNavigationRoleIds: [],
            structureRoles: [],
            instructionParts: [],
            receivedDataProjections: [],
            projectedDataProjections: [],
            dataCaptureSteps: [
              {
                id: currentId++,
                localReferenceId: uuidv4(),
                structureId: iterationReviewStepId,
                type: "ITERATION_READY_FOR_REVIEW",
                allValuesCurrent: false,
                autoCaptured: false,
                optionalStep: false,
                configurationGroup: false,
                appendToProductId: false,
                replaceDefaultQuantity: false,
                primaryStep: false,
                attachedToTableCell: false,
                dataCaptureRoles: [],
                notificationRoleIds: [],
                actionTriggers: [],
                receivedDataProjections: [],
                projectedDataProjections: [],
                autoNaEnabled: false,
                temporaryChange: false,
                dataCaptureStepNotifications: []
              },
              {
                id: currentId++,
                localReferenceId: uuidv4(),
                structureId: iterationReviewStepId,
                type: "ITERATION_COMPLETE",
                allValuesCurrent: false,
                autoCaptured: true,
                optionalStep: false,
                configurationGroup: false,
                appendToProductId: false,
                replaceDefaultQuantity: false,
                primaryStep: true,
                attachedToTableCell: false,
                dataCaptureRoles: [],
                notificationRoleIds: [],
                actionTriggers: [],
                receivedDataProjections: [],
                projectedDataProjections: [],
                autoNaEnabled: false,
                temporaryChange: false,
                dataCaptureStepNotifications: []
              },
              ...(!wantsGeneralText && hasWitness ? [{
                id: currentId++,
                localReferenceId: uuidv4(),
                structureId: iterationReviewStepId,
                type: "SIGN_OFF",
                signOffType: "WITNESS",
                allValuesCurrent: false,
                autoCaptured: false,
                optionalStep: false,
                configurationGroup: false,
                appendToProductId: false,
                replaceDefaultQuantity: false,
                primaryStep: false,
                attachedToTableCell: false,
                uniqueSignOffRequired: false,
                multiIterationSignOffAllowed: false,
                dataCaptureRoles: [],
                notificationRoleIds: [],
                actionTriggers: [],
                receivedDataProjections: [],
                projectedDataProjections: [],
                autoNaEnabled: false,
                temporaryChange: false,
                dataCaptureStepNotifications: []
              }] : []),
              ...(!wantsGeneralText && hasVerify ? [{
                id: currentId++,
                localReferenceId: uuidv4(),
                structureId: iterationReviewStepId,
                type: "SIGN_OFF",
                signOffType: "VERIFY",
                allValuesCurrent: false,
                autoCaptured: false,
                optionalStep: false,
                configurationGroup: false,
                appendToProductId: false,
                replaceDefaultQuantity: false,
                primaryStep: false,
                attachedToTableCell: false,
                uniqueSignOffRequired: true,
                multiIterationSignOffAllowed: false,
                dataCaptureRoles: [],
                notificationRoleIds: [],
                actionTriggers: [],
                receivedDataProjections: [],
                projectedDataProjections: [],
                autoNaEnabled: false,
                temporaryChange: false,
                dataCaptureStepNotifications: []
              }] : [])
            ],
            apiColumns: [],
            logbookTemplateIds: [],
            tags: [],
            productStructures: [],
            templateTableEntities: [],
            subTemplate: false,
            configurationGroupPlaceholder: false,
            temporaryChangeStructure: false,
            optionStructure: false,
            simplifiedNavigationRoles: [],
            isSubTemplate: false
          };

          // Create DATA_ENTRY step if requested
          let dataEntryStep = null;
          if (wantsGeneralText) {
            const dataEntryStepId = currentId++;
            const correctionStepId = currentId++;

            // Create CORRECTION sub-phase-step
            const correctionSubStep = {
              id: correctionStepId,
              globalSerialId: uuidv4(),
              localReferenceId: uuidv4(),
              title: "",
              repeatable: false,
              notApplicableConfigured: false,
              alwaysDisplayedOnReviewByException: false,
              type: "CORRECTION",
              correctionType: "PRIMARY_DATA_ENTRY",
              masterTemplateId: templateData.id,
              unitProcedureId: templateData.children[0].id,
              operationId: operation.id,
              phaseId: newPhaseId,
              phaseStepId: dataEntryStepId,
              unitProcedureOrderNumber: 1,
              operationOrderNumber: 1,
              phaseOrderNumber: newPhaseOrderNumber,
              phaseStepOrderNumber: 1,
              parentId: dataEntryStepId,
              level: "SUB_PHASE_STEP",
              children: [],
              simplifiedNavigationRoleIds: [],
              structureRoles: [],
              instructionParts: [],
              receivedDataProjections: [],
              projectedDataProjections: [],
              dataCaptureSteps: [
                {
                  id: currentId++,
                  localReferenceId: uuidv4(),
                  structureId: correctionStepId,
                  type: "CORRECTION_START",
                  allValuesCurrent: false,
                  autoCaptured: false,
                  optionalStep: true,
                  configurationGroup: false,
                  appendToProductId: false,
                  replaceDefaultQuantity: false,
                  primaryStep: false,
                  attachedToTableCell: false,
                  dataCaptureRoles: [],
                  notificationRoleIds: [],
                  actionTriggers: [],
                  receivedDataProjections: [],
                  projectedDataProjections: [],
                  autoNaEnabled: false,
                  temporaryChange: false,
                  dataCaptureStepNotifications: []
                },
                {
                  id: currentId++,
                  localReferenceId: uuidv4(),
                  structureId: correctionStepId,
                  type: "CORRECTION_END",
                  allValuesCurrent: false,
                  autoCaptured: false,
                  optionalStep: true,
                  configurationGroup: false,
                  appendToProductId: false,
                  replaceDefaultQuantity: false,
                  primaryStep: false,
                  attachedToTableCell: false,
                  dataCaptureRoles: [],
                  notificationRoleIds: [],
                  actionTriggers: [],
                  receivedDataProjections: [],
                  projectedDataProjections: [],
                  autoNaEnabled: false,
                  temporaryChange: false,
                  dataCaptureStepNotifications: []
                },
                {
                  id: currentId++,
                  localReferenceId: uuidv4(),
                  structureId: correctionStepId,
                  type: "CORRECTION_CANCEL",
                  allValuesCurrent: false,
                  autoCaptured: false,
                  optionalStep: true,
                  configurationGroup: false,
                  appendToProductId: false,
                  replaceDefaultQuantity: false,
                  primaryStep: false,
                  attachedToTableCell: false,
                  dataCaptureRoles: [],
                  notificationRoleIds: [],
                  actionTriggers: [],
                  receivedDataProjections: [],
                  projectedDataProjections: [],
                  autoNaEnabled: false,
                  temporaryChange: false,
                  dataCaptureStepNotifications: []
                }
              ],
              apiColumns: [],
              logbookTemplateIds: [],
              tags: [],
              productStructures: [],
              templateTableEntities: [],
              subTemplate: false,
              configurationGroupPlaceholder: false,
              temporaryChangeStructure: false,
              optionStructure: false,
              simplifiedNavigationRoles: [],
              isSubTemplate: false
            };

            // Create DATA_ENTRY step with GENERAL_TEXT
            dataEntryStep = {
              id: dataEntryStepId,
              globalSerialId: uuidv4(),
              localReferenceId: uuidv4(),
              title: phaseTitle,
              repeatable: false,
              notApplicableConfigured: false,
              alwaysDisplayedOnReviewByException: displayOnRBE,
              type: "DATA_ENTRY",
              masterTemplateId: templateData.id,
              unitProcedureId: templateData.children[0].id,
              operationId: operation.id,
              phaseId: newPhaseId,
              phaseStepId: dataEntryStepId,
              unitProcedureOrderNumber: 1,
              operationOrderNumber: 1,
              phaseOrderNumber: newPhaseOrderNumber,
              phaseStepOrderNumber: 1,
              parentId: newPhaseId,
              level: "PHASE_STEP",
              children: [correctionSubStep],
              simplifiedNavigationRoleIds: [],
              structureRoles: [],
              instructionParts: [],
              structureDisplay: {
                structureId: dataEntryStepId,
                displayOrderNumber: 1
              },
              receivedDataProjections: [],
              projectedDataProjections: [],
              dataCaptureSteps: [
                (() => {
                  const generalTextId = currentId++;
                  const actionTriggerId = currentId++;
                  const actionId = currentId++;

                  return {
                    id: generalTextId,
                    localReferenceId: uuidv4(),
                    structureId: dataEntryStepId,
                    type: "GENERAL_TEXT",
                    allValuesCurrent: false,
                    autoCaptured: false,
                    optionalStep: false,
                    configurationGroup: false,
                    appendToProductId: false,
                    replaceDefaultQuantity: false,
                    primaryStep: true,
                    attachedToTableCell: false,
                    dataCaptureRoles: [],
                    notificationRoleIds: [],
                    actionTriggers: [
                      {
                        id: actionTriggerId,
                        dataCaptureStepId: generalTextId,
                        displayedOnInterface: true,
                        label: "Character Limit: ",
                        minimumValue: 1,
                        minimumValuePrecision: 0,
                        maximumValue: 120,
                        maximumValuePrecision: 0,
                        tolerancePercentConfigured: false,
                        triggerType: "OUT_OF_NUMERIC_RANGE",
                        actions: [
                          {
                            id: actionId,
                            stepActionTriggerId: actionTriggerId,
                            type: "REJECT"
                          }
                        ],
                        notifications: [],
                        notApplicableStructures: []
                      }
                    ],
                    receivedDataProjections: [],
                    projectedDataProjections: [],
                    autoNaEnabled: false,
                    temporaryChange: false,
                    headerStep: false,
                    suggestedEntries: [],
                    linkProductionRecordConfigured: false,
                    qrIncludedInGeneralText: false,
                    dataCaptureStepNotifications: []
                  };
                })(),
                ...(hasWitness ? [{
                  id: currentId++,
                  localReferenceId: uuidv4(),
                  structureId: dataEntryStepId,
                  type: "SIGN_OFF",
                  signOffType: "WITNESS",
                  allValuesCurrent: false,
                  autoCaptured: false,
                  optionalStep: false,
                  configurationGroup: false,
                  appendToProductId: false,
                  replaceDefaultQuantity: false,
                  primaryStep: false,
                  attachedToTableCell: false,
                  uniqueSignOffRequired: false,
                  multiIterationSignOffAllowed: false,
                  dataCaptureRoles: [],
                  notificationRoleIds: [],
                  actionTriggers: [],
                  receivedDataProjections: [],
                  projectedDataProjections: [],
                  autoNaEnabled: false,
                  temporaryChange: false,
                  dataCaptureStepNotifications: []
                }] : [])
              ],
              apiColumns: [],
              logbookTemplateIds: [],
              tags: [],
              productStructures: [],
              templateTableEntities: [],
              subTemplate: false,
              configurationGroupPlaceholder: false,
              temporaryChangeStructure: false,
              optionStructure: false,
              simplifiedNavigationRoles: [],
              isSubTemplate: false
            };
          }

          // Create new phase with required dataCaptureSteps
          const newPhase = {
            id: newPhaseId,
            globalSerialId: uuidv4(),
            localReferenceId: uuidv4(),
            title: phaseTitle,
            level: 'PHASE',
            phaseId: newPhaseId,
            type: 'PARENT',
            phaseOrderNumber: newPhaseOrderNumber,
            parentId: operation.id,
            operationId: operation.id,
            unitProcedureId: templateData.children[0].id,
            masterTemplateId: templateData.id,
            children: dataEntryStep ? [dataEntryStep, iterationReviewStep] : [iterationReviewStep],
            dataCaptureSteps: [
              {
                id: currentId++,
                localReferenceId: uuidv4(),
                structureId: newPhaseId,
                type: "TRAINING_OVERRIDE",
                allValuesCurrent: false,
                autoCaptured: false,
                optionalStep: true,
                configurationGroup: false,
                appendToProductId: false,
                replaceDefaultQuantity: false,
                primaryStep: false,
                attachedToTableCell: false,
                dataCaptureRoles: [],
                notificationRoleIds: [],
                actionTriggers: [],
                receivedDataProjections: [],
                projectedDataProjections: [],
                autoNaEnabled: false,
                temporaryChange: false,
                dataCaptureStepNotifications: []
              },
              {
                id: currentId++,
                localReferenceId: uuidv4(),
                structureId: newPhaseId,
                type: "PHASE_COMPLETE_BUTTON",
                allValuesCurrent: false,
                autoCaptured: false,
                optionalStep: false,
                configurationGroup: false,
                appendToProductId: false,
                replaceDefaultQuantity: false,
                primaryStep: true,
                attachedToTableCell: false,
                dataCaptureRoles: [],
                notificationRoleIds: [],
                actionTriggers: [],
                receivedDataProjections: [],
                projectedDataProjections: [],
                autoNaEnabled: false,
                temporaryChange: false,
                dataCaptureStepNotifications: []
              },
              {
                id: currentId++,
                localReferenceId: uuidv4(),
                structureId: newPhaseId,
                type: "PREDECESSOR_OVERRIDE",
                allValuesCurrent: false,
                autoCaptured: false,
                optionalStep: true,
                configurationGroup: false,
                appendToProductId: false,
                replaceDefaultQuantity: false,
                primaryStep: false,
                attachedToTableCell: false,
                dataCaptureRoles: [],
                notificationRoleIds: [],
                actionTriggers: [],
                receivedDataProjections: [],
                projectedDataProjections: [],
                autoNaEnabled: false,
                temporaryChange: false,
                dataCaptureStepNotifications: []
              },
              {
                id: currentId++,
                localReferenceId: uuidv4(),
                structureId: newPhaseId,
                type: "STRUCTURE_COMPLETE",
                allValuesCurrent: false,
                autoCaptured: true,
                optionalStep: false,
                configurationGroup: false,
                appendToProductId: false,
                replaceDefaultQuantity: false,
                primaryStep: true,
                attachedToTableCell: false,
                dataCaptureRoles: [],
                notificationRoleIds: [],
                actionTriggers: [],
                receivedDataProjections: [],
                projectedDataProjections: [],
                autoNaEnabled: false,
                temporaryChange: false,
                dataCaptureStepNotifications: []
              }
            ],
            simplifiedNavigationRoleIds: [],
            structureRoles: [],
            instructionParts: [],
            receivedDataProjections: [],
            projectedDataProjections: [],
            apiColumns: [],
            logbookTemplateIds: [],
            tags: [],
            productStructures: [],
            templateTableEntities: [],
            subTemplate: false,
            temporaryChangeStructure: false,
            optionStructure: false,
            configurationGroupPlaceholder: false,
            simplifiedNavigationRoles: [],
            isSubTemplate: false,
            repeatable: false,
            notApplicableConfigured: false,
            alwaysDisplayedOnReviewByException: false,
            unitProcedureOrderNumber: 1,
            operationOrderNumber: 1
          };

          // Insert before ITERATION_REVIEW
          operation.children.splice(iterationReviewIndex, 0, newPhase);

          console.log(`Phase "${phaseTitle}" added successfully with ID ${newPhaseId}`);
          modifiedByAI = true;
        } else {
          console.log('No matching modification pattern found');
        }
      } catch (error) {
        console.error('Programmatic modification failed:', error.message);
        aiError = error.message;
      }
    }

    // OLD CLAUDE API CODE (disabled)
    if (false && request && request.trim()) {
      try {
        console.log('Sending request to Claude API...');
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 24000,
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

    // Generate filename with template name and full timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5); // YYYY-MM-DD_HH-MM-SS
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
