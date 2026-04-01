# Domain: qa-calibrator — Tasks

## Task 1: Create QA calibrator module (bin/qa-calibrator.js)
**Files**: `bin/qa-calibrator.js`
**Scope**: Implement logMiss(), getCategoryMissRates(), getWeakSpots(), generateQAInjection(), getPersistentWeakSpots(). Reads/writes qa-miss-log.jsonl using Node.js built-ins only. Weak spot threshold: >30% miss rate. Damping: persistent weak spots require 3+ consecutive milestones. generateQAInjection() returns markdown text for QA prompt injection or empty string if no weak spots.
**Contract**: qa-calibration-contract.md (miss log schema + calibrator API + injection format)
**Tests**: Unit tests in test/qa-calibrator.test.js

## Task 2: Write unit tests for QA calibrator
**Files**: `test/qa-calibrator.test.js`
**Scope**: Test all exported functions: logMiss writes correct JSONL, getCategoryMissRates computes correctly across multiple milestones, getWeakSpots filters at >30%, generateQAInjection produces valid markdown, getPersistentWeakSpots requires 3+ consecutive milestones. Use tmp directories for test isolation.
**Contract**: qa-calibration-contract.md
**Depends on**: Task 1
