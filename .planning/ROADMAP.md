# Mx Template Generator - Roadmap

## Vision
Enable MasterControl users to generate customized Mx templates using natural language, eliminating the manual JSON editing process.

## Phases

### Phase 1: Foundation (COMPLETE)
**Goal:** Express server with template storage and API endpoints
**Status:** Complete
**Artifacts:** server.js, templates/*.mt, /api/templates endpoint

---

### Phase 2: User Interface Input (COMPLETE)
**Goal:** Web UI for template selection and request input
**Status:** Complete
**Artifacts:** public/index.html with template dropdown, text input, download functionality

---

### Phase 3: Natural Language Understanding
**Goal:** System processes natural language requests and returns modified template JSON that imports into MasterControl Mx
**Status:** Planning Complete
**Plans:** 2 plans

Plans:
- [ ] 03-01-PLAN.md — Claude API integration for template modification
- [ ] 03-02-PLAN.md — Validation and error handling

---

## Competition Deadline
Next week - must ship working NLP template modification
