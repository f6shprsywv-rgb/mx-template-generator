---
phase: 03-natural-language-understanding
plan: 01
subsystem: api
tags: [anthropic-sdk, claude-api, nlp, natural-language-processing, express, api]

# Dependency graph
requires:
  - phase: 02-user-interface-input
    provides: Web UI with template selection and request text input
provides:
  - Claude API integration for natural language template modification
  - ISA-88 hierarchy-aware system prompt for Claude
  - AI-powered modification endpoint at /api/generate
  - User feedback for AI processing states
affects: [03-02, validation, testing, deployment]

# Tech tracking
tech-stack:
  added: [@anthropic-ai/sdk@0.76.0]
  patterns: [AI-as-service for template transformation, markdown code block stripping for LLM responses, error fallback with partial success states]

key-files:
  created: [.env.example]
  modified: [server.js, public/index.html]

key-decisions:
  - "Used Claude Sonnet 4.5 via AWS Bedrock for template modifications"
  - "Implemented comprehensive system prompt explaining ISA-88 hierarchy structure"
  - "Added markdown code block stripping to handle Claude's formatted responses"
  - "Implemented graceful degradation: if AI fails, still return template with new UUIDs"
  - "Set 60-second timeout for Claude API calls with user-friendly timeout messages"

patterns-established:
  - "System prompts for Claude should explain domain-specific structures (ISA-88) with examples"
  - "Always strip markdown formatting from LLM JSON responses before parsing"
  - "Provide differentiated UI feedback based on AI success/failure states"

# Metrics
duration: 50min
completed: 2026-02-18
---

# Phase 03 Plan 01: Natural Language Understanding Summary

**Claude API integration processes natural language requests and modifies ISA-88 templates with 60s timeout handling and graceful fallback**

## Performance

- **Duration:** 50 min
- **Started:** 2026-02-18T18:54:57Z
- **Completed:** 2026-02-18T19:44:57Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Integrated Anthropic SDK to send template JSON + user requests to Claude API
- Claude successfully parses and modifies ISA-88 hierarchical templates based on natural language
- UI provides clear AI-aware loading states and differentiates AI success/failure outcomes
- Graceful fallback ensures users always get usable template even if AI fails

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Anthropic SDK and create environment template** - `5de269e` (chore)
2. **Task 2: Integrate Claude API into /api/generate endpoint** - `2b64a9e` (feat)
3. **Task 3: Add AI-aware loading states and error handling to UI** - `59ed1ce` (feat)

## Files Created/Modified
- `.env.example` - Documents required ANTHROPIC_API_KEY environment variable
- `server.js` - Added Anthropic SDK import, comprehensive ISA-88 system prompt, Claude API call in /api/generate endpoint, markdown code block stripping
- `public/index.html` - Updated UI messages for AI processing, added 60-second timeout handling, differentiated success messages based on AI modification status
- `package.json` - Added @anthropic-ai/sdk dependency

## Decisions Made
- **Claude Sonnet 4.5 via AWS Bedrock:** Using the fastest, most capable model available through AWS Bedrock infrastructure
- **Comprehensive system prompt:** Included ISA-88 hierarchy explanation, key rules, common modification patterns to guide Claude's understanding
- **Markdown stripping:** Claude sometimes wraps JSON in markdown code blocks - implemented stripping to handle both raw JSON and formatted responses
- **Graceful degradation:** If Claude fails, endpoint still returns template with regenerated UUIDs (same behavior as before AI integration)
- **60-second timeout:** Claude API calls can take time for large templates - UI timeout prevents hanging
- **Differentiated feedback:** UI shows different messages based on whether AI successfully modified template vs. fallback behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added markdown code block stripping for Claude responses**
- **Found during:** Task 2 (Testing Claude API integration)
- **Issue:** Claude returned JSON wrapped in markdown code blocks (```json...```), causing JSON.parse to fail
- **Fix:** Added code to detect and strip markdown code blocks before JSON parsing
- **Files modified:** server.js
- **Verification:** Tested with curl - JSON parsing succeeded, template modification worked correctly
- **Committed in:** 2b64a9e (Task 2 commit)

**2. [Rule 2 - Missing Critical] Fixed productId location for unique identifier**
- **Found during:** Task 2 (Testing template generation)
- **Issue:** Original code tried to update templateData.productId but actual location is templateData.masterTemplateDetails.productId
- **Fix:** Updated code to correctly modify productId in masterTemplateDetails object
- **Files modified:** server.js
- **Verification:** Checked generated template JSON structure matches expected format
- **Committed in:** 2b64a9e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correct functionality. Bug fix enables Claude integration to work. Missing critical ensures templates have unique productIds. No scope creep.

## Issues Encountered
- **Initial Claude response parsing failure:** Claude wrapped JSON in markdown code blocks. Resolved by implementing markdown stripping logic.
- **Long API response times:** Claude takes 40-60 seconds for complex template modifications. Resolved by implementing 60-second timeout with user feedback.

## User Setup Required

Users must configure AWS Bedrock credentials in `.env` file:
- `ANTHROPIC_BASE_URL` - AWS Bedrock CloudFront endpoint
- `ANTHROPIC_API_KEY` - Bedrock API key
- `ANTHROPIC_MODEL` - Model identifier (us.anthropic.claude-sonnet-4-5-20250929-v1:0)

See `.env.example` for reference format.

## Next Phase Readiness
- Natural language processing is fully functional
- Templates can be modified based on user requests like "Add a phase for Quality Check"
- Ready for Plan 02 (prompt engineering and refinement)
- Ready for future phases: testing, validation, deployment
- Blockers: None - all functionality working as expected

## Verification Results

All planned verification tests passed:

1. **API Integration Test:** ✅ PASSED
   - Sent request: "Add a new phase called Quality Check after the existing Phase"
   - Response: success=true, modifiedByAI=true, aiError=null

2. **Template Modification Test:** ✅ PASSED
   - Verified "Quality Check" phase exists in modified template
   - Phase has correct ISA-88 structure with proper parentId, level, and dataCaptureSteps

3. **End-to-End Test:** ✅ PASSED
   - UI loads correctly with updated AI messaging
   - Loading state shows "AI is modifying your template..."
   - Success message reflects AI modifications
   - Download provides correctly modified template

## Self-Check: PASSED

All claims verified:
- ✅ Created files exist (.env.example)
- ✅ Modified files exist (server.js, public/index.html, package.json)
- ✅ All task commits exist (5de269e, 2b64a9e, 59ed1ce)
- ✅ Key integrations verified (Anthropic SDK, @anthropic-ai/sdk dependency, ANTHROPIC_API_KEY)

---
*Phase: 03-natural-language-understanding*
*Completed: 2026-02-18*
