// server.js - The main web server file

// Load dependencies
const express = require('express');
const path = require('path');
require('dotenv').config();

// Create Express app
const app = express();

// Get PORT from environment variable (defaults to 3000 if not set)
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' folder
// This means when someone visits your site, they automatically get files from public/
app.use(express.static(path.join(__dirname, 'public')));

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
