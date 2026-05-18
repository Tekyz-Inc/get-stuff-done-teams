# GSD-T Workflow Diagram

Visual reference for every GSD-T command and how they connect. Generated 2026-05-08, GSD-T v3.24.10.

**Visual language** (consistent across all 6 diagrams):

| Shape / Color | Role |
|---|---|
| 🟦 Blue rectangle | GSD-T command |
| 🟪 Dashed purple rectangle | Auto-spawned subagent (qa, doc-ripple, debug-loop) |
| 🟥 Red rectangle | Quality gate (Red Team, Design Verify) |
| 🟧 Amber diamond | Decision point |
| 🟫 Pink hexagon | Smart router (`/gsd`) |
| ⬜ Oval | User input / output endpoint |
| 🟨 Cylinder | File / artifact |
| **Solid arrow** | Typical successor / auto-advance |
| **Dashed arrow** | Optional or conditional path / spawn |

The PNGs are rendered from D2 sources alongside each diagram. The Mermaid source is kept below each PNG as a fallback for environments that auto-render Mermaid (GitHub markdown).

To regenerate after editing a `.d2` source:
```sh
cd docs/diagrams
d2 --layout=elk --pad=40 NN-name.d2 NN-name.svg
# Then convert to PNG via headless Chrome (D2's native PNG export needs Playwright)
```

---

## 1. Top-Level Map — Entry Points → Lifecycle

![Top-level map](diagrams/01-top-level-map-d2.png)

```mermaid
flowchart TD
    USER([User input])

    USER --> ROUTER{{"/gsd<br/>(smart router)"}}

    ROUTER -->|"plain text<br/>(auto-route hook)"| ROUTER
    ROUTER -->|continuation| RESUME["/gsd-t-resume"]
    ROUTER -->|conversational| TALK["dialog-only<br/>no spawn"]
    ROUTER -->|workflow| ENTRY{Entry kind?}

    ENTRY -->|new greenfield| PROJ["/gsd-t-project"]
    ENTRY -->|existing repo onboard| ISS["/gsd-t-init-scan-setup"]
    ENTRY -->|new feature| FEAT["/gsd-t-feature"]
    ENTRY -->|spec vs code| GAP["/gsd-t-gap-analysis"]
    ENTRY -->|small task| QUICK["/gsd-t-quick"]
    ENTRY -->|bug| DEBUG["/gsd-t-debug"]
    ENTRY -->|design-to-code| DD["/gsd-t-design-decompose"]
    ENTRY -->|backlog idea| BADD["/gsd-t-backlog-add"]
    ENTRY -->|status check| STAT["/gsd-t-status"]

    ISS --> INIT["/gsd-t-init"]
    INIT --> SCAN["/gsd-t-scan"]
    SCAN --> SETUP["/gsd-t-setup"]
    SCAN -.->|techdebt found| PROMO["/gsd-t-promote-debt"]

    PROJ --> MILE["/gsd-t-milestone"]
    FEAT --> MILE
    GAP -.->|gaps found| MILE
    PROMO --> MILE
    BADD --> BPROMO["/gsd-t-backlog-promote"]
    BPROMO --> MILE
    BPROMO -.->|small| QUICK
    BPROMO -.->|bug| DEBUG

    MILE --> WAVE_OR_MANUAL{Auto or manual?}
    WAVE_OR_MANUAL -->|hands-off| WAVE["/gsd-t-wave<br/>(full cycle)"]
    WAVE_OR_MANUAL -->|step-by-step| PART["/gsd-t-partition"]

    DD --> DB["/gsd-t-design-build"]
    DB --> DR["/gsd-t-design-review"]
    DB -.-> DA["/gsd-t-design-audit"]

    classDef entry fill:#e1f5ff,stroke:#0288d1
    classDef milestone fill:#fff4e1,stroke:#f57c00
    classDef router fill:#f3e5f5,stroke:#7b1fa2
    class PROJ,ISS,FEAT,GAP,QUICK,DEBUG,DD,BADD,STAT entry
    class MILE,WAVE,PART milestone
    class ROUTER,ENTRY,WAVE_OR_MANUAL router
```

---

## 2. Milestone Lifecycle — The Core Workflow

This is the heart of GSD-T. Every milestone passes through these phases. `/gsd-t-wave` runs them all hands-off; manual mode advances one at a time.

![Milestone lifecycle](diagrams/02-milestone-lifecycle-d2.png)

