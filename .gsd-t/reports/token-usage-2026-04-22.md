# Token Usage Optimization Report — 2026-04-22

Run → Iter → **CW** → Turn → Tool (CW is the primary optimization unit)

Generated: 2026-04-22T19:37:43.193Z
Source: 523 turn rows, 72 compaction events, 19455 tool-call events
Sessions covered: 1

## A — Per-CW Rollup (PRIMARY)

| CW# | Iter | Start | Turns | In | Out | CacheR | CacheC | Avg Out/turn | Peak Ctx% | Ended-by |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| CW-1 | a5ee3b8e | 2026-04-21 23:33 | 523 | 841 | 198,338 | 58,222,327 | 1,612,688 | 379 | — | run end |

**Total across 1 CW**: in=841 out=198,338 cacheR=58,222,327 cacheC=1,612,688 turns=523
**Average turns per CW**: 523.0
**Compaction rate**: 0/1 CW ended by auto-compaction

## B — Tool-Tokens Rollup

### B.1 — By tool

| Tool | Calls | In | Out | CacheR | CacheC | Avg tokens/call |
|---|---:|---:|---:|---:|---:|---:|
| no-tool | 285 | 414 | 100,283 | 32,449,473 | 606,924 | 116,341 |
| Bash | 1 | 1 | 158 | 60,638 | 511 | 61,308 |
| Edit | 1 | 0 | 28 | 10,851 | 92 | 10,971 |
| Read | 1 | 0 | 25 | 9,574 | 81 | 9,680 |
| ScheduleWakeup | 1 | 0 | 15 | 5,745 | 48 | 5,808 |
| Grep | 1 | 0 | 7 | 2,553 | 22 | 2,581 |
| Agent | 1 | 0 | 5 | 1,915 | 16 | 1,936 |
| Write | 1 | 0 | 5 | 1,915 | 16 | 1,936 |
| Skill | 1 | 0 | 2 | 638 | 5 | 645 |
| TaskUpdate | 1 | 0 | 2 | 638 | 5 | 645 |
| ToolSearch | 1 | 0 | 2 | 638 | 5 | 645 |

### B.2 — Tool × Command (top 10 tools × top 5 commands, total tokens)

| Tool ╲ Command | in-session |
|---|---:|
| no-tool | 33,157,094 |
| Bash | 61,308 |
| Edit | 10,971 |
| Read | 9,680 |
| ScheduleWakeup | 5,808 |
| Grep | 2,581 |
| Write | 1,936 |
| Agent | 1,936 |
| TaskUpdate | 645 |
| ToolSearch | 645 |

## C — Top 20 Expensive Turns

Ranked by `input + output` tokens descending. _Input-heavy_ rows signal context bloat; _output-heavy_ rows signal generation cost. Both columns visible so the reader can re-sort mentally.

