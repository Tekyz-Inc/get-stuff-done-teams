# Tasks: m86-d4-surfacing-and-doc-ripple

## Files Owned

- `scripts/gsd-t-auto-route.js`
- `scripts/gsd-t-statusline.js`
- `commands/gsd-t-status.md`
- `commands/gsd-t-help.md`
- `README.md`
- `GSD-T-README.md`
- `templates/CLAUDE-global.md`
- `CLAUDE.md`
- `package.json`

---

### M86-D4-T1 — Banner surfacing
**Touches:** `scripts/gsd-t-auto-route.js`
Resolve the active profile via D1's config-read/resolver and add it to the `[GSD-T ...]` banner
token line (named; global-default named when config absent — SC(f)). Do NOT alter the
`[GSD-T NOW]` timestamp format (date-guard dependency).

### M86-D4-T2 — Statusline surfacing
**Touches:** `scripts/gsd-t-statusline.js`
Show the active profile in the statusline (named).

### M86-D4-T3 — status command rendering
**Touches:** `commands/gsd-t-status.md`
Describe the new active-profile line in `gsd-t status` (named choice, never implicit — SC(f)).

### M86-D4-T4 — help entry
**Touches:** `commands/gsd-t-help.md`
Add the `gsd-t model-profile [standard|pro|premium]` / `set-stage` / `--json` entry.

### M86-D4-T5 — README + GSD-T-README doc-ripple
**Touches:** `README.md`, `GSD-T-README.md`
README: commands table row + a Profiles section (3-profile spend table, per-stage override,
per-project `.gsd-t/model-profile.json`, out-of-scope note re `/model`). GSD-T-README: Profiles
documentation.

### M86-D4-T6 — CLAUDE template + project doc-ripple
**Touches:** `templates/CLAUDE-global.md`, `CLAUDE.md`
CLAUDE-global: model-tier/profile section update. Project CLAUDE.md: M85/M86 section describing
the profile dimension + invoke-time injection. FLAG (do not write) the live `~/.claude/CLAUDE.md`
mirror for the user — surface the diff at completion.

### M86-D4-T7 — version bump
**Touches:** `package.json`
Minor bump 4.4.10 → 4.5.10 (new feature; patch reset to two-digit 10).

---

## Acceptance bindings (this domain)

- SC(f) no silent degradation: T1+T2+T3 — active profile NAMED in banner/statusline/status,
  global-default named when config absent.
- Doc completeness for the new `model-profile` command surface (Document Ripple gate).
