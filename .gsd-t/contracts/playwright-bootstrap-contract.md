# Contract: playwright-bootstrap-contract

**Version**: 1.0.0
**Status**: PROPOSED — M50 D1
**Owner**: m50-bootstrap-and-detection
**Consumers**: m50-gates-and-specs (spawn-gate); `bin/gsd-t.js` (init / update-all / doctor / setup-playwright); future GSD-T commands that need to verify Playwright readiness.

---

## 1. Purpose

Convert the prose-only "Playwright Readiness Guard" in `~/.claude/CLAUDE.md` into a small, deterministic, zero-runtime-dep library that any caller can invoke to (a) detect whether a project has UI, (b) detect whether it has Playwright configured, and (c) install Playwright if needed. The functions are the single source of truth used by `init`, `update-all`, `doctor`, the spawn-gate, the `setup-playwright` subcommand, and any future enforcement layer.

## 2. Module Layout

| Module | Path | Exports |
|--------|------|---------|
| Playwright bootstrap | `bin/playwright-bootstrap.cjs` | `hasPlaywright`, `detectPackageManager`, `installPlaywright`, `verifyPlaywrightHealth` |
| UI detection | `bin/ui-detection.cjs` | `hasUI`, `detectUIFlavor` |

Both are CommonJS (`.cjs`) per the existing GSD-T convention for `bin/*.cjs` modules consumed by hooks and the headless-auto-spawn primitive (see `bin/headless-auto-spawn.cjs`, `bin/handoff-lock.cjs`, `bin/gsd-t-token-capture.cjs`). Zero external runtime dependencies — Node.js built-ins (`fs`, `path`, `child_process`) only.

## 3. API — `bin/playwright-bootstrap.cjs`

### `hasPlaywright(projectDir: string): boolean`

Returns `true` iff the project has a Playwright config file at the root.

| Detected file | Recognized |
|---------------|-----------|
| `playwright.config.ts` | yes |
| `playwright.config.js` | yes |
| `playwright.config.mjs` | yes |

Synchronous, never throws. Migrates the existing inline implementation at `bin/gsd-t.js:201-204` verbatim — `bin/gsd-t.js` then `require()`s from this module and re-exports for backward-compat.

### `detectPackageManager(projectDir: string): 'npm' | 'pnpm' | 'yarn' | 'bun'`

Returns the package manager indicated by the lockfile present at the project root. Precedence (first match wins): `pnpm-lock.yaml` → `pnpm`; `yarn.lock` → `yarn`; `bun.lockb` → `bun`; otherwise `npm`. Synchronous, never throws.

### `installPlaywright(projectDir: string): Promise<{ok: true} | {ok: false, err: string, hint?: string}>`

