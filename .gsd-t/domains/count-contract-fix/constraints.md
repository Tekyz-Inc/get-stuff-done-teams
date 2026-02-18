# Constraints: count-contract-fix

## Rules
1. Only change count numbers and QA phase definitions — no logic changes
2. Preserve all existing content around count references
3. Match exact patterns: "42 slash commands" → "43 slash commands", "38 GSD-T" → "39 GSD-T"
4. QA test-sync section must follow the same format as other "During {Phase}" sections in gsd-t-qa.md
5. Contract updates must be consistent with command file changes
