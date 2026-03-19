# PRD: Graph Engine — Native Indexer + CGC Integration

## Document Info
| Field | Value |
|-------|-------|
| **PRD ID** | PRD-GRAPH-001 |
| **Date** | 2026-03-18 |
| **Author** | GSD-T Team |
| **Status** | DRAFT |
| **Milestones** | M20 (Graph Abstraction + Indexer + CGC), M21 (Graph-Powered Commands) |
| **Version Target** | 2.37.10 (M20), 2.38.10 (M21) |
| **Priority** | P0 — foundational for all future enhancements |
| **Predecessor** | M19 (Shared Service Detection v2.35.10) |
| **Successor** | Scan self-validation, then GSD 2 milestones (M22+) |

---

## 1. Problem Statement

GSD-T currently uses grep-based analysis (`grep -r "import.*{module}"`) for all code structure understanding. This approach:

1. **Cannot trace transitive call chains** — grep finds direct imports but not "A calls B which calls C which modifies D"
2. **Cannot distinguish same-named functions** in different contexts — `getUser()` in auth-service vs `getUser()` in user-service
3. **Cannot persist relationships across commands** — each command re-discovers the same code relationships from scratch
4. **Cannot detect semantic duplication** — copy-paste-rename code escapes text-matching entirely
5. **Cannot map code entities to GSD-T concepts** — grep doesn't know which domain owns a function, which contract it implements, or which requirement it satisfies

This limits the quality of 21 commands that analyze or reason about code structure.

---

## 2. Objective

Build a **graph abstraction layer** with two pluggable providers:

1. **Native Indexer** (zero-dependency, always available) — lightweight JS parser that extracts function/class/import entities and relationships, enriched with GSD-T context (domains, contracts, requirements, tests, tech debt)
2. **CGC Integration** (automatic when available) — CodeGraphContext MCP server providing deeper analysis (AST comparison, cross-language type flow, transitive call chains via Tree-sitter)

Commands query the abstraction layer. They never know which provider answered. The fallback chain is automatic and invisible:

```
CGC MCP → Native Graph → Grep (always works)
```

---

## 3. User Stories

### US-1: Developer runs scan on a large project
**Today**: 5 grep-based agents find text-pattern duplicates. Misses semantic duplication (same logic, different names). Reports ~60% of actual issues.
**With graph**: Scan queries the graph for structural duplication (AST comparison via CGC), circular dependency cycles (transitive call chains), dead code (unreachable from any entry point), and domain boundary violations. Reports ~95% of actual issues.

### US-2: Developer runs impact before changing a shared function
**Today**: `grep -r "import.*processPayment"` finds direct importers. Misses transitive callers (checkout calls paymentHandler which calls processPayment). Developer changes processPayment, checkout breaks in production.
**With graph**: Impact traces the full call chain: processPayment ← paymentHandler ← checkout ← [web-frontend, mobile-app]. Shows all 4 affected files, 2 affected surfaces, 1 contract violation. Developer knows the full blast radius before writing code.

### US-3: Debug session for a production failure
**Today**: Developer describes the error. Debug command greps for related functions, guesses at call paths. Takes 3-4 iterations to find root cause.
**With graph**: Debug traces the call chain from the error location backward through the graph. Shows the exact path: `webhookHandler.stripeEvent → processPayment → stripeClient.charge → [rate limit error]`. Root cause identified in one pass. Prior failure/learning entries from Decision Log attached to relevant graph nodes.

### US-4: Partition auto-detects domain boundaries
**Today**: Partition uses file paths and import patterns to suggest domains. Misses shared backend functions that serve multiple surfaces.
**With graph**: Partition queries the graph for operation-to-surface mapping. Identifies that `processPayment`, `validateCart`, and `applyDiscount` are all called by both web-frontend and mobile-app. Auto-creates SharedCore domain with these functions. Correct boundaries from the start.

### US-5: Execute verifies domain isolation during task execution
**Today**: QA subagent runs tests after execution. Domain boundary violations only caught if a test happens to cover them.
**With graph**: Execute queries the graph before and after each task. If a task in the payments domain modified a function owned by the auth domain, the violation is caught immediately — before tests even run.

### US-6: Visualize renders actual code architecture
**Today**: Dashboard shows agent hierarchy and event stream. No code structure visualization.
**With graph**: Dashboard can render domain-to-function ownership graphs, call chain diagrams, contract-to-code mapping, and cross-surface dependency trees. The graph IS the data source for architectural visualization.

