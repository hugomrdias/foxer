---
name: implement-with-review
description: >-
  Foxer monorepo implementation workflow. Use proactively when implementing
  features, fixing bugs, or refactoring non-trivial code. Parent plans first,
  stops for user plan approval, then delegates to coder and reviewer subagents.
  Always use for multi-file or domain-sensitive changes in packages/ or apps/.
---

# Implement with Review

Orchestrate non-trivial code changes through **plan → user approval → coder → reviewer**. The parent agent plans and coordinates; subagents implement and review in isolated context.

**Hard gate:** Never launch `coder` until the user has explicitly approved the plan.

## When to use

Use this workflow when:

- Adding or changing behavior across multiple files
- Touching sync, reorg, JSON-RPC, DB schema, or auth paths
- The user asks to implement, fix, or refactor something substantive

Skip reviewer (plan + parent implements directly) only when:

- User explicitly says "skip review" or "quick fix"
- Trivial one-line or comment-only edits

## Workflow

### Step 1 — Plan (parent only)

Before launching any subagent:

1. Read enough context to understand scope (grep/read target files).
2. Write a short **implementation plan** with:
   - **Goal** — one sentence
   - **Files** — paths to create or modify
   - **Steps** — ordered checklist
   - **Tests** — which commands to run (`bun run check`, package `bun test`, etc.)
   - **Risks** — domain invariants (reorgs, bytea storage, auth, query bounds)
3. **Do not edit code yet.** Always present the plan to the user — not only when the task is ambiguous.

### Step 2 — Plan approval (user gate) — **STOP**

**End your turn here.** Do not launch `coder`, `reviewer`, or edit any files until the user responds.

Present the plan and ask for approval. Accept responses like "approved", "looks good", "go ahead", or specific edits to the plan.

- If the user requests plan changes → revise the plan and **stop again** for approval.
- If the user rejects the approach → replan or ask clarifying questions; do not implement.
- Only proceed to step 3 after **explicit** user approval of the current plan.

Exception: user says "skip plan review" or "implement without approval" in the same message — then you may proceed directly (rare override).

### Step 3 — Coder (foreground Task)

Launch the **`coder`** subagent with a prompt that includes:

- The full plan from step 1
- Explicit scope: "Implement only what is in this plan; minimal diff; no drive-by refactors"
- Any user constraints from the conversation

Wait for coder to finish. Do not launch reviewer in parallel.

If coder reports blockers (architectural decisions, unclear requirements), stop and resolve with the user before continuing. If the fix requires a **plan change**, return to step 1 and get user approval again before re-invoking coder.

### Step 4 — Reviewer (foreground Task)

Launch the **`reviewer`** subagent with a prompt that includes:

- The original plan summary
- Coder's handoff summary (files changed, commands run)
- "Review `git diff` against the plan. Readonly — do not edit files."

Wait for reviewer to finish.

### Step 5 — Parent synthesis

1. If reviewer reports **Critical** findings → if fixes are within the approved plan, launch **coder** with the fix list, then **reviewer** again. If fixes need plan changes, revise plan and get user approval first.
2. If only Warnings/Suggestions → summarize for the user; fix Warnings if straightforward.
3. Final message to user:
   - What was implemented
   - Review verdict (approved / fixes applied)
   - Commands run and any remaining follow-ups

## Handoff templates

### To coder

```text
Implement the following plan in the Foxer monorepo.

## Plan
[paste plan]

## Constraints
- Minimal diff; match existing patterns
- Do not commit or open PRs
- Run verification commands from the plan

Return a handoff summary: files touched, commands run, blockers (if any).
```

### To reviewer

```text
Review changes from the coder subagent against this plan.

## Plan
[paste plan summary]

## Coder handoff
[paste coder summary]

Run git diff. Report Critical / Warnings / Suggestions. Do not edit files.
```

### To coder (fix pass)

```text
Address these review findings. Minimal fixes only.

## Findings
[paste Critical and agreed Warnings]

## Original plan
[brief reminder]
```

## Subagents

| Subagent | Model | Role |
| --- | --- | --- |
| `coder` | `composer-2.5-fast` | Implementation |
| `reviewer` | `inherit`, readonly | Diff review |

Definitions: `.cursor/agents/coder.md`, `.cursor/agents/reviewer.md`

## Invocation

Users can trigger explicitly:

```text
/implement-with-review add retry backoff to foxer-rpc RPC client
```

Or: "Use implement-with-review to …"