| # | ts | Command | Step | Domain | Task | In | Out | CacheR | CacheC | Total | Ctx% |
|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 2026-04-21T23:33:51.708Z | in-session | turn | — | — | 1 | 2,702 | 160,883 | 487 | 2,703 | — |
| 2 | 2026-04-21T23:33:51.708Z | in-session | turn | — | — | 1 | 2,702 | 160,883 | 487 | 2,703 | — |
| 3 | 2026-04-21T23:33:51.675Z | in-session | turn | — | — | 1 | 2,672 | 96,534 | 191 | 2,673 | — |
| 4 | 2026-04-21T23:33:51.690Z | in-session | turn | — | — | 6 | 2,663 | 16,612 | 48,080 | 2,669 | — |
| 5 | 2026-04-21T23:33:51.690Z | in-session | turn | — | — | 6 | 2,663 | 16,612 | 48,080 | 2,669 | — |
| 6 | 2026-04-21T23:33:51.706Z | in-session | turn | — | — | 1 | 1,583 | 148,116 | 6,543 | 1,584 | — |
| 7 | 2026-04-21T23:33:51.706Z | in-session | turn | — | — | 1 | 1,583 | 148,116 | 6,543 | 1,584 | — |
| 8 | 2026-04-21T23:33:51.748Z | in-session | turn | — | — | 1 | 1,545 | 84,055 | 6,425 | 1,546 | — |
| 9 | 2026-04-21T23:33:51.748Z | in-session | turn | — | — | 1 | 1,545 | 84,055 | 6,425 | 1,546 | — |
| 10 | 2026-04-21T23:33:51.707Z | in-session | turn | — | — | 1 | 1,362 | 156,863 | 703 | 1,363 | — |
| 11 | 2026-04-21T23:33:51.701Z | in-session | turn | — | — | 1 | 1,222 | 120,315 | 3,587 | 1,223 | — |
| 12 | 2026-04-21T23:33:51.701Z | in-session | turn | — | — | 1 | 1,222 | 120,315 | 3,587 | 1,223 | — |
| 13 | 2026-04-21T23:33:51.680Z | in-session | turn | — | — | 1 | 1,150 | 117,591 | 665 | 1,151 | — |
| 14 | 2026-04-21T23:33:51.668Z | in-session | turn | — | — | 1 | 1,144 | 51,570 | 251 | 1,145 | — |
| 15 | 2026-04-21T23:33:51.668Z | in-session | turn | — | — | 1 | 1,144 | 51,570 | 251 | 1,145 | — |
| 16 | 2026-04-21T23:33:51.668Z | in-session | turn | — | — | 1 | 1,144 | 51,570 | 251 | 1,145 | — |
| 17 | 2026-04-21T23:33:51.668Z | in-session | turn | — | — | 1 | 1,144 | 51,570 | 251 | 1,145 | — |
| 18 | 2026-04-21T23:33:51.668Z | in-session | turn | — | — | 1 | 1,144 | 51,570 | 251 | 1,145 | — |
| 19 | 2026-04-21T23:33:51.709Z | in-session | turn | — | — | 1 | 1,140 | 165,858 | 243 | 1,141 | — |
| 20 | 2026-04-21T23:33:51.739Z | in-session | turn | — | — | 1 | 1,094 | 142,776 | 227 | 1,095 | — |

## D — Compaction Events