---

## 4. Command Impact Matrix (Complete Audit)

### TIER 1 — Transformative (fundamentally changes how the command works)

| Command | Current Approach | With Graph |
|---------|-----------------|------------|
| **scan** | 5 grep agents | Graph queries: dead code, circular deps, AST duplication, domain violations |
| **impact** | `grep -r "import.*{module}"` | Transitive caller/callee traversal + contract violation detection |
| **partition** | File path + import pattern heuristics | Operation-to-surface graph for SharedCore auto-detection |
| **debug** | Grep for related functions, guess call paths | Call-chain tracing from error → root cause in one pass |
| **execute** | QA validates after the fact | Domain isolation verification during execution, not just after |
| **visualize** | Agent hierarchy + event stream only | Code architecture graphs, domain maps, contract-to-code diagrams |

### TIER 2 — High Impact (significantly improves quality/speed)

| Command | Improvement |
|---------|-------------|
| **qa** | Gap detection: contracts without tests via contract-to-call-chain mapping |
| **wave** | Cross-phase consistency: partition boundaries match actual code ownership before execute |
| **integrate** | Automatic cross-domain boundary violation detection during wiring |
| **verify** | Automated requirement traceability chain verification |
| **gap-analysis** | Requirement-to-code mapping via entity relationships |

### TIER 3 — Moderate Impact

| Command | Improvement |
|---------|-------------|
| **quick** | Instant domain-boundary violation check before writing code |
| **plan** | Deterministic cross-domain duplicate detection, implicit task dependency ordering |
| **test-sync** | Transitive test dependency mapping, stale test detection |
| **complete-milestone** | Validate delivered components against milestone scope |
| **status** | Richer progress metrics: % functions implemented, dependency bottlenecks |
| **feature** | Unified blast radius calculation across all surfaces |

### TIER 4 — Light Impact

| Command | Improvement |
|---------|-------------|
| **promote-debt** | Impact radius for prioritization (how many downstream functions affected) |
| **populate** | More accurate architecture docs from actual component relationships |
| **init-scan-setup** | Graph-assisted scan phase auto-populates architecture findings |

### No Impact (15 commands)

milestone, project, prd, discuss, setup, triage-and-merge, reflect, brainstorm, prompt, health, log, resume, pause, help, all backlog commands (6), branch, checkin, Claude-md, global-change, version-update, version-update-all

---

## 5. Architecture

### 5.1 Graph Abstraction Layer

```
┌─────────────────────────────────────────────────┐
│              GSD-T Commands                      │
│   (scan, impact, debug, partition, execute...)    │
└──────────────────────┬──────────────────────────┘
                       │ query(type, params)
                       ▼
┌─────────────────────────────────────────────────┐
│           Graph Abstraction Layer                │
│                                                  │
│   Unified query interface:                       │
│   - getCallers(entity)                           │
│   - getCallees(entity)                           │
│   - getTransitiveCallers(entity, depth)           │
│   - getDomainOwner(entity)                       │
│   - getContractFor(entity)                       │
│   - getRequirementFor(entity)                    │
│   - getTestsFor(entity)                          │
│   - findDuplicates(threshold)                    │
│   - getDomainBoundaryViolations()                │
│   - getSurfaceConsumers(entity)                  │
│                                                  │
│   Provider selection (automatic):                │
│   1. CGC MCP available? → use CGC + overlay      │
│   2. Native graph indexed? → use native          │
│   3. Fallback → grep patterns                    │
└───────┬─────────────────────────┬───────────────┘
        │                         │
        ▼                         ▼
┌───────────────┐    ┌─────────────────────────┐
│ Native Indexer │    │ CGC MCP Provider         │
│               │    │                          │
│ JS parser     │    │ MCP client → CGC server   │
│ .gsd-t/graph/ │    │ Tree-sitter + graph DB    │
│ JSON store    │    │ AST comparison            │
│ GSD-T overlay │    │ Cross-language type flow   │
│               │    │ + GSD-T overlay            │
└───────────────┘    └─────────────────────────┘
```

### 5.2 Native Indexer

**Location**: `bin/graph-indexer.js` (new file)

