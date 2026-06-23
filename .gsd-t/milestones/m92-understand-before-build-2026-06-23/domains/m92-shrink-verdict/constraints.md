# Constraints: m92-shrink-verdict (M92 D2)

- Zero external runtime deps; the shrink-metric is pure numstat parsing; never throws (bad input → exit 64).
- ADDITIVE-NOT-REPLACE: do NOT remove or repurpose `overallVerdict` or its 3-enum — add `shrink` as a sibling dimension. (Replacing it would be the exact additive-pipeline trap M92 fixes, AND would break every existing verify test.)
- MEASURED not attested: leanness comes from `git diff --numstat`, never an LLM judgment ([[feedback_measure_dont_claim]]).
- M71 sandbox: the workflow must NOT use require/fs/path/child_process/process — the git call goes through the `runCli` inline-agent Bash helper. M85: the metric call's model literal = `haiku` (mechanical), policy-conformant.
- Absent diff base → logged skip-with-reason, never a fabricated metric ([[feedback_no_silent_degradation]]).
- File-disjoint from D1 (arch-trigger) and D3 (command prompts + quick.workflow). D2 is the SOLE editor of `verify.workflow.js`.
