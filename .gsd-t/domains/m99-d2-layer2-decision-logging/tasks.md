# Tasks: m99-d2-layer2-decision-logging

## Files Owned
- scripts/gsd-t-graph-intercept.js
- scripts/gsd-t-read-intercept.js
- templates/workflows/gsd-t-scan.workflow.js
- templates/workflows/gsd-t-verify.workflow.js
- templates/workflows/gsd-t-debug.workflow.js
- templates/workflows/gsd-t-integrate.workflow.js
- templates/workflows/gsd-t-quick.workflow.js
- templates/workflows/gsd-t-phase.workflow.js
- test/m99-layer2-decision-logging.test.js
- test/m99-wiring-mode.test.js

### M99-D2-T1
**What:** Repoint `scripts/gsd-t-graph-intercept.js` presence check (:69) at D1's resolver; add Layer-2a logging `{kind:'grep', classified, action, patternShape, consumer}` per decision (incl. text passthrough) via `append_ledger_line`. Fail-open, byte-identical on/off, classify logic unchanged.
**Touches:** scripts/gsd-t-graph-intercept.js

### M99-D2-T2
**What:** Repoint `scripts/gsd-t-read-intercept.js` presence check (:74) + `Database(...)` open (:108) at D1's resolver; add Layer-2b logging `{kind:'read', action, file, consumer}` per augment/passthrough. Never-shrink KEPT, fail-open, byte-identical on/off.
**Touches:** scripts/gsd-t-read-intercept.js

### M99-D2-T3
**What:** Add the consumer preamble to all 6 workflows: set `GSDT_GRAPH_CONSUMER` to the workflow name + probe-and-persist `graphWiringMode` (WIRED|fallback-announced|disabled) into the ledger.
**Touches:** templates/workflows/gsd-t-scan.workflow.js, gsd-t-verify.workflow.js, gsd-t-debug.workflow.js, gsd-t-integrate.workflow.js, gsd-t-quick.workflow.js, gsd-t-phase.workflow.js

### M99-D2-T4
**What:** Stamp the wiring mode into the scan report header (the NiceNote north-star).
**Touches:** templates/workflows/gsd-t-scan.workflow.js

### M99-D2-T5
**What:** Write the 2 owned tests: one-line-per-decision (grep + read) + byte-identical on/off; per-consumer wiring-mode persistence + scan-header stamp.
**Touches:** test/m99-layer2-decision-logging.test.js, test/m99-wiring-mode.test.js
