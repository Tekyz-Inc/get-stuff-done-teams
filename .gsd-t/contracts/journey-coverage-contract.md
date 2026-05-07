# Journey Coverage Contract

- **Status**: STABLE
- **Version**: 1.0.0
- **Owner**: M52 D1 (m52-d1-journey-coverage-tooling)
- **Consumers**: M52 D2 (manifest authoring), `gsd-t check-coverage` CLI,
  `pre-commit-journey-coverage` hook, all future viewer-touching commands.

## 1. Purpose

Define the executable boundary between *what listeners exist* (detected
mechanically by `bin/journey-coverage.cjs`) and *what listeners are
journey-tested* (declared in `.gsd-t/journey-manifest.json`). The contract
exists so that uncovered viewer interactions cannot be committed.

## 2. Manifest schema (`.gsd-t/journey-manifest.json`)

```jsonc
{
  "version": "0.1.0",
  "specs": [
    {
      "name": "main-session-stream",
      "spec": "e2e/journeys/main-session-stream.spec.ts",
      "covers": [
        {
          "file": "scripts/gsd-t-transcript.html",
          "selector": "connectMain",
          "kind": "function-call"
        }
      ]
    },
    {
      "name": "splitter-keyboard",
      "spec": "e2e/journeys/splitter-keyboard.spec.ts",
      "covers": [
        {
          "file": "scripts/gsd-t-transcript.html",
          "selector": "splitter:keydown",
          "kind": "addEventListener"
        }
      ]
    }
  ]
}
```

### Field meanings

| Field          | Type     | Required | Notes |
|----------------|----------|----------|-------|
| `version`      | string   | yes      | Manifest schema version (semver). |
| `specs`        | array    | yes      | One entry per `e2e/journeys/*.spec.ts` file. |
| `specs[].name` | string   | yes      | Filename minus `.spec.ts`. Stable identifier. |
| `specs[].spec` | string   | yes      | Path relative to project root. Must resolve. |
| `specs[].covers` | array  | yes (≥1) | Listener bindings this spec asserts on. |
| `covers[].file` | string  | yes      | Path of the file containing the handler. |
| `covers[].selector` | string | yes  | `id:event` (e.g., `splitter:keydown`) or `function-name` (e.g., `connectMain`) or `class-name.method` (e.g., `KillButton.click`). |
| `covers[].kind` | string  | yes      | One of: `addEventListener`, `inline-handler`, `function-call`, `mutation-observer`, `hashchange`, `delegated`. |

## 3. Listener-pattern catalogue (what the detector recognises)

The detector emits one `Listener` per match:

```ts
interface Listener {
  file: string;
  line: number;
  selector: string; // canonical form per § 2 above
  kind: 'addEventListener' | 'inline-handler' | 'function-call'
      | 'mutation-observer' | 'hashchange' | 'delegated';
  raw: string; // matched source snippet (for diagnostics)
}
```

Patterns recognised in `scripts/gsd-t-transcript.html` and any file under
`e2e/journeys/`:

1. **Static `addEventListener`** — `<id>.addEventListener('<event>', …)`.
   Selector: `<id-or-classname>:<event>`. Regex anchor: `\.addEventListener\(\s*['"](\w+)['"]`.
2. **Inline HTML handler** — `<button onclick="fnName()">`. Selector:
   `<id>:click` if id present, else `<tag>:<event>`.
3. **Window-scoped events** — `window.addEventListener('hashchange', …)`,
   `window.addEventListener('scroll', …)`, etc. Selector:
   `window:<event>`. Special kind `hashchange` for that one event because
   it has its own journey spec.
4. **Function-call entry points** — top-level functions wired by the page
   (`connectMain`, `connect`, etc.) detected by definition + at-least-one
   call site. Selector: `<function-name>`.
5. **MutationObserver** — `new MutationObserver(...)`. Selector:
   `mutation-observer:<unique-id>`.
6. **Delegated handlers** — `<root>.addEventListener('click', e => { if
   (e.target.matches(...)) … })`. The detector records this as `delegated`
   plus the matches selector if statically extractable.

Detector ignores (not flagged as gaps):
- `if (!el.addEventListener) return;` — feature-detect guards (no actual binding).
- `// eslint-disable` comments naming an exempt selector.
- Anything inside `e2e/viewer/*.spec.ts` (M50/M51 scope, not M52's surface).

## 4. Gap rules (when the gate blocks)

The hook (`pre-commit-journey-coverage`) blocks the commit iff **all** are true:

1. Staged files (`git diff --cached --name-only`) include at least one of:
   - `scripts/gsd-t-transcript.html`
   - `scripts/gsd-t-dashboard-server.js`
   - `bin/gsd-t-dashboard*.cjs`
   - any file under `e2e/journeys/` or `e2e/viewer/`.
2. `bin/journey-coverage-cli.cjs --staged-only` reports at least one gap.

A "gap" is a detected `Listener` whose `selector` + `file` does not appear
in any manifest entry's `covers[]`. Extra manifest entries pointing at
non-existent listeners are reported as **stale entries** (also exit 4).

## 5. CLI surface (`gsd-t check-coverage`)

```
Usage: gsd-t check-coverage [--staged-only] [--manifest PATH] [--quiet]

Exit codes:
  0  All detected listeners covered. Manifest fresh.
  4  Coverage gap or stale manifest entry.
  2  Manifest missing or unreadable (fail-closed).

Stdout (exit 0): nothing in --quiet, otherwise a one-line "OK: N listeners,
  N specs" summary.

Stderr (exit 4): a structured gap report — one line per gap:
  GAP: <file>:<line>  <selector>  (<kind>)  no spec covers this
  STALE: spec=<name>  covers <file> selector=<selector>  no such listener
```

## 6. Hook contract (`scripts/hooks/pre-commit-journey-coverage`)

- Mode 0755, `#!/usr/bin/env bash`, `set -e`.
- Marker block delimiter (matches M50 idiom):
  `# >>> GSD-T journey-coverage gate >>>` … `# <<< GSD-T journey-coverage gate <<<`.
- Runs `node bin/journey-coverage-cli.cjs --staged-only` only when the
  staged-file pattern matches (see §4); otherwise silent pass.
- Fail-open on detector internal exception (stderr warning, exit 0). M50
  precedent: the gate exists to catch real drift, not to break the workflow
  on its own bug.

## 7. Installation contract (`bin/gsd-t.js::installJourneyCoverageHook`)

- Idempotent (re-runs are no-ops if marker block is already present).
- Called automatically by `gsd-t install` and `gsd-t update`.
- Manually re-installable via `gsd-t doctor --install-journey-hook`.
- If `.git/hooks/pre-commit` doesn't exist: copy the stock script verbatim.
- If it exists: append the marker-delimited block. Never overwrite the
  existing hook body.

## 8. Versioning + breaking changes

- **0.1.0 → 0.2.0**: any change to `Listener.kind` enum, manifest field
  rename, or hook block-marker rename. Bumps require a `gsd-t doctor
  --reinstall-journey-hook` advisory in the corresponding CHANGELOG entry.
- **0.1.0 → 1.0.0**: locked when D1 + D2 land, all 12 inaugural specs are
  green, and the M52 verify pass shows zero gaps.

## 9. Out of scope (intentionally NOT in this contract)

- Auto-generating spec bodies from detected listeners. M52 § Non-goals
  rules this out.
- Coverage of unit-test-level handler invocations. This contract is
  E2E-only.
- Coverage of the dashboard server's HTTP routes. Server-side route
  coverage is tracked under M44 task-graph contracts, not this one.
