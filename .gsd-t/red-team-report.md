# Red Team Report — M50 D1 Task 1: `bin/ui-detection.cjs`

**Date**: 2026-05-06
**Target**: `bin/ui-detection.cjs` + `test/m50-d1-ui-detection.test.js`
**Contract**: `.gsd-t/contracts/playwright-bootstrap-contract.md` §4 (v1.0.0)
**Methodology**: Source review + targeted Node.js adversarial probes (50+ scenarios)

---

## VERDICT: FAIL — 7 bugs found

Severity breakdown: **0 CRITICAL · 2 HIGH · 3 MEDIUM · 2 LOW**

The code never throws (key safety invariant ✅), the depth bound is correctly enforced (BFS terminates safely on symlink loops ✅), and the `hasUI`/`detectUIFlavor` symmetry holds for every probed input ✅. But the implementation diverges from the contract on dot-directory handling, mishandles directory-vs-file ambiguity for sentinel files, and leaves three real-world UI ecosystems silently undetected.

---

## BUGS

### BUG-1 — `pubspec.yaml` and `tailwind.config.{js,ts}` as DIRECTORIES yield false positives
**Severity**: HIGH

- **Reproduction**: Create a project with a directory (not file) named `pubspec.yaml` and nothing else. Call `hasUI(dir)`.
- **Expected**: `false` — Flutter requires `pubspec.yaml` to be a YAML file, not a directory. A directory with that name is meaningless.
- **Actual**: `hasUI` returns `true`, `detectUIFlavor` returns `"flutter"`. Same bug for `tailwind.config.js` as a directory → `"css-only"` flavor.
- **Root cause**: `_hasFlutter`/`_hasTailwindConfig` use `fs.existsSync()`, which returns `true` for directories too.
- **Proof** (from `/tmp/redteam-probe.cjs` run):
  ```
  ["pubspec-as-directory", "OK", '{"hasUI":true,"flavor":"flutter"}']
  ["tailwind-as-directory", "OK", '{"hasUI":true,"flavor":"css-only"}']
  ```
- **Fix**: Use `fs.statSync(p, {throwIfNoEntry: false})?.isFile()` instead of `existsSync`.

### BUG-2 — Dot-directory exclusion exceeds contract; silently drops `.storybook`, `.config`, `.husky`, etc.
**Severity**: HIGH (contract violation)

- **Reproduction**: Project with `.storybook/main.tsx` and no other UI signals.
  ```
  ["dot-storybook-excluded-impl-but-not-contract", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected per contract §4**: The exclusion list is exhaustive — `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `coverage/`, `.gsd-t/`. A `.tsx` inside `.storybook/` should match.
- **Actual**: Impl line `if (name.startsWith(".") && name !== ".") continue;` skips ALL dot-named directories indiscriminately. `.storybook/` (Storybook config — common in React/Vue UI projects), `.config/`, `.husky/`, `.devcontainer/` — all silently invisible.
- **Why this matters in practice**: A project that uses Storybook for UI components only and houses them under `.storybook/` would be flagged as no-UI, skipping Playwright bootstrap.
- **Fix**: Drop the dot-prefix shortcut and rely solely on the explicit `IGNORED_DIRS` set defined by the contract. Or: amend the contract to explicitly say "all dot-prefixed dirs are excluded".

### BUG-3 — `tailwind.config.mjs` not detected
**Severity**: MEDIUM

