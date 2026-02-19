# MasterControl Template Analysis - What Claude is Missing

## Comparison: YS_VOD Baseline vs Modified

**Changes Made:**
- Added Phase 2 with Not Applicable enabled
- Added "Equipment Type" GENERAL_TEXT step with character limits 1-6
- Enabled notes on step

## Critical Missing Fields Claude Doesn't Include

### 1. **structureDisplay** on PHASE_STEP nodes
```json
"structureDisplay": {
  "structureId": 141459,
  "displayOrderNumber": 1
}
```
- **Required on:** DATA_ENTRY and other visible PHASE_STEP types
- **Not required on:** ITERATION_REVIEW steps

### 2. **CORRECTION Child (SUB_PHASE_STEP)** on DATA_ENTRY steps
Every DATA_ENTRY step MUST have a CORRECTION child:
```json
"children": [{
  "id": 141460,
  "globalSerialId": "...",
  "localReferenceId": "...",
  "title": "",
  "repeatable": false,
  "notApplicableConfigured": false,
  "alwaysDisplayedOnReviewByException": false,
  "type": "CORRECTION",
  "correctionType": "PRIMARY_DATA_ENTRY",
  "masterTemplateId": 141451,
  "unitProcedureId": 141453,
  "operationId": 141455,
  "phaseId": 141457,
  "phaseStepId": 141459,
  "unitProcedureOrderNumber": 1,
  "operationOrderNumber": 1,
  "phaseOrderNumber": 1,
  "phaseStepOrderNumber": 1,
  "parentId": 141459,
  "level": "SUB_PHASE_STEP",
  "children": [],
  "simplifiedNavigationRoleIds": [],
  "structureRoles": [],
  "instructionParts": [],
  "receivedDataProjections": [],
  "projectedDataProjections": [],
  "dataCaptureSteps": [
    {"type": "CORRECTION_START", "optionalStep": true, "primaryStep": false, ...},
    {"type": "CORRECTION_END", "optionalStep": true, "primaryStep": false, ...},
    {"type": "CORRECTION_CANCEL", "optionalStep": true, "primaryStep": false, ...}
  ],
  "apiColumns": [],
  "logbookTemplateIds": [],
  "tags": [],
  "productStructures": [],
  "templateTableEntities": [],
  "subTemplate": false,
  "configurationGroupPlaceholder": false,
  "temporaryChangeStructure": false,
  "optionStructure": false,
  "simplifiedNavigationRoles": [],
  "isSubTemplate": false
}]
```

### 3. **dataCaptureStep Types** Claude Doesn't Know

#### GENERAL_TEXT (for text entry steps)
```json
{
  "type": "GENERAL_TEXT",
  "primaryStep": true,
  "headerStep": false,
  "suggestedEntries": [],
  "linkProductionRecordConfigured": false,
  "qrIncludedInGeneralText": false,
  "actionTriggers": []  // For character limits, validation
}
```

#### GENERAL_NUMERIC (for numeric entry steps)
```json
{
  "type": "GENERAL_NUMERIC",
  "primaryStep": true,
  "decimalPrecision": 16,
  "minDecimalPrecision": 0,
  "precisionMethod": "DOWN",
  "displayPrecision": false,
  "scientificNotation": false,
  "scientificNotationExponent": 0,
  "measureIncludedInGeneralNumeric": false
}
```

#### NOTES (optional notes step)
```json
{
  "type": "NOTES",
  "allValuesCurrent": true,
  "optionalStep": true,
  "primaryStep": false
}
```

#### SIGN_OFF (witness/verify steps)
```json
{
  "type": "SIGN_OFF",
  "signOffType": "WITNESS",  // or "VERIFY" or "RELEASE"
  "uniqueSignOffRequired": false,
  "multiIterationSignOffAllowed": false
}
```

### 4. **actionTriggers** for Character Limits/Validation
```json
"actionTriggers": [{
  "id": 17653,
  "dataCaptureStepId": 533008,
  "displayedOnInterface": true,
  "label": "Character Limit: ",
  "minimumValue": 1.0,
  "minimumValuePrecision": 0,
  "maximumValue": 6.0,
  "maximumValuePrecision": 0,
  "tolerancePercentConfigured": false,
  "triggerType": "OUT_OF_NUMERIC_RANGE",
  "actions": [{"id": 20678, "stepActionTriggerId": 17653, "type": "REJECT"}],
  "notifications": [],
  "notApplicableStructures": []
}]
```

### 5. **dataCaptureStep Order** in Arrays

The order of dataCaptureSteps in arrays changed between files:

**Baseline ITERATION_REVIEW dataCaptureSteps order:**
1. ITERATION_COMPLETE
2. SIGN_OFF (VERIFY)
3. ITERATION_READY_FOR_REVIEW
4. SIGN_OFF (WITNESS)

**Modified ITERATION_REVIEW dataCaptureSteps order:**
1. ITERATION_READY_FOR_REVIEW
2. SIGN_OFF (WITNESS)
3. SIGN_OFF (VERIFY)
4. ITERATION_COMPLETE

**But this might not matter** - could be a display order difference.

### 6. **PHASE dataCaptureSteps Order**

**Baseline Phase dataCaptureSteps order:**
1. STRUCTURE_COMPLETE
2. TRAINING_OVERRIDE
3. PHASE_COMPLETE_BUTTON
4. PREDECESSOR_OVERRIDE

**Modified Phase dataCaptureSteps order:**
1. PREDECESSOR_OVERRIDE
2. STRUCTURE_COMPLETE
3. TRAINING_OVERRIDE
4. PHASE_COMPLETE_BUTTON

**Modified Phase 2 (new) dataCaptureSteps order:**
1. PREDECESSOR_OVERRIDE
2. STRUCTURE_COMPLETE
3. TRAINING_OVERRIDE
4. PHASE_COMPLETE_BUTTON

The order changed but Phase 2 uses the modified order, so Claude should copy whatever order exists in the baseline.

## Summary of What Claude Needs to Do Differently

1. **Always add `structureDisplay`** on DATA_ENTRY PHASE_STEPs
2. **Always add CORRECTION child** (SUB_PHASE_STEP) on DATA_ENTRY steps with 3 dataCaptureSteps
3. **Use proper dataCaptureStep types:**
   - GENERAL_TEXT (not just "text")
   - GENERAL_NUMERIC (not just "numeric")
   - Include all required fields for each type
4. **Don't add actionTriggers** unless user specifies character limits/validation
5. **Copy exact dataCaptureStep order** from existing baseline nodes

## Testing Strategy

Use one of the working baseline templates and ask Claude to add:
- A new Phase with a DATA_ENTRY step
- Verify it has: structureDisplay, CORRECTION child, proper dataCaptureStep types
- Import to MasterControl and confirm success
