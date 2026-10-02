---
name: task-to-issue
description: |
  Interview the user about a single ad-hoc task, then register it as one GitHub issue
  in the project repository. Use when an individual task comes up (a bug, a small feature,
  a chore) and the requirements are not yet written down — without going through `spec.md`.
  Invoke with `/task-to-issue`. The created issue is consumed by `/auto-issue-worker`.
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---

# Task to Issue

You gather the requirements for a single task through a short interview and register it
as one GitHub issue in the **{{PROJECT_NAME}}** repository (`{{GITHUB_OWNER}}/{{GITHUB_REPO}}`).
The resulting issue is self-contained and formatted so `/auto-issue-worker` can pick it up
and implement it directly.

## Workflow

### Step 1 — Confirm the repository

- Confirm you can reach the repo: `gh repo view {{GITHUB_OWNER}}/{{GITHUB_REPO}}`.
- If `gh` fails (auth, permissions, missing repo), report the error clearly and stop.

### Step 2 — Interview the user

Conduct a focused interview with the `AskUserQuestion` tool. Keep it short — this is one
task, not a whole project. Ask in rounds and skip anything the user already stated. Cover:

1. Task type — bug fix, feature, enhancement, chore, docs, or test.
2. Goal — what should change and why; the problem it solves or the value it delivers.
3. Scope — what is in scope for this single task, and what is explicitly out of scope.
4. Behavior — concrete expected behavior, user flow, and inputs/outputs.
5. Acceptance criteria — verifiable outcomes that define "done".
6. Dependencies — existing open issues this task depends on (look them up if the user is
   unsure: `gh issue list --repo {{GITHUB_OWNER}}/{{GITHUB_REPO}} --state open`).
7. Constraints — affected files/modules, tech constraints, or deadlines, if any.

Rules for the interview:

- Ask one area at a time and adapt follow-ups to the answers.
- When the user is vague, propose concrete options or sensible defaults and confirm.
- Do not invent requirements the user did not state — record genuine unknowns as open questions.
- Stop once there is enough detail for a developer to implement the task from the issue alone.

### Step 3 — Confirm the issue with the user

Before creating the issue, present a preview: the proposed title, label, and body. Ask the
user to approve or edit. Use `AskUserQuestion` for decisions like the label if unclear.
Do not create the issue until the user approves.

### Step 4 — Create the issue

Create the issue with `gh`:

```bash
gh issue create \
  --repo {{GITHUB_OWNER}}/{{GITHUB_REPO}} \
  --title "<concise imperative task title>" \
  --label "<label>" \
  --body "$(cat <<'EOF'
## Summary
<What this task delivers, in one or two sentences.>

## Context
<Why this task exists — the problem, motivation, or trigger.>

## Acceptance Criteria
- [ ] <Verifiable outcome>
- [ ] <Verifiable outcome>
- [ ] E2E behavior is verified and guaranteed at the completion of this task

## Dependencies
- <Depends on #<n>, or "None">
EOF
)"
```

Rules for issue creation:

- Keep the title imperative and concise (e.g. "Add user authentication endpoint").
- Apply a consistent label (e.g. `feature`, `enhancement`, `bug`, `chore`, `docs`, `test`).
  Create a missing label with `gh label create` only after confirming with the user.
- The **Dependencies** section is required — `/auto-issue-worker` reads it to decide ordering.
- The **Acceptance Criteria** must include the item
  "E2E behavior is verified and guaranteed at the completion of this task" as a completion condition.

### Step 5 — Report

- Print the created issue number and URL.
- Tell the user they can run `/auto-issue-worker` to implement the issue automatically.

## Rules

- Never create the issue before the user approves the preview (Step 3).
- The issue must be self-contained: a developer (or the issue-implementer agent) should be
  able to implement it from the issue body alone.
- Use the same language the user used during the interview for the title and body.
- This skill produces exactly one issue per run; if the user describes multiple distinct
  tasks, suggest running `/task-to-issue` again or using `/spec-to-issues`.