**Capabilities**:
- Parse JS/TS/Python files for function, class, and import declarations
- Build direct call relationship map
- Map entities to GSD-T domains (via `.gsd-t/domains/*/scope.md` file ownership)
- Map entities to contracts (via `.gsd-t/contracts/*.md` pattern matching)
- Map entities to requirements (via `docs/requirements.md` REQ-ID references)
- Map entities to tests (via test file naming conventions + import analysis)
- Map entities to tech debt items (via `.gsd-t/techdebt.md` references)

**Storage**: `.gsd-t/graph/` directory
```
.gsd-t/graph/
  index.json         ← entity registry (id, name, type, file, line, domain)
  calls.json          ← caller → callee edges
  imports.json        ← import relationships
  contracts.json      ← entity → contract mapping
  requirements.json   ← entity → REQ-ID mapping
  tests.json          ← entity → test file mapping
  surfaces.json       ← entity → consumer surface mapping
  meta.json           ← last indexed timestamp, file hashes for incremental
```

**Indexing trigger**: Commands that query the graph auto-trigger indexing if `meta.json` is stale (file hashes changed). Indexing is incremental — only re-parses changed files.

**Zero external dependencies**: Uses regex-based parsing (not Tree-sitter). Sufficient for direct entity extraction and call-chain mapping in JS/TS/Python. Does NOT attempt AST comparison or type flow — that's CGC's domain.

### 5.3 CGC MCP Provider

**Detection**: Check if CGC MCP server is responding (health endpoint or MCP handshake).

**Integration**: Query CGC via MCP protocol for:
- Transitive call chains (depth > 1)
- AST comparison for semantic duplication
- Cross-language type flow analysis
- Full Tree-sitter parsed entity data

**GSD-T Overlay**: CGC entities are enriched with GSD-T context from the native graph's mapping files (domain, contract, requirement, test, debt). CGC provides the code topology; the overlay provides the methodology context.

### 5.4 Grep Fallback

When neither graph provider is available, commands fall back to current grep-based analysis. This ensures GSD-T works in any environment — the graph is an enhancement, not a requirement.

---

## 6. Milestone Breakdown

### M20: Graph Abstraction Layer + Native Indexer + CGC Integration

**Scope**: Build the foundation — abstraction layer, native indexer, CGC provider, storage format, incremental indexing.

| Domain | Deliverables |
|--------|-------------|
| **graph-abstraction** | Unified query interface, provider selection logic, query routing |
| **native-indexer** | JS/TS/Python parser, entity extraction, call-chain mapping, GSD-T overlay (domain/contract/requirement/test/debt mapping) |
| **cgc-provider** | MCP client, CGC query translation, health detection, auto-fallback |
| **graph-storage** | `.gsd-t/graph/` JSON format, incremental indexing, file hash tracking |
| **cli-integration** | `gsd-t graph index` CLI subcommand, `gsd-t graph status`, `gsd-t graph query` |

**Exit Criteria**:
- Native indexer parses a JS/TS project and produces correct entity/call-chain data
- CGC provider connects to running CGC MCP server and returns enriched results
- Fallback chain works: CGC unavailable → native → grep
- Incremental indexing only re-parses changed files
- CLI subcommands functional

### M21: Graph-Powered Commands

**Scope**: Wire the graph into all 21 impacted commands. Each command checks graph availability and uses the best available provider.

| Domain | Commands | Changes |
|--------|----------|---------|
| **tier-1-commands** | scan, impact, partition, debug, execute, visualize | Major rewrites of analysis logic to use graph queries |
| **tier-2-commands** | qa, wave, integrate, verify, gap-analysis | Add graph-enhanced validation steps |
| **tier-3-commands** | quick, plan, test-sync, complete-milestone, status, feature | Add graph checks where beneficial |
| **tier-4-commands** | promote-debt, populate, init-scan-setup | Light graph enrichment |

**Exit Criteria**:
- All 21 commands use graph when available, fall back gracefully when not
- Scan on GSD-T itself produces higher-quality findings than grep-only scan
- No command breaks when graph is unavailable (grep fallback works)
- Pre-Commit Gate updated with graph-related checks
- All 4 reference docs updated (README, GSD-T-README, CLAUDE-global, gsd-t-help)

**Validation Gate**: After M21 completes, run `gsd-t-scan` on GSD-T itself. Compare findings to prior scan results. Graph-powered scan must find issues that grep-only scan missed.

---