- **Reproduction**:
  ```
  ["tailwind-mjs-not-detected", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected**: Modern Tailwind v3+ projects using ESM commonly use `tailwind.config.mjs`. The contract is technically silent on `.mjs`, but the spirit of "Tailwind config exists" is missed.
- **Actual**: Only `.js` and `.ts` are checked.
- **Fix**: Add `tailwind.config.mjs` and `tailwind.config.cjs` to the lookup set, OR amend the contract to lock the supported extensions.
- **Contract impact**: Either fix code or update contract §4 list — they currently agree on `.js`/`.ts` only, but real-world miss is real.

### BUG-4 — Astro projects undetected
**Severity**: MEDIUM (false negative for popular UI framework)

- **Reproduction**: Project with `src/Page.astro` and a server-only `package.json`.
  ```
  ["astro-not-detected", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected**: Astro is a major UI meta-framework. Either the `astro` package or `.astro` files should trigger `hasUI=true`.
- **Actual**: Neither checked.
- **Contract impact**: §4 enumeration is incomplete vs. current ecosystem. Either add `astro` to `FRAMEWORK_DEPS` and `.astro` to `UI_FILE_EXTS`, or document the gap as accepted.

### BUG-5 — Nuxt projects undetected (despite `.nuxt/` being in IGNORED_DIRS)
**Severity**: MEDIUM (internal inconsistency — contract knows about Nuxt build dir but not Nuxt deps)

- **Reproduction**: `package.json` with `dependencies: { nuxt: "^3" }` only.
  ```
  ["nuxt-not-in-list", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected**: Nuxt is the Vue meta-framework analog of Next. The contract excludes `.nuxt/` build output, so it's clearly aware Nuxt exists, but doesn't include it in framework detection.
- **Actual**: Falls through to file walk; if no `.vue` files are at depth ≤3, project is misclassified as no-UI.
- **Fix**: Add `nuxt` (and `@nuxt/kit`) to `FRAMEWORK_DEPS` mapping to flavor `"vue"` (or introduce a `"nuxt"` flavor).

### BUG-6 — Test-suite gap: no test asserts symlink safety, perm-denied, or directory-as-sentinel-file
**Severity**: LOW (test gap, not impl bug — but flags a regression risk)

- **Reproduction**: `test/m50-d1-ui-detection.test.js` covers 12 scenarios; none cover (a) symlink loops, (b) `EACCES` subdirectories, (c) sentinel files that are directories. The probe-script confirms BUG-1 lives unguarded.
- **Expected**: Per contract §9 ("every export, every package-manager path, idempotent re-run, and each error path"), error-path coverage should include filesystem error cases.
- **Actual**: Filesystem error handling is implicit — caught by the `catch` in `_findUIFileWithinDepth` but never asserted as a behavior.
- **Fix**: Add three regression tests: symlink loop terminates, `chmod 000` subdir does not propagate to a throw, directory named `pubspec.yaml` does not yield `flutter` (will fail until BUG-1 fixed — confirming the bug).

### BUG-7 — `peerDependencies` ignored
**Severity**: LOW (judgment call; contract §4 explicitly limits to dependencies/devDependencies)

- **Reproduction**:
  ```
  ["peer-only", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected per contract**: Correctly ignored — contract §4 enumerates `dependencies` and `devDependencies` only.
- **Actual**: Matches contract.
- **Why this is here**: Component-library packages routinely declare `react` only in `peerDependencies` (so consumers provide it). Such a library-author repo is genuinely not a UI app — the contract decision is defensible. Flagging as LOW only because real-world surface that LOOKS like a UI lib but won't auto-bootstrap Playwright. **No code change recommended** — leave as-is, but call out the deliberate design choice in a comment so future maintainers don't "fix" it.

---

## Attack Categories Exhausted

| Category | Result |
|----------|--------|
| Path traversal / null bytes / non-string types | Robust — never throws, returns `false`/`null` for null, undefined, number, array, object, boolean, Symbol, function |
| Filesystem edges: symlink loops, perm-denied, EMFILE | Symlink loops bounded (Dirent.isDirectory()=false for symlinks → not traversed); perm-denied subdir caught; depth bound enforced |
| Type confusion in package.json: deps as array/string/null/number; whole pkg as array/null/number; `react: false/null/0/""` | All handled safely via `Object.assign({}, ...)` and JS truthiness — `react: false` returns `hasUI:false` (correct) |
| Performance: 5000-file directory at depth 1 | 6ms — acceptable. Short-circuit on first `.css` match works |
| Detection accuracy: false positives | **2 found** (BUG-1: pubspec/tailwind as directory) |
| Detection accuracy: false negatives | **3 found** (BUG-2: dot-dirs incl. `.storybook`; BUG-3: `tailwind.config.mjs`; BUG-4: `.astro` files; BUG-5: Nuxt deps) |
| Spec gaps vs contract: depth count semantics | Verified — root=depth 0, files at depth 3 detected, files at depth 4 not. Test fixture `a/b/c/d/component.tsx` correctly expected `false`. Contract wording "within depth 3" is consistent with impl |
| Spec gaps: ignored-dir enumeration vs impl | **Mismatch found** (BUG-2: impl skips all dot-prefixed, contract enumerates 8 explicit dirs) |
| `detectUIFlavor` ↔ `hasUI` symmetry: `null` ⇔ `hasUI=false` | Verified across ALL probes — symmetric. No input breaks the contract |
| Mixed-case extension `.TSX` | Detected (lowercased in impl) |
| Empty `package.json` (zero bytes) | Falls through to file walk safely |
| Empty `pubspec.yaml` (zero bytes) | Detected as flutter — correct per contract |
| Files without extensions / dotfiles named `.css` | Not detected (`path.extname` returns "" for dotfiles) — correct per contract |

## Coverage Gaps

- `peerDependencies` handling not asserted in tests (contract-defensive, BUG-7)
- Symlink behavior not tested (BUG-6)
- Permission-denied subdir not tested (BUG-6)
- Sentinel-as-directory not tested (BUG-6 → BUG-1 fix needs test)

## Shallow Tests Rewritten
0 — all 12 existing tests are functional (verify state changes, not just element existence).

## Contracts Verified
1/1 — `playwright-bootstrap-contract.md` §4 was the only relevant section. 2 deviations found (BUG-1 false positive on directory sentinels, BUG-2 dot-dir over-exclusion).

---

## Recommended Fix Priorities

1. **HIGH** — BUG-1: Switch `_hasFlutter`/`_hasTailwindConfig` to use `statSync().isFile()`. Tiny, safe, contract-aligned.
2. **HIGH** — BUG-2: Either remove the `name.startsWith(".")` shortcut (rely only on `IGNORED_DIRS`), or amend contract §4 to explicitly say "all dot-prefixed directories are also excluded". Pick one — currently contract and impl disagree.
3. **MEDIUM** — BUG-3, BUG-4, BUG-5: Add `tailwind.config.mjs`/`.cjs`, `astro` package + `.astro` extension, and `nuxt` package. Coordinate with contract update.
4. **LOW** — BUG-6: Add 3 regression tests covering symlink loop, perm-denied, sentinel-as-directory.

---

**Probe scripts retained at**: `/tmp/redteam-probe.cjs`, `/tmp/redteam-probe2.cjs`