Idempotent. Steps in order:
1. If `hasPlaywright(projectDir)` returns `true`, short-circuit with `{ok: true}` (no work).
2. Resolve the package manager via `detectPackageManager(projectDir)`.
3. Install `@playwright/test` as a devDependency (`npm install -D` / `pnpm add -D` / `yarn add -D` / `bun add -d`).
4. Install the chromium browser binary: `npx playwright install chromium` (uses the project's local `npx` resolution; works under any package manager).
5. Write `playwright.config.ts` if it does not already exist (template below).
6. Create `e2e/` directory with a placeholder spec (`e2e/__placeholder.spec.ts` — empty `test.skip`) so test discovery does not fail on a fresh install.

On any non-zero subprocess exit, return `{ok: false, err: <stderr-string>, hint: 'Run gsd-t doctor --install-playwright to retry'}`.

### `verifyPlaywrightHealth(projectDir: string): Promise<{ok: boolean, version?: string, error?: string}>`

Runs `npx playwright --version` from `projectDir` with a 5-second timeout. Returns the parsed version on success. Used by `gsd-t doctor` to surface "playwright installed but broken" cases (e.g., chromium missing, version mismatch).

## 4. API — `bin/ui-detection.cjs`

### `hasUI(projectDir: string): boolean`

Returns `true` iff the project has any UI signal. Order of probes (first hit wins, short-circuit):

1. `package.json` `dependencies` or `devDependencies` includes any of: `react`, `vue`, `svelte`, `next`, `@angular/core`, `@vue/runtime-core`.
2. `pubspec.yaml` exists at project root (Flutter).
3. `tailwind.config.js` or `tailwind.config.ts` exists.
4. Any `.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, or `.scss` file exists within depth 3 of the project root, excluding `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `coverage/`, `.gsd-t/`.

Synchronous, depth-bounded (max 3 levels), short-circuits on first hit. Never throws — returns `false` on filesystem errors.

### `detectUIFlavor(projectDir: string): 'react' | 'vue' | 'svelte' | 'next' | 'angular' | 'flutter' | 'css-only' | null`

Returns a more specific category. `null` when `hasUI(projectDir)` would return `false`. Used by D2's spawn-gate banner to give a tighter "we detected {flavor} UI" message.

## 5. CLI Wiring

D1 wires the library into the existing `bin/gsd-t.js` surface:

| Subcommand | Behavior |
|-----------|----------|
| `gsd-t init` | After `initGsdtDir` returns, if `hasUI(cwd) && !hasPlaywright(cwd)`, call `installPlaywright(cwd)`. Report success/failure inline. |
| `gsd-t update-all` | `checkProjectHealth` continues to populate `playwrightMissing[]`, but D1 now triggers an install for each entry where `hasUI` is true. The summary line reports `Auto-installed Playwright in: {N} project(s)`. |
| `gsd-t doctor` | Continues to warn when missing; new flag `--install-playwright` triggers `installPlaywright(cwd)` directly. New flag `--install-hooks` is reserved for D2's pre-commit hook installer. |
| `gsd-t setup-playwright` | NEW subcommand. Wraps `installPlaywright(cwd)` with verbose output — for users who want to bootstrap Playwright explicitly without running another GSD-T workflow. |

## 6. Default `playwright.config.ts` Template

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // webServer is intentionally omitted — projects manage their own server lifecycle.
});
```

## 7. Idempotency Invariants

- `installPlaywright(p)` called twice in succession on the same project: second call returns `{ok: true}` without invoking the package manager.
- `installPlaywright(p)` does NOT overwrite an existing `playwright.config.ts`. If the file exists, the function leaves it alone (operator's customizations are preserved).
- `installPlaywright(p)` does NOT overwrite an existing `e2e/` directory. Only creates the placeholder spec when the directory is absent or empty.

## 8. Error-Path Contract

| Failure | `installPlaywright` returns | Caller behavior |
|--------|--------------------------|-----------------|
| Package manager not on PATH | `{ok: false, err: 'package-manager-not-found', hint: '...'}` | CLI: log and exit 1. Spawn-gate: `mode: 'blocked-needs-human'`, exit 4. |
| Network failure (npm registry) | `{ok: false, err: <stderr>, hint: '...'}` | Same as above. |
| Chromium download failure | `{ok: false, err: <stderr>, hint: 'Run npx playwright install chromium manually'}` | Partial install: `@playwright/test` is installed but chromium isn't. CLI: log warning, exit 1. Spawn-gate: blocked. |
| Disk write failure | `{ok: false, err: <stderr>, hint: 'Check filesystem permissions'}` | Same as above. |

## 9. Testing Surface

D1 ships unit tests that cover every export, every package-manager path, idempotent re-run, and each error path. D2 adds integration tests that wire the spawn-gate end-to-end (UI fixture project + Playwright-missing → spawn triggers install → install succeeds → spawn proceeds).

## 10. Version History

- **v1.0.0** (M50 D1, 2026-05-06): Initial proposed contract — extraction of the prose-only Playwright Readiness Guard into executable library + CLI wiring.

---

> When this contract is the source-of-truth for an existing prose rule, the rule itself becomes a one-line referral to this contract. See M50 doc-ripple in `commands/gsd-t-execute.md`, `~/.claude/CLAUDE.md`, etc.
