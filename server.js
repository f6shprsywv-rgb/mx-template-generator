// server.js - The main web server file

// Load dependencies
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Create Express app
const app = express();

// Get PORT from environment variable (defaults to 3000 if not set)
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' folder
// This means when someone visits your site, they automatically get files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.json());

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
app.post('/api/generate', (req, res) => {
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

    // CRITICAL FIX: Regenerate all UUIDs to avoid duplicate ID errors in MasterControl
    templateData = regenerateUUIDs(templateData);

    // Update title to indicate it's a generated copy
    if (templateData.title) {
      const timestamp = new Date().toISOString().split('T')[0];
      templateData.title = `${templateData.title} (Generated ${timestamp})`;
    }

    // Update productId to make it unique
    if (templateData.productId) {
      const timestamp = new Date().toISOString().split('T')[0];
      templateData.productId = `${templateData.productId}-GEN-${timestamp}`;
    }

    // TODO: Phase 3-4 will add NLP processing here to actually modify the template
    // For now, just return with regenerated UUIDs so it can import successfully

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
