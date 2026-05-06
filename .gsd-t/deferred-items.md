# Deferred Items

Items deferred from in-flight tasks for follow-up. Each entry includes severity, source task, and proposed fix scope.


## 2026-05-06 — M50 D1 T1 Red Team deferrals

### BUG-4: Astro UI framework not auto-detected (MEDIUM)
- **Source**: Red Team report `.gsd-t/red-team-report.md`, file `bin/ui-detection.cjs`
- **Symptom**: A project with the `astro` package (or `.astro` files only) returns `hasUI:false`. Skips Playwright bootstrap.
- **Why deferred (not blocked)**: Contract `playwright-bootstrap-contract.md` §4 enumerates a fixed framework set (`react`/`vue`/`svelte`/`next`/`@angular/core`/`@vue/runtime-core`). Adding Astro requires a coordinated contract amendment. Out of scope for T1, which is meant to migrate the existing rule into code without expanding it.
- **Proposed fix**: Bump contract to v1.1.0 (additive) — add `astro` to FRAMEWORK_DEPS, add `.astro` to UI_FILE_EXTS, add `astro` flavor + fixture test.

### BUG-5: Nuxt deps not auto-detected despite `.nuxt/` being in IGNORED_DIRS (MEDIUM)
- **Source**: Red Team report `.gsd-t/red-team-report.md`
- **Symptom**: `package.json` with `dependencies: { nuxt: "^3" }` only (no `.vue` files at depth ≤3) → `hasUI:false`.
- **Why deferred**: Same reason as BUG-4 — contract amendment.
- **Proposed fix**: Bump contract to v1.1.0 (additive) — add `nuxt` (mapping to `vue` flavor or new `nuxt` flavor) to FRAMEWORK_DEPS.
