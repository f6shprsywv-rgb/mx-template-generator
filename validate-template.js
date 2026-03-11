const fs = require('fs');

const templateData = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

function validateTemplateStructure(template) {
  const errors = [];

  if (!template.level || template.level !== 'PROCEDURE') {
    errors.push('Root must be level PROCEDURE');
  }
  if (!template.masterTemplateDetails) {
    errors.push('Missing masterTemplateDetails');
  }
  if (!Array.isArray(template.children)) {
    errors.push('Root must have children array');
  }

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

const validation = validateTemplateStructure(templateData);
console.log(JSON.stringify(validation, null, 2));
