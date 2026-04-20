# Constraints: d2-task-brief-builder

## Must Follow
- Zero external npm deps.
- Brief is a pure function of inputs: same inputs → byte-identical output (for cacheability and reproducibility).
- Size budget 2–5 KB. Enforce at build time; throw if compactor can't meet budget without dropping the task statement or done-signal (those are non-droppable).
- Every brief includes the D3 completion-signal checklist verbatim from contract. No paraphrasing.
- Every brief sets an explicit expected branch. Worker running on wrong branch must see this in its prompt and self-correct before any tool call.

## Must Not
- Inline an entire contract file. Excerpt only the sections the task touches.
- Read files outside `.gsd-t/`, `CLAUDE.md`, and `templates/stacks/` at brief-build time. (Worker will read code at run-time; brief ≠ full repo context.)
- Interpolate user-provided text into the brief without escaping. Tasks.md lines are trusted (internal), but defense-in-depth: treat every interpolation point as untrusted.
- Emit a brief that tells the worker to "ask the user" or pause. Workers run unattended under `-p`; no interactive prompts.

## Must Read Before Using
- `bin/rule-engine.js` — stack-rules injector. D2 calls its existing entry point; does not reimplement detection.
- `templates/prompts/*-subagent.md` — pattern reference for prompt shape (QA, red-team, design-verify). D2 prompts differ (one-shot task workers) but follow similar discipline.
- `.gsd-t/contracts/completion-signal-contract.md` (D3).
- `.gsd-t/contracts/task-brief-contract.md` (D2 owner — writes it).

## Dependencies
- Depends on: D3 (completion-signal contract — excerpted into every brief).
- Depended on by: D1 (orchestrator-worker calls `buildTaskBrief` before spawn), D0 (benchmark needs a real brief to be representative).