```mermaid
flowchart TD
    MILE["/gsd-t-milestone<br/>define deliverable"]

    MILE --> PART["/gsd-t-partition<br/>milestone → domains + contracts"]
    PART -.->|complex| DISC["conversational mode<br/>(via /gsd)"]
    DISC --> PLAN

    PART --> PLAN["/gsd-t-plan<br/>atomic task lists per domain"]
    PLAN -.->|risky| IMPACT["/gsd-t-impact<br/>downstream effect analysis"]
    PLAN --> EXEC
    IMPACT --> EXEC["/gsd-t-execute<br/>run tasks (solo or team)"]

    EXEC -.->|after code| TS["/gsd-t-test-sync<br/>tests ↔ code"]
    EXEC -.->|spawned| QA["/gsd-t-qa<br/>(subagent)"]
    EXEC -.->|spawned| DR2["doc-ripple<br/>(subagent)"]
    EXEC -.->|2 fails| DBGLOOP["headless --debug-loop"]

    TS --> INTEG["/gsd-t-integrate<br/>wire domains together"]
    INTEG --> VERIFY["/gsd-t-verify<br/>quality gates"]

    VERIFY --> RT["Red Team<br/>adversarial QA"]
    VERIFY --> DV["Design Verification<br/>(if design contract)"]

    RT --> CM["/gsd-t-complete-milestone<br/>archive + git tag"]
    DV --> CM

    CM --> NEXT{More milestones?}
    NEXT -->|yes| MILE
    NEXT -->|no| DONE([Project complete])

    classDef phase fill:#e8f5e9,stroke:#388e3c
    classDef sub fill:#fff9c4,stroke:#f9a825
    classDef gate fill:#ffebee,stroke:#c62828
    class MILE,PART,PLAN,EXEC,TS,INTEG,VERIFY,CM phase
    class QA,DR2,DBGLOOP,RT,DV,DISC sub
    class IMPACT,NEXT gate
```

---

## 3. Wave Mode — Hands-Off Full Cycle

`/gsd-t-wave` chains every phase automatically. This is what runs in unattended mode.

![Wave mode](diagrams/03-wave-mode-d2.png)

```mermaid
flowchart LR
    START([wave triggered]) --> P1[partition]
    P1 --> P2[plan]
    P2 --> P3[impact]
    P3 --> P4[execute]
    P4 --> P5[test-sync]
    P5 --> P6[integrate]
    P6 --> P7[verify]
    P7 --> P8[complete-milestone]
    P8 --> END([milestone shipped])

    P4 -.spawned.-> SUB1[qa]
    P4 -.spawned.-> SUB2[doc-ripple]
    P4 -.parallel.-> PAR[parallel<br/>task dispatch]
    P7 -.gates.-> GATE1[Red Team]
    P7 -.gates.-> GATE2[Design Verify]

    classDef phase fill:#e8f5e9,stroke:#388e3c
    classDef sub fill:#fff9c4,stroke:#f9a825
    class P1,P2,P3,P4,P5,P6,P7,P8 phase
    class SUB1,SUB2,PAR,GATE1,GATE2 sub
```

---

## 4. Design-to-Code Pipeline

Triggered when user provides a Figma URL, screenshots, or "build from this design".

![Design-to-code pipeline](diagrams/04-design-to-code-d2.png)

```mermaid
flowchart TD
    REQ([Design-to-code request])

    REQ --> CHECK{Existing<br/>contracts?}
    CHECK -->|"start over"| CLEAN[clean UI assets<br/>inline]
    CHECK -->|none| DD
    CHECK -->|present| DB

    CLEAN --> DD["/gsd-t-design-decompose<br/>elements → widgets → pages"]

    DD --> DDOUT[".gsd-t/contracts/design/<br/>elements/*.contract.md<br/>widgets/*.contract.md<br/>pages/*.contract.md<br/>INDEX.md"]

    DDOUT --> DB["/gsd-t-design-build<br/>two-terminal review"]

    DB --> T1[Term 1<br/>builder]
    DB --> T2["/gsd-t-design-review<br/>Term 2 reviewer"]

    T1 <-->|review loop| T2

    T2 --> SHIP{All gates pass?}
    SHIP -->|no| T1
    SHIP -->|yes| DONE([UI shipped])

    DONE -.optional.-> DA["/gsd-t-design-audit<br/>compare built vs Figma"]

    classDef pipe fill:#e1f5ff,stroke:#0288d1
    classDef art fill:#f3e5f5,stroke:#7b1fa2
    class DD,DB,T1,T2,DA,CLEAN pipe
    class DDOUT art
```

---

## 5. Backlog Subsystem

Lightweight idea capture that feeds into the main workflow.

![Backlog subsystem](diagrams/05-backlog-d2.png)

```mermaid
flowchart LR
    IDEA([User has idea]) --> BADD["/gsd-t-backlog-add"]
    BADD --> BL[".gsd-t/backlog.md"]

    BL --> VIEW["/gsd-t-backlog-list<br/>filtered view"]
    BL --> EDIT["/gsd-t-backlog-edit"]
    BL --> MOVE["/gsd-t-backlog-move<br/>reorder priority"]
    BL --> RM["/gsd-t-backlog-remove"]
    BL --> PROMO["/gsd-t-backlog-promote"]

    PROMO --> ROUTE{Classify}
    ROUTE -->|big| MILE["/gsd-t-milestone"]
    ROUTE -->|small| QUICK["/gsd-t-quick"]
    ROUTE -->|bug| DEBUG["/gsd-t-debug"]
    ROUTE -->|feature| FEAT["/gsd-t-feature"]

    SETTINGS["/gsd-t-backlog-settings"] -.configures.-> BADD

    classDef backlog fill:#fff3e0,stroke:#ef6c00
    class BADD,VIEW,EDIT,MOVE,RM,PROMO,SETTINGS backlog
```

