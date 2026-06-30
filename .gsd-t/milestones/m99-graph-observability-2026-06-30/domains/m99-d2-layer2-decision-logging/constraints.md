# Constraints: m99-d2-layer2-decision-logging

## Hard rules
- **[RULE] import-resolver-never-hardcode** — D2 imports `resolveStorePath` / `resolveLogsDir` / `append_ledger_line` from D1's `bin/gsd-t-graph-store-resolver.cjs`. It NEVER contains a raw `.gsd-t/graph.db` or `.gsd-t/graphDB/` literal (would re-break the M96 split-brain). Subject to D1's `no-raw-literals` grep proof.
- **[RULE] presence-check-repointed** — Both intercepts' `fs.existsSync(...graph.db)` presence checks (intercept :69, read-intercept :74) AND the read-intercept's `Database(...)` open (:108) MUST point at the resolver's new path. A missed repoint = the hook silently disables after migration (the failure this milestone exists to prevent).
- **[RULE] byte-identical-on-off** — The classify decision (grep) and the augment-vs-passthrough decision (read) are BYTE-IDENTICAL with `GSDT_GRAPH_TELEMETRY` on vs off. Logging is a pure side-channel; it never alters which path is taken.
- **[RULE] augment-never-shrink-kept** — The read-intercept default is pass-through; an augment only ADDS a pointer, never shrinks the read. KEPT from M98 (no Divergence).
- **[RULE] fail-open** — A ledger write that throws never blocks or alters a grep result or a read result.
- **[RULE] wiring-mode-three-states** — `graphWiringMode` is exactly one of `WIRED` | `fallback-announced` | `disabled`. An announced fallback beside a same-window `outcome:hit` is the machine-visible NiceNote signal — scan stamps it into the report header.

## Do NOT
- Do NOT touch any `bin/` file — D1 (resolver/producers) and D3 (gsd-t.js/rollup) own those.
- Do NOT redefine the resolver or the sink — import them.
- Do NOT change the contract — D3 owns it.
- Do NOT alter the classify or augment LOGIC — only ADD the logging side-channel.

## Sequencing
Runs in Wave 2, AFTER D1's resolver lands (D2 imports it). File-disjoint from D3 — owns only `scripts/*.js` + the 6 workflow `*.js`; touches no `bin/gsd-t.js`, no rollup, no contract.
