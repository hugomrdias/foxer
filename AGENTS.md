# Agent guide — Foxer monorepo

Bun/Turbo monorepo for Filecoin indexing (`packages/foxer`), JSON-RPC sync (`packages/foxer-rpc`), clients, and workspace apps. Use `bun install`, `bun run check`, and `bun run build` from the repo root.

## Code changes

<!-- For **non-trivial** implementation work (multi-file, sync/RPC/DB/auth), follow **plan → user approval → coder → reviewer**:

1. **Parent** writes a short implementation plan (no edits yet).
2. **User** reviews and approves the plan — parent must **stop and wait** before handoff.
3. **`coder`** subagent (`.cursor/agents/coder.md`) implements the approved plan.
4. **`reviewer`** subagent (`.cursor/agents/reviewer.md`) reviews the diff (readonly).

Full workflow: `.cursor/skills/implement-with-review/SKILL.md`

Skip review only for trivial edits or when the user asks. -->

For changes follow plan -> user approval -> execution

1. "Writes a detailed implementation plan (no edits yet).
2. **User** reviews and approves the plan — **stop and wait** before handoff.
3. Implement the approved plan.


## Project skills

<!-- Skills live under `.agents/skills/` (e.g. shadcn). Cursor-native skills: `.cursor/skills/`. -->
