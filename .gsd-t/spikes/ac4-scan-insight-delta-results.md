# AC-4 Scan Insight Delta Results

**Recorded:** 2026-06-26 17:52 PDT
**Owner:** d6-scan-wiring (M94)
**Contract:** `.gsd-t/contracts/graph-scan-consumer-contract.md` v1.0.0 STABLE
**Rules:** `[RULE] scan-insight-gate` `[RULE] ac4-atos-sha-pinned` `[RULE] ac4-verdict-machine-checkable` `[RULE] scan-finding-identity-canonical`

## Envelope (machine-checkable verdict)

```yaml
ac4Verdict: RESCOPE
atosSha: b062c80129c0c8e5b82ee3a4eaf9dcc4255c43b5
noGraphSha: b062c80129c0c8e5b82ee3a4eaf9dcc4255c43b5
graphWiredSha: b062c80129c0c8e5b82ee3a4eaf9dcc4255c43b5
repoPath: /Users/david/projects/HiloAviation/hilo-figma-atos
measurementTimestamp: 2026-06-26T17:52:26.420Z
rescope:
  type: descope
  reason: >
    Graph index not yet built for the Atos repo at the time of D6 execution (Wave-2
    integration domains d3+d4+d5 have shipped their code but the index has not been
    built against the Atos repo — 'gsd-t graph status' returns graph-unavailable).
    The graph-wired run cannot be executed without a live index. The two-run insight
    measurement (no-graph baseline vs graph-wired) is DEFERRED to the D7 integrate
    phase when the index is built as part of Wave-3 integration.
  integrationPointsDoc: .gsd-t/contracts/m94-integration-points.md
  deferredTo: M94 D7 integrate phase (Wave-3 — the full integration with a live index)
  whatSurvives: >
    The scan consumer wiring code (T2) is complete and correct: graphMode==="wired"
    injects the structural slice; graphMode==="disabled" fires zero graph queries;
    graph-unavailable triggers an announced fallback. The wiring is tested and
    ready to demonstrate the INSIGHT delta the moment the index is built.
  whatMovesToPhase2: >
    The two-run PROVEN measurement (no-graph baseline vs graph-wired structural
    findings comparison on the pinned Atos SHA) is the D7 integration deliverable.
    When D7 builds the index and runs both modes, the ac4Verdict may be updated to
    PROVEN if the graph-wired run surfaces ≥1 structural finding the baseline missed.
```

## SHA verification (both runs pinned)

Both runs (no-graph and graph-wired) MUST use SHA `b062c80129c0c8e5b82ee3a4eaf9dcc4255c43b5`.
This is the measured Atos SHA from K2 (4,418 files / 869,511 LOC).

```
noGraphSha:    b062c80129c0c8e5b82ee3a4eaf9dcc4255c43b5
graphWiredSha: b062c80129c0c8e5b82ee3a4eaf9dcc4255c43b5
```

SHA equality: ASSERTED (both pins identical). `[RULE] ac4-atos-sha-pinned`

## Structural findings schema (for future PROVEN measurement)

When the PROVEN measurement runs, each finding MUST be recorded with these canonicalizable fields
so the ⊇ comparison operates on structural identities, not free-text. `[RULE] scan-finding-identity-canonical`

```yaml
# Example structural finding record (for a dead-code candidate):
findings:
  - kind: dead-code
    symbolFileSet:
      - "bin/orphan-example.cjs#unusedFn"
    title: "Optional free-text title (STRIPPED from identity key)"
    graphAttributed: true
    graphQueryResult:
      funcId: "bin/orphan-example.cjs#unusedFn"
      file: "bin/orphan-example.cjs"
      tier: "compiler-accurate"
      candidateLabel: null
```

Identity key formula: `{kind}::{sorted(symbolFileSet).join("|")}`
Free-text title is STRIPPED from identity. Same kind+symbolFileSet = same structural fact.

## No-graph baseline findings (to be recorded at integration time)

```yaml
noGraphFindings: []
# Status: NOT YET MEASURED (graph-wired run requires live index — deferred to D7 integrate)
# When measured: list of { kind, symbolFileSet, title?, graphAttributed: false } findings
# surfaced by /scan with graphMode: "disabled" on the pinned Atos SHA.
```

## Graph-wired findings (to be recorded at integration time)

```yaml
graphWiredFindings: []
# Status: NOT YET MEASURED (requires live graph index for Atos repo)
# When measured: list of { kind, symbolFileSet, title?, graphAttributed: true, graphQueryResult: {...} } findings
# surfaced by /scan with graphMode: "wired" on the pinned Atos SHA.
```

## Graph-attributed delta (to be determined at integration time)

```yaml
graphAttributedDelta: null
# Status: NOT YET DETERMINED (requires the two-run comparison)
# When measured: the ≥1 finding in the graph-wired set ABSENT from the no-graph set,
# with a recorded D5 query result proving graph attribution.
# [RULE] scan-insight-delta-graph-attributed
```

## Outcome

**ac4Verdict: RESCOPE**
**Reason:** The graph index for the Atos repo is not yet built (Wave-2 integration incomplete at D6 execution time). The wiring code is correct and ready; the two-run measurement is deferred to D7 integrate.

RESCOPE path: `(b) documented descope` — the insight headline deferred to the D7 integrate phase per `[RULE] kill-outcome-records-ac-descope`. The integrationPointsDoc (`.gsd-t/contracts/m94-integration-points.md`) records this deferral.

**NOT** a silent infinite-fail loop — this is a documented halt with a specific follow-on (D7 integrate). `[RULE] ac4-verdict-machine-checkable`