| ts | Source | Iter (prior) | Trigger | Pre-tokens | Post-tokens | Duration (ms) | Active Command | Active Domain/Task |
|---|---|---|---|---:|---:|---:|---|---|
| 2026-04-04T23:52:02.330Z | compact-backfill | 2d4745af | auto | 182,509 | — | — | — | —/— |
| 2026-04-05T15:56:08.629Z | compact-backfill | 53c00b1b | auto | 183,199 | — | — | — | —/— |
| 2026-04-05T19:56:34.961Z | compact-backfill | 2c264935 | auto | 179,217 | — | — | — | —/— |
| 2026-04-05T20:39:42.513Z | compact-backfill | 873375c3 | auto | 179,166 | — | — | — | —/— |
| 2026-04-05T21:28:38.933Z | compact-backfill | 2c252db5 | auto | 184,365 | — | — | — | —/— |
| 2026-04-06T05:48:40.412Z | compact-backfill | 795c874a | auto | 180,005 | — | — | — | —/— |
| 2026-04-07T00:06:17.380Z | compact-backfill | 1cd95aaf | auto | 179,349 | — | — | — | —/— |
| 2026-04-07T01:52:28.533Z | compact-backfill | 92f568b7 | auto | 180,585 | — | — | — | —/— |
| 2026-04-07T09:15:53.062Z | compact-backfill | 75000f51 | auto | 180,243 | — | — | — | —/— |
| 2026-04-07T22:29:08.898Z | compact-backfill | 474dc32e | auto | 179,712 | — | — | — | —/— |
| 2026-04-08T00:52:51.837Z | compact-backfill | e8c95ef8 | auto | 179,274 | — | — | — | —/— |
| 2026-04-08T17:16:14.758Z | compact-backfill | 9b8da3b0 | auto | 195,051 | — | — | — | —/— |
| 2026-04-08T20:45:00.318Z | compact-backfill | 14fb35e0 | auto | 179,045 | — | — | — | —/— |
| 2026-04-08T22:04:58.662Z | compact-backfill | d011e70f | auto | 183,842 | — | — | — | —/— |
| 2026-04-08T23:33:29.452Z | compact-backfill | 6bcd7efb | auto | 179,142 | — | — | — | —/— |
| 2026-04-09T16:10:33.758Z | compact-backfill | 9189405b | auto | 168,026 | — | — | — | —/— |
| 2026-04-09T20:20:10.162Z | compact-backfill | 1bbd710e | auto | 168,179 | — | — | — | —/— |
| 2026-04-09T22:06:30.039Z | compact-backfill | d39bbd09 | auto | 167,163 | — | — | — | —/— |
| 2026-04-10T00:03:43.143Z | compact-backfill | caed5e2b | auto | 167,329 | — | — | — | —/— |
| 2026-04-10T02:27:42.098Z | compact-backfill | 99131983 | auto | 167,157 | — | — | — | —/— |
| 2026-04-14T15:23:47.340Z | compact-backfill | 040659d1 | manual | 178,460 | 10,214 | 135,199 | — | —/— |
| 2026-04-14T20:42:29.015Z | compact-backfill | c3c12282 | manual | 177,384 | 9,441 | 123,110 | — | —/— |
| 2026-04-14T21:28:38.252Z | compact-backfill | 6e7caa6c | manual | 177,157 | 16,277 | 159,805 | — | —/— |
| 2026-04-15T00:49:23.865Z | compact-backfill | 4c551c85 | manual | 178,826 | 6,718 | 100,589 | — | —/— |
| 2026-04-15T01:37:54.173Z | compact-backfill | 2093df13 | manual | 177,101 | 8,188 | 163,677 | — | —/— |
| 2026-04-15T02:15:25.173Z | compact-backfill | 29d91b31 | manual | 178,548 | 8,913 | 176,428 | — | —/— |
| 2026-04-15T18:57:41.771Z | compact-backfill | 494c5ebd | manual | 182,809 | 22,610 | 102,682 | — | —/— |
| 2026-04-15T20:00:49.350Z | compact-backfill | df84d8da | manual | 178,762 | 7,725 | 156,369 | — | —/— |
| 2026-04-15T21:24:32.040Z | compact-backfill | bbee2e35 | manual | 177,071 | 10,483 | 129,639 | — | —/— |
| 2026-04-15T23:42:47.138Z | compact-backfill | bdf58fb3 | manual | 177,313 | 21,325 | 115,227 | — | —/— |
| 2026-04-16T21:37:20.106Z | compact-backfill | bb0e0cfb | manual | 196,625 | 25,522 | 132,218 | — | —/— |
| 2026-04-16T23:45:25.931Z | compact-backfill | 535bbec6 | auto | 167,783 | 11,465 | 126,197 | — | —/— |
| 2026-04-16T23:54:54.130Z | compact-backfill | 4e9333a6 | auto | 167,054 | 12,912 | 89,869 | — | —/— |
| 2026-04-17T05:03:40.208Z | compact-backfill | 00d0982d | auto | 167,553 | 10,137 | 102,640 | — | —/— |
| 2026-04-17T15:22:20.152Z | compact-backfill | b318c567 | auto | 168,391 | 13,606 | 131,646 | — | —/— |
| 2026-04-17T15:31:52.639Z | compact-backfill | 49a2aee9 | auto | 168,528 | 9,544 | 109,921 | — | —/— |
| 2026-04-17T15:43:27.572Z | compact-backfill | 6cc6356e | auto | 168,644 | 10,511 | 97,353 | — | —/— |
| 2026-04-17T17:30:06.113Z | compact-backfill | f590d606 | auto | 179,337 | 22,066 | 163,857 | — | —/— |
| 2026-04-17T17:47:36.570Z | compact-backfill | 2e73cfe3 | auto | 169,359 | 21,410 | 114,188 | — | —/— |
| 2026-04-17T18:23:22.213Z | compact-backfill | ac74eb3d | auto | 167,327 | 24,783 | 102,138 | — | —/— |
| 2026-04-17T19:20:21.568Z | compact-backfill | fcd7f263 | auto | 167,117 | 26,635 | 145,289 | — | —/— |
| 2026-04-17T19:59:36.421Z | compact-backfill | 4d25d9c6 | auto | 172,180 | 30,928 | 131,703 | — | —/— |
| 2026-04-17T20:12:04.550Z | compact-backfill | 30959ca1 | auto | 174,451 | 30,451 | 104,939 | — | —/— |
| 2026-04-17T20:35:34.864Z | compact-backfill | 9a20365c | auto | 168,250 | 32,863 | 101,401 | — | —/— |
| 2026-04-17T21:08:55.129Z | compact-backfill | 3d39dfee | auto | 167,415 | 31,178 | 107,162 | — | —/— |
| 2026-04-17T21:52:31.497Z | compact-backfill | 69a78ec6 | auto | 170,806 | 32,916 | 109,182 | — | —/— |
| 2026-04-17T22:12:59.881Z | compact-backfill | 5f9452f1 | auto | 167,294 | 30,012 | 100,019 | — | —/— |
| 2026-04-17T23:20:20.040Z | compact-backfill | cce75b2e | auto | 168,519 | 30,414 | 139,311 | — | —/— |
| 2026-04-20T00:36:58.088Z | compact-backfill | ff19ae20 | auto | 168,966 | 28,099 | 112,117 | — | —/— |
| 2026-04-20T03:35:04.588Z | compact-backfill | 956ed8d1 | auto | 167,878 | 10,841 | 127,241 | — | —/— |
| 2026-04-20T20:19:12.066Z | compact-backfill | 683f714e | auto | 167,039 | 13,535 | 121,287 | — | —/— |
| 2026-04-20T21:21:02.994Z | compact-backfill | 26473823 | auto | 177,884 | 11,396 | 115,556 | — | —/— |
| 2026-04-20T21:29:32.399Z | compact-backfill | 9a43630f | auto | 167,648 | 13,511 | 97,415 | — | —/— |
| 2026-04-20T21:44:08.434Z | compact-backfill | decd90e5 | auto | 168,245 | 14,228 | 124,359 | — | —/— |
| 2026-04-20T21:55:02.238Z | compact-backfill | 0bf7928a | auto | 168,611 | 28,649 | 114,356 | — | —/— |
| 2026-04-20T22:01:40.718Z | compact-backfill | 9037612f | auto | 168,062 | 27,714 | 97,230 | — | —/— |
| 2026-04-20T22:17:19.339Z | compact-backfill | cb09b650 | auto | 167,241 | 34,832 | 128,610 | — | —/— |
| 2026-04-20T22:26:50.633Z | compact-backfill | 171e9915 | auto | 168,173 | 28,113 | 95,932 | — | —/— |
| 2026-04-20T22:38:02.399Z | compact-backfill | 3949b9c0 | auto | 172,910 | 28,949 | 99,665 | — | —/— |
| 2026-04-20T22:52:45.122Z | compact-backfill | 47dd37aa | auto | 168,968 | 28,647 | 114,310 | — | —/— |
| 2026-04-21T00:15:38.226Z | compact-backfill | ea7d2730 | auto | 167,383 | 34,520 | 107,856 | — | —/— |
| 2026-04-21T00:27:31.828Z | compact-backfill | f256fe56 | auto | 167,856 | 32,468 | 127,957 | — | —/— |
| 2026-04-21T20:05:11.815Z | compact-backfill | ac50b3d7 | auto | 167,375 | 20,175 | 126,849 | — | —/— |
| 2026-04-21T20:22:56.507Z | compact-backfill | c128a90e | auto | 178,671 | 24,249 | 117,322 | — | —/— |
| 2026-04-21T20:33:14.506Z | compact-backfill | c45b9237 | auto | 167,027 | 22,165 | 118,569 | — | —/— |
| 2026-04-21T21:28:09.204Z | compact-backfill | 7e4caf8d | auto | 168,086 | 21,738 | 146,327 | — | —/— |
| 2026-04-21T22:57:42.655Z | compact-backfill | 10e0ff6b | auto | 169,301 | 13,826 | 147,445 | — | —/— |
| 2026-04-21T23:16:36.510Z | compact-backfill | 9b996c97 | auto | 167,280 | 22,282 | 107,685 | — | —/— |
| 2026-04-21T23:29:44.559Z | compact-backfill | 4955993a | auto | 167,489 | 19,801 | 135,617 | — | —/— |
| 2026-04-21T23:52:01.084Z | compact-backfill | d10af293 | auto | 169,178 | 17,305 | 147,377 | in-session | —/— |
| 2026-04-22T00:33:21.274Z | compact-backfill | a98b0d05 | auto | 168,994 | 15,503 | 73,153 | in-session | —/— |
| 2026-04-22T18:50:25.989Z | compact-backfill | b5adfaf8 | auto | 167,569 | 15,457 | 161,737 | in-session | —/— |

**Summary**: 61 auto, 11 manual, 72 backfilled.
