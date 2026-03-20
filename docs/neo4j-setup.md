# Neo4j Graph Engine Setup for GSD-T

GSD-T v2.39.10+ includes a graph-powered code analysis engine with a 3-tier provider chain: **CGC (Neo4j) → Native JSON → Grep**. This guide sets up the full stack for maximum analysis depth.

## Prerequisites

- **Docker Desktop** installed and running — [download](https://www.docker.com/products/docker-desktop/)
- **Python 3.10+** installed
- **GSD-T** v2.39.10+ installed globally:
  ```bash
  npm i -g @tekyzinc/gsd-t
  ```

## Step 1: Install CodeGraphContext (CGC)

```bash
pip install codegraphcontext
```

Verify:
```bash
cgc --version
```

Expected output: `CodeGraphContext 0.3.1` (or later)

## Step 2: Start the Neo4j Container

```bash
docker run -d \
  --name gsd-t-neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -v neo4j_data:/data \
  -v neo4j_logs:/logs \
  -e NEO4J_AUTH=neo4j/password \
  --restart unless-stopped \
  neo4j:5-community
```

**What each flag does:**

| Flag | Purpose |
|------|---------|
| `-d` | Run in background |
| `--name gsd-t-neo4j` | Container name for easy reference |
| `-p 7474:7474` | Neo4j browser UI (http://localhost:7474) |
| `-p 7687:7687` | Bolt protocol port (CGC connects here) |
| `-v neo4j_data:/data` | Persist graph data across restarts |
| `-v neo4j_logs:/logs` | Persist logs |
| `-e NEO4J_AUTH=neo4j/password` | Default credentials |
| `--restart unless-stopped` | Auto-start with Docker |

**One container serves all projects.** You do not need a separate Neo4j instance per project — CGC separates projects internally by repository path.

## Step 3: Verify Setup

```bash
# Check container is running
docker ps --filter name=gsd-t-neo4j

# Check CGC can connect
cgc --version
```

You should see the container with status "Up" and CGC reporting its version.

## Step 4: Index All GSD-T Projects

Paste this prompt into Claude Code from any GSD-T project directory:

```
Index all my GSD-T projects into both the native JSON graph and CGC/Neo4j.

For each project listed in ~/.claude/.gsd-t-projects:
1. Run the native graph indexer:
   node -e "const {indexProject}=require(require('child_process').execSync('npm root -g',{encoding:'utf8'}).trim()+'/@tekyzinc/gsd-t/bin/graph-indexer'); const r=indexProject('{PROJECT_PATH}',{force:true}); console.log(JSON.stringify(r))"
2. Run CGC indexing via CLI (preferred on Windows):
   cd {PROJECT_PATH} && cgc index .
3. Report a summary table: project name, entity count, relationship count,
   CGC status (success/fail), duration.

Use team mode with parallel agents for speed. Skip any project directory
that doesn't exist.
```

## Step 5: Run a Scan

After indexing is complete, run a full codebase scan in each project to generate the baseline analysis. From within each project directory:

```
/user:gsd-t-scan
```

Or to scan all projects at once, paste this prompt into Claude Code:

```
For each project listed in ~/.claude/.gsd-t-projects that has source code
files (.js, .ts, .py, .jsx, .tsx):
1. cd into the project directory
2. Run /user:gsd-t-scan
3. Report: project name, scan status, tech debt items found, test count

Use team mode with parallel agents. Skip documentation-only projects
(those with 0 entities in the native graph index).
```

The scan uses the graph engine automatically — with CGC available, it performs deeper analysis including cross-file call chain tracing, complexity metrics, dead code detection, and domain boundary violation checks.

## How It Works

GSD-T commands query the graph through an abstraction layer that automatically selects the best available provider:

| Provider | Priority | What It Provides |
|----------|----------|------------------|
| **CGC (Neo4j)** | 1 (highest) | Multi-hop call chains, transitive dependencies, cyclomatic complexity, Cypher queries, class hierarchy, duplicate detection via AST comparison |
| **Native JSON** | 2 | Entity index, direct call/import edges, contract/requirement/test mappings, dead code detection, circular dependency detection |
| **Grep** | 3 (fallback) | Basic caller/importer lookup via text search |

Commands like `debug`, `impact`, `scan`, `execute`, and `partition` all benefit from the graph — but they work at every tier. If Neo4j isn't available, they fall back to native JSON. If the native index doesn't exist, they fall back to grep.

### Auto-Sync

As of v2.39.10, the graph index stays fresh automatically. Every GSD-T command checks for staleness at startup — if files have changed since the last index, it re-indexes before querying. Both native JSON and CGC are synced at the command boundary.

## Managing the Container

```bash
# Stop
docker stop gsd-t-neo4j

# Start (after stop or reboot)
docker start gsd-t-neo4j

# View logs
docker logs gsd-t-neo4j --tail 20

# Remove container (data preserved in volumes)
docker rm -f gsd-t-neo4j

# Remove data volumes (DESTRUCTIVE — deletes all graph data)
docker volume rm neo4j_data neo4j_logs
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `cgc: command not found` | Run `pip install codegraphcontext` |
| `docker: command not found` | Install Docker Desktop |
| Container not starting | Check `docker logs gsd-t-neo4j` for errors |
| CGC MCP `add_code_to_graph` fails on Windows | Known CGC 0.3.1 bug — use `cgc index .` CLI instead |
| `UnicodeEncodeError: 'charmap'` on Windows | CGC crashes on emoji/Unicode in source code. Fix: `set PYTHONIOENCODING=utf-8` before running `cgc index`, or use `PYTHONIOENCODING=utf-8 cgc index .` in bash. GSD-T's auto-sync sets this automatically. |
| 0 entities indexed | Project may be docs-only (no `.js`/`.ts`/`.py` files) |
| Very few entities (e.g., 1 function for a large project) | CGC likely crashed mid-index on a file with special characters. Force re-index with UTF-8: `PYTHONIOENCODING=utf-8 cgc index . --force` |
| Neo4j connection refused | Ensure container is running: `docker start gsd-t-neo4j` |
| `[GSD-T] CGC sync FAILED` warning | Auto-sync tried twice and failed. Run the manual fix command shown in the warning message. Check that Neo4j container is running and CGC is installed. |

## Known Limitations

- **CGC 0.3.1 Windows bugs:**
  - The `add_code_to_graph` MCP tool call passes `None` for the directory parameter on Windows. GSD-T uses `cgc index` CLI as a workaround.
  - CGC crashes with `UnicodeEncodeError` when source files contain emoji or non-ASCII characters on Windows. GSD-T sets `PYTHONIOENCODING=utf-8` automatically. For manual CLI use, prefix commands with `PYTHONIOENCODING=utf-8`.
- **Language support:** Native indexer supports JS/TS/Python. CGC supports JS/TS/Python plus additional languages via Tree-sitter.
- **Docs-only projects:** Projects without source code files produce 0 entities — this is expected behavior, not an error.

## Auto-Sync Error Handling

GSD-T's graph auto-sync (v2.39.11+) does not silently ignore failures. When CGC sync fails:

1. **Attempt 1:** Normal `cgc index` with UTF-8 encoding
2. **Attempt 2:** Force re-index (`cgc index --force`) to recover from corrupt state
3. **If both fail:** Warns the user with the error, impact, and fix command

You will see a message like:
```
[GSD-T] ⚠ CGC sync FAILED for C:\Users\david\MyProject
  Error: UnicodeEncodeError: 'charmap' codec can't encode character...
  Impact: Neo4j graph is stale — deep call chain analysis may return outdated results
  Fix: run "cgc index C:\Users\david\MyProject --force" manually
```

The native JSON index is unaffected by CGC failures — it always updates successfully.