## 7. Real-World Scenario: Option B vs Option C per Command

For each impacted command, here's how **Option B (native only)** compares to **Option C (native + CGC)**.

### scan
- **Option B**: Detects direct circular imports, dead exports, naming-convention duplicates. Catches ~80% of structural issues.
- **Option C**: Adds AST comparison — finds semantically identical functions with different names (copy-paste-rename debt). Catches ~95% of structural issues. Example: `canUserEdit()` in auth-service and `hasEditPermission()` in user-service have identical ASTs. Option B misses this. Option C flags it as a duplication candidate.

### impact
- **Option B**: Traces 1-level callers and callees. Shows direct consumers of a function. "processPayment is called by paymentHandler and webhookHandler."
- **Option C**: Traces N-level transitive callers with type flow. Shows full blast radius. "processPayment ← paymentHandler ← checkout ← [web-frontend route /checkout, mobile-app PaymentScreen]. The return type PaymentResult flows through all 4 callers — changing its shape breaks 4 consumers across 2 surfaces." Option C shows WHERE the type changes propagate, not just WHO calls the function.

### partition
- **Option B**: Maps file ownership to domains based on directory structure and import patterns. Good for most cases.
- **Option C**: Adds cross-language analysis. In a project with a Python backend and JS frontend, Option C maps the REST contract between them. Option B can only see one language at a time.

### debug
- **Option B**: Traces direct call chain from error location. "Error in stripeClient.charge, called by processPayment."
- **Option C**: Traces full transitive chain with type flow. "Error in stripeClient.charge. The `amount` parameter is typed as `number` in processPayment but arrives as `string` from webhookHandler.parseBody — type coercion at the boundary caused the Stripe API rejection." Option C identifies the type mismatch root cause, not just the call path.

### execute
- **Option B**: Checks domain file ownership. "This task modified auth-service/getUser.ts which belongs to the auth domain, not the payments domain."
- **Option C**: Also checks for indirect boundary violations via shared imports. "This task didn't modify auth-service files directly, but it changed the type signature of SharedTypes.UserRole which is imported by 3 auth-service functions." Option C catches ripple effects through shared types.

### visualize
- **Option B**: Renders domain-to-function ownership graphs and direct call chains. Useful for understanding "what's in each domain."
- **Option C**: Renders full transitive dependency trees with type flow annotations and cross-language edges. Useful for understanding "how does data flow through the entire system."

### qa
- **Option B**: Maps contracts to test files by naming convention and direct imports. Finds contracts without test coverage.
- **Option C**: Maps contracts to test files through transitive call chains. Finds contracts that have tests but those tests don't exercise the actual contract path — they test a helper function that happens to be in the same file. False coverage detection.

### wave
- **Option B**: Validates partition boundaries against file ownership between phases.
- **Option C**: Also validates that no transitive dependencies cross partition boundaries. A function might be in the right domain folder but import a utility that imports a function from another domain — indirect boundary violation.

### integrate
- **Option B**: Checks that cross-domain calls match contract specs at the direct call level.
- **Option C**: Checks type compatibility across the integration boundary. "Domain A's `createOrder()` returns `OrderResponse` but domain B's consumer expects `OrderResult` — structurally similar but field `totalAmount` is named `total` in domain B's type. Integration will fail at runtime."

### verify
- **Option B**: Maps requirements to code entities. "REQ-012 is implemented by processPayment."
- **Option C**: Maps requirements through the full call chain. "REQ-012 (Payment Processing) is implemented by processPayment → stripeClient.charge → [external API]. The requirement says 'retry on failure' but the call chain has no retry logic — requirement partially implemented."

### gap-analysis
- **Option B**: Matches REQ-IDs to function names and file paths. Finds unmapped requirements.
- **Option C**: Traces requirement implementation depth. "REQ-015 (Notification Delivery) maps to sendNotification(), but sendNotification() calls emailProvider.send() which has a TODO comment and returns a hardcoded `true`. The requirement is mapped but not meaningfully implemented."

### quick
- **Option B**: Checks if the task's target file belongs to the expected domain.
- **Option C**: Also checks if the change would affect functions consumed by other domains via shared imports. "This quick fix changes `formatCurrency()` in utils/ — 7 functions across 3 domains import it. Run impact first."

