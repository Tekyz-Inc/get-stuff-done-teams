# Domain: bench-d4

## Responsibility
Benchmark workload — five tasks across 3 waves measuring orchestration
overhead. One of four identical-shape domains (bench-d1…bench-d4).

## Owned Files/Directories
- `out/d4-*.txt` — generated artifacts scoped to this domain
- `test/bench/d4-*.test.js` — per-task unit tests scoped to this domain
- `.gsd-t/progress.md` — Decision Log entries per task

## NOT Owned (do not modify)
- Other domains' `out/d1-*`, `out/d2-*`, `out/d3-*` artifacts or tests
- Anything outside `out/`, `test/bench/`, `.gsd-t/progress.md`
