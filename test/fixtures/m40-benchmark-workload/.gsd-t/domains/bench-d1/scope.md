# Domain: bench-d1

## Responsibility
Benchmark workload — four trivial tasks exercising parallelism (wave 0) and
sequentiality (wave 1). Not real product work; purely for measuring
orchestration overhead.

## Owned Files/Directories
- `out/*.txt` — generated artifacts
- `test/bench/*.test.js` — trivial unit tests per task
- `.gsd-t/progress.md` — Decision Log entries per task

## NOT Owned (do not modify)
- Anything outside `out/`, `test/bench/`, `.gsd-t/progress.md`
