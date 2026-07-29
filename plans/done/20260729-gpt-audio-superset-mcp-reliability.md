# GPT Audio → Superset MCP Reliability Plan

Date: 2026-07-29
Branch: `cor/superset-voice-terminal-visibility-current`
Base implementation receipt: `289b283`

## Goal contract

Fit: GOAL_FIT, executing.

Done when:
- terminal writes produce an evidence-bearing delivery receipt instead of an echoed request flag;
- duplicate and occupied-prompt sends are fail-closed before PTY mutation;
- a single server-side await call returns working/completed/staged/timeout from host lifecycle + snapshot evidence;
- unknown state/freshness is not fabricated;
- Voice can resolve common spoken aliases to canonical live targets and must confirm the canonical target before mutation;
- the operator skill enforces compact Turkish progress/receipt language, fragment handling, barge-in boundaries, and no fake-green;
- focused unit tests, real PTY tests under the packaged Electron ABI, typechecks, lint, and one harmless live canary pass.

Primary verifier:
- focused Bun contract tests + Electron-as-Node real PTY suite + host-service/mcp-v2 typecheck + Biome + live `SUPERSET_SEND_OK` readback.

Anti-cheat:
- `submitted:true`, PTY write return, output byte delta, and spinner redraw are never completion proof;
- timeout/unknown must remain YELLOW;
- duplicate/staged-buffer tests assert zero second physical writes;
- canary requires agent response/completion marker, not prompt echo.

Rollback:
- revert the implementation commit(s), rebuild the unsigned local desktop artifact, restart only the exact Superset host-service child after path/PID guard. No Mac/Jump/WindowServer reboot.

## Council synthesis

Exact lanes and receipts:
- Kimi K3: `kimi-code/k3`, `KIMI_OK`, artifact `runs/voice-mcp-council-20260729/kimi-k3.final.md`.
- Fable 5: resolved `claude-fable-5`, artifact `runs/voice-mcp-council-20260729/fable-5.final.md`.
- Opus 5: resolved `claude-opus-5`, artifact `runs/voice-mcp-council-20260729/opus-5.final.md`.

Consensus:
- truth belongs in host/MCP, not Voice prose;
- one server-side await replaces fragile Voice polling loops;
- staged prompt and duplicate sends fail closed;
- unknown state/freshness must remain unknown;
- ASR internals, true turn segmentation, push completion, and true barge-in are closed-source and must be mitigated honestly, not claimed fixed.

## Implementation

### 1. Host truth primitives

Files:
- `packages/host-service/src/terminal/terminal-mode-tracker.ts`
- `packages/host-service/src/terminal/terminal.ts`

Changes:
- add monotonic snapshot `revision` and `updatedAt` from PTY output;
- allow an optimistic `expectRevision` guard before a send;
- preserve the split paste/submit behavior;
- expose snapshot revision through tRPC/MCP reads.

### 2. Delivery ledger and state machine

Files:
- new `packages/host-service/src/terminal/terminal-delivery.ts`
- `packages/host-service/src/trpc/router/terminal/terminal.ts`

Changes:
- bounded in-memory ledger (per-terminal cap, TTL), no DB migration;
- transport idempotency by `clientToken` and content dedupe window;
- high-confidence staged-prompt guard for known agent TUIs; unknown runtimes degrade to `unknown`, never auto-clear;
- `terminal.send` returns `deliveryId`, `phase`, `submitSent`, evidence, canonical target identity;
- add `terminal.awaitDelivery` query with a hard timeout cap and lifecycle/snapshot evidence;
- code-generated compact Turkish `speak` string per phase; forbidden success words on unverified phases.

Phases:
- pre-write: `rejected_prompt_not_empty`, `duplicate_ignored`, `duplicate_suspected`, `rejected_revision_changed`;
- post-write: `injected`, `staged`, `working`, `needs_input`, `completed`, `failed`, `unknown_timeout`.

### 3. MCP surface

Files:
- `packages/mcp-v2/src/tools/terminals/send.ts`
- new `packages/mcp-v2/src/tools/terminals/await-delivery.ts`
- `packages/mcp-v2/src/tools/terminals/read.ts`
- `packages/mcp-v2/src/tools/terminals/terminal-read-contract.ts`
- `packages/mcp-v2/src/tools/register.ts`

Changes:
- generate/pass `clientToken`; expose staged/dedupe/expected revision controls;
- deprecate bare `submitted` semantics and return receipt fields;
- add one-call `terminals_await_delivery`;
- add `state:"unknown"`, `stateSource`, optional honest freshness, revision, and prompt-status.

### 4. Spoken target resolver

Files:
- new `packages/mcp-v2/src/tools/targets/resolve.ts`
- new pure resolver contract + tests
- `packages/mcp-v2/src/tools/register.ts`

Changes:
- normalize Unicode/diacritics, merge/split tokens, score live workspace and terminal identity;
- observed aliases: Superset, Kahvetabela, Claude/cloud, Codex/kodeks, Kimi/Kimmy, Glama, MCP;
- return ranked canonical candidates and `ambiguous`; never mutate or auto-send.

### 5. Voice policy

File:
- `/Users/aytuncyildizli/.codex/skills/superset-operator/SKILL.md`

Changes:
- resolve → one-sentence canonical confirmation → send → await;
- fragment/continuation hold rule and duplicate defense;
- barge-in: stop speech/proposal; never interrupt running agent without an explicit separate command;
- fixed compact Turkish phrases for blocked/staged/working/completed/timeout;
- preserve unrelated staged input.

### 6. Mechanical eval

Files:
- pure state-machine/dedupe/prompt-detector tests;
- resolver fixtures for representative Turkish/English misrecognitions;
- extend real PTY send/snapshot test for revision and zero-write guards;
- local receipt artifact under `runs/voice-mcp-council-20260729/`.

## Explicit defers

- ChatGPT ASR acoustic/hotword injection;
- true audio turn debounce inside ChatGPT;
- proactive push completion into Voice;
- automatic prompt clearing/overwrite;
- automatic Ctrl-C/interrupt;
- universal authoritative prompt-buffer introspection for unknown TUIs.

These are reported as closed-source or unsafe, not GREEN.