### plan
- **Option B**: Detects when two tasks in different domains create functions with the same name.
- **Option C**: Detects when two tasks create functions with the same AST structure (semantic duplication across domains, not just name collision).

### test-sync
- **Option B**: Maps test files to source files by naming convention. Finds tests for deleted/renamed functions.
- **Option C**: Maps tests through transitive imports. Finds tests that import a helper that imports the tested function — when the tested function changes, these indirect tests may also need updating. Option B only catches direct test-to-source mapping.

### complete-milestone
- **Option B**: Lists functions created/modified during the milestone based on git diff + domain scope.
- **Option C**: Validates that all functions listed in the milestone scope are reachable from at least one entry point. Catches "implemented but unwired" functions that pass all tests individually but are never called in the actual application.

### status
- **Option B**: Shows domain progress as % of tasks complete.
- **Option C**: Adds code coverage depth: "payments domain: 8/10 tasks complete, 23 functions implemented, 3 unreachable from any entry point, 2 with no test coverage."

### feature
- **Option B**: Calculates blast radius based on file count per domain.
- **Option C**: Calculates blast radius based on transitive call chains across surfaces. "Adding recurring payments affects 12 functions across 3 domains, consumed by 2 surfaces. Estimated 6 contract updates needed."

### promote-debt
- **Option B**: Shows debt item and its file location.
- **Option C**: Shows debt item's impact radius. "TD-042 (no error handling in stripeClient.charge) is called by 4 functions, consumed by 2 surfaces, affects 3 contracts. High priority — promotes to milestone."

### populate
- **Option B**: Auto-fills architecture.md with domain structure and file listings.
- **Option C**: Auto-fills architecture.md with actual component relationships, call chains, and data flow diagrams generated from the graph.

### init-scan-setup
- **Option B**: Scan phase uses native graph for initial analysis.
- **Option C**: Scan phase uses full CGC analysis for comprehensive initial codebase assessment.

---

## 8. Non-Goals

- **Replacing grep entirely** — grep remains the universal fallback
- **Building a Tree-sitter parser** — that's CGC's job; the native indexer uses regex
- **Supporting all programming languages** — M20 targets JS/TS/Python; others added by demand
- **Real-time indexing** — indexing is triggered on-demand by commands, not via file watchers
- **Graph visualization in terminal** — visualization is via the existing dashboard (gsd-t-visualize)
- **LLM-powered code analysis** — the graph is deterministic; LLM interprets graph results

---

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regex parser misses edge cases in complex JS/TS | Medium | Medium | Fallback to CGC for complex analysis; native parser covers common patterns |
| CGC project abandoned (single maintainer, alpha) | Medium | Low | Graph abstraction layer means CGC is swappable; native graph covers 80% |
| Graph storage grows large on big projects | Low | Medium | Incremental indexing + file hash deduplication; graph files are git-ignored |
| Performance impact on command startup | Medium | Medium | Lazy loading — graph only queried when command needs it; index check is O(1) via meta.json |
| Breaking change in CGC MCP protocol | Medium | Low | Provider adapter isolates protocol changes; only cgc-provider.js needs updating |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Commands using graph | 21 of 46 |
| Scan finding improvement vs grep-only | ≥30% more issues found |
| Impact blast radius accuracy | 100% of transitive callers identified (vs ~40% with grep) |
| Indexing time for 10K-line project | < 5 seconds (native), < 15 seconds (CGC) |
| Zero-dep principle maintained | Native indexer: 0 external deps. CGC: optional external dep. |
| Fallback reliability | 100% — every command works without graph |

---

## 11. Dependencies

| Dependency | Type | Risk |
|-----------|------|------|
| CodeGraphContext MCP server | Optional external | Alpha maturity; mitigated by abstraction layer |
| Node.js >= 16 | Required (existing) | Already a GSD-T requirement |
| `.gsd-t/` directory structure | Required (existing) | Already established |
| Claude Code slash command system | Required (existing) | Already established |

---

## 12. Timeline

| Milestone | Estimated Effort | Sequence |
|-----------|-----------------|----------|
| M20: Graph Abstraction + Indexer + CGC | 3-4 domains, medium complexity | First |
| M21: Graph-Powered Commands | 4 domains (by tier), high complexity | Second |
| Validation: Scan GSD-T itself | 1 scan run + comparison | After M21 |
| Then → GSD 2 milestones (M22+) | See PRD-GSD2-001 | After validation |