---

## 6. Automation, Observability & Utilities

Commands that operate alongside the main workflow rather than within it.

![Automation and utilities](diagrams/06-automation-utilities-d2.png)

```mermaid
flowchart TD
    subgraph UNATTENDED [Unattended supervision]
        UN["/gsd-t-unattended<br/>detached supervisor"]
        UNW["/gsd-t-unattended-watch<br/>live status (270s reschedule)"]
        UNS["/gsd-t-unattended-stop<br/>graceful halt"]
        UN -.feeds.-> UNW
        UNS -.signals.-> UN
    end

    subgraph OBS [Observability]
        VIZ["/gsd-t-visualize<br/>SSE + React Flow"]
        MET["/gsd-t-metrics<br/>ELO + signal dist"]
        STAT["/gsd-t-status<br/>cross-domain progress"]
        HEALTH["/gsd-t-health<br/>validate .gsd-t/"]
    end

    subgraph SESSION [Session control]
        RES["/gsd-t-resume"]
        PAUSE["/gsd-t-pause"]
        LOG["/gsd-t-log<br/>sync Decision Log"]
    end

    subgraph MAINT [Maintenance]
        VU["/gsd-t-version-update"]
        VUA["/gsd-t-version-update-all"]
        GC["/gsd-t-global-change"]
        TM["/gsd-t-triage-and-merge"]
        POP["/gsd-t-populate<br/>docs from code"]
    end

    subgraph HEAD [Headless / CI]
        HEX["headless exec"]
        HQ["headless query"]
        HDL["headless --debug-loop"]
        PAR["parallel<br/>task dispatch"]
    end

    classDef u fill:#e3f2fd,stroke:#1565c0
    classDef o fill:#f1f8e9,stroke:#558b2f
    classDef s fill:#fce4ec,stroke:#ad1457
    classDef m fill:#ede7f6,stroke:#4527a0
    classDef h fill:#fff8e1,stroke:#ff6f00
    class UN,UNW,UNS u
    class VIZ,MET,STAT,HEALTH o
    class RES,PAUSE,LOG s
    class VU,VUA,GC,TM,POP m
    class HEX,HQ,HDL,PAR h
```

---

## 7. Phase Successor Table

| Completed phase | Auto-advances to | Also available |
|-----------------|------------------|----------------|
| `project` / `feature` | `milestone` | — |
| `init` / `init-scan-setup` | `scan` / `milestone` | `setup` |
| `scan` | `promote-debt` | `milestone` |
| `gap-analysis` | `milestone` | `feature` |
| `milestone` | `partition` | `wave` (full auto) |
| `partition` | `plan` | conversational mode (if complex) |
| `plan` | `execute` | `impact` (if risky) |
| `impact` | `execute` | — |
| `execute` | `test-sync` | spawns `qa`, `doc-ripple` |
| `test-sync` | `verify` | `integrate` (multi-domain) |
| `integrate` | `verify` | — |
| `verify` | `complete-milestone` (auto) | spawns Red Team + Design Verify |
| `complete-milestone` | `status` / next milestone | — |
| `design-decompose` | `design-build` | `partition` (if domains needed) |
| `design-build` | (review loop with `design-review`) | `design-audit` |

Standalone commands (no successor): `quick`, `debug`, `status`, `help`, `resume`, `pause`, `log`, `health`, `metrics`, `visualize`, all `backlog-*`, `version-update*`, `global-change`, `triage-and-merge`, `populate`, `unattended*`.

---

## 8. Auto-Spawned Subagents

These never need manual invocation — they fire as part of code-producing phases:

| Subagent | Spawned by | Purpose |
|----------|------------|---------|
| `qa` | partition, plan, execute, verify, quick, debug, integrate, complete-milestone | Test generation + gap reporting |
| `doc-ripple` | execute, integrate, quick, debug, wave | Update downstream docs |
| Red Team | verify (after QA passes) | Adversarial bug-finding |
| Design Verification | execute Step 5.25, verify (when design contract exists) | Browser-based pixel comparison |
| `headless --debug-loop` | execute, test-sync, verify, debug, wave (after 2 failed fix attempts) | Compaction-proof fix loop |
| `parallel` | execute, wave, integrate, quick, debug (when >1 task passes gates) | Task-level parallel dispatch |

---

## 9. Source

- Canonical command list: `commands/` directory
- Per-command details: `/gsd-t-help {command}` or [commands/gsd-t-help.md](../commands/gsd-t-help.md)
- Command summaries section in help file is the source of truth — this diagram is derived from it.
