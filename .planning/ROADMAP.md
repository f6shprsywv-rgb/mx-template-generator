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

### Phase 3: Natural Language Understanding (COMPLETE)
**Goal:** System processes natural language requests and returns modified template JSON that imports into MasterControl Mx
**Status:** Complete
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Claude API integration for template modification
- [x] 03-02-PLAN.md — Validation and error handling

---

### Phase 4: Testing & Verification
**Goal:** Validate generated templates import successfully to MasterControl Mx and handle complex modification scenarios
**Status:** Planned
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Test scenario documentation and import testing in MasterControl Mx
- [ ] 04-02-PLAN.md — Fix import failures and verify fixes

---

## Competition Deadline
Next week - must ship working NLP template modification
