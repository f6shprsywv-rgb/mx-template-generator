# Mx Template Generator

Generate valid MasterControl Mx template JSON from baseline templates. Built for the MasterControl competition (deadline: next week).

## What This Does

This web app provides:
- **3 baseline Mx templates** (minimal, standard, complex)
- **Simple web interface** for selecting templates
- **API endpoints** to fetch template data
- **Download functionality** for `.mt` JSON files

## Tech Stack

- **Backend:** Node.js + Express.js
- **Frontend:** Vanilla HTML/CSS/JavaScript (no framework)
- **Templates:** 3 baseline `.mt` files with valid ISA-88 hierarchy
- **Deployment:** Railway (free tier with auto-deploy from GitHub)

## Local Development

### Prerequisites

- Node.js 20 LTS or later (includes npm)
- Git

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd mx-template-generator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   This downloads Express and dotenv from npm registry (stored in `node_modules/`).

3. **Start the server:**
   ```bash
   npm start
   ```
   Server runs at http://localhost:3000

4. **Test the API:**
   - List templates: http://localhost:3000/api/templates
   - Get specific template: http://localhost:3000/api/templates/baseline-minimal

### Project Structure

```
mx-template-generator/
├── server.js              # Express server with API routes
├── package.json           # Dependencies and scripts
├── .env                   # Configuration (PORT, NODE_ENV)
├── .gitignore             # Excludes node_modules/ and .env
├── public/                # Static files (HTML, CSS, JS)
│   └── index.html         # Homepage
├── templates/             # Baseline .mt templates
│   ├── baseline-minimal.mt
│   ├── baseline-standard.mt
│   └── baseline-complex.mt
└── README.md              # This file
```

## API Endpoints

### `GET /api/templates`

Returns list of available templates.

**Response:**
```json
[
  {"id":"baseline-minimal","name":"Minimal","filename":"baseline-minimal.mt"},
  {"id":"baseline-standard","name":"Standard","filename":"baseline-standard.mt"},
  {"id":"baseline-complex","name":"Complex","filename":"baseline-complex.mt"}
]
```

### `GET /api/templates/:id`

Returns full JSON for a specific template.

**Example:**
```bash
curl http://localhost:3000/api/templates/baseline-minimal
```

**Response:** Full Mx JSON with ISA-88 hierarchy (Procedure → Unit Procedure → Operation → Phase → Phase Step).

## Deployment

This app deploys automatically to Railway when you push to GitHub:

1. Push code: `git push origin main`
2. Railway detects changes and starts build (2-3 minutes)
3. Live URL updates automatically

**Environment Variables (Railway sets these automatically):**
- `PORT` - Railway assigns a port dynamically
- `NODE_ENV` - Set to `production` by Railway

## Testing

```bash
# Start server locally
npm start

# In another terminal, test API
curl http://localhost:3000/api/templates
curl http://localhost:3000/api/templates/baseline-minimal | python3 -m json.tool
```

## Competition Notes

- **Deadline:** Next week
- **Budget:** $0 (free Railway tier)
- **Scope:** Working prototype for demo
- **Requirements:** BASE-01, BASE-02, BASE-03, UI-01 (Phase 1 complete)

## Next Steps (Phase 2+)

- [ ] Add frontend UI with dropdown and text input
- [ ] Integrate Claude API for natural language processing
- [ ] Add JSON generation logic
- [ ] Add download functionality

## License

Internal MasterControl project (no public license).

---

**Created:** 2026-02-17
**Phase:** 1 - Foundation & Baseline Templates
