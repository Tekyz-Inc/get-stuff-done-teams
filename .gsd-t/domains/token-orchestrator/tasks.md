# Domain: token-orchestrator — Tasks

## Task 1: Create token budget module (bin/token-budget.js)
**Files**: `bin/token-budget.js`
**Scope**: Implement estimateCost(), getSessionStatus(), recordUsage(), getDegradationActions(), estimateMilestoneCost(), getModelCostRatios(). Reads token-log.md for historical averages. Graduated degradation at 60/70/85/95% thresholds. Model cost ratios: haiku=1, sonnet=5, opus=25. Node.js built-ins only.
**Contract**: token-budget-contract.md (API + degradation thresholds + model override rules)
**Tests**: Unit tests in test/token-budget.test.js

## Task 2: Write unit tests for token budget module
**Files**: `test/token-budget.test.js`
**Scope**: Test all exported functions: estimateCost with different models/task types, getSessionStatus at each threshold, getDegradationActions returns correct actions per threshold, estimateMilestoneCost feasibility check, model cost ratios. Use tmp directories for test isolation.
**Contract**: token-budget-contract.md
**Depends on**: Task 1
