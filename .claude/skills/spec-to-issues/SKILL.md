---
name: spec-to-issues
description: |
  Read `spec.md`, break it down into discrete implementation tasks, and register them
  as GitHub issues in the project repository. Use after a spec exists (e.g. produced by
  the `spec-builder` skill) and the user wants to turn it into actionable issues.
  Invoke with `/spec-to-issues`. The created issues are consumed by `/auto-issue-worker`.
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---

# Spec to Issues

You turn the project specification into a set of GitHub issues for the
**{{PROJECT_NAME}}** repository (`{{GITHUB_OWNER}}/{{GITHUB_REPO}}`). You read `spec.md`,
decompose it into appropriately-sized tasks, and create one issue per task using the
`gh` CLI. The resulting issues are designed to be picked up by `/auto-issue-worker`.

## Workflow

### Step 1 — Load the spec

- Read `spec.md` from the repository root.
- If it is missing, tell the user to run `/spec-builder` first and stop.
- Confirm you can reach the repo: `gh repo view {{GITHUB_OWNER}}/{{GITHUB_REPO}}`.

### Step 2 — Decompose into tasks

Break the spec into discrete, independently-implementable tasks:

- Each task should be a **single PR-sized unit of work** (roughly a few hours to a day).
- Split large functional requirements into multiple tasks (e.g. data model → API → UI).
- Include non-functional work (tests, CI, docs) as its own tasks where meaningful.
- Identify **dependencies** between tasks (e.g. "API endpoint" depends on "data model").
  `/auto-issue-worker` skips issues whose dependencies are still open, so record them.
- Reference the originating spec section in each task (e.g. "From FR-2").

### Step 3 — Confirm the plan with the user

Before creating any issues, present the proposed task list as a table:

| # | Title | Spec ref | Depends on | Labels |
|---|-------|----------|-----------|--------|

- Ask the user to approve, edit, add, or remove tasks.
- Use `AskUserQuestion` for decisions like granularity or labeling if unclear.
- Do not create issues until the user approves the list.

### Step 4 — Create the issues

For each approved task, create an issue with `gh`:

```bash
gh issue create \
  --repo {{GITHUB_OWNER}}/{{GITHUB_REPO}} \
  --title "<concise task title>" \
  --label "<label>" \
  --body "$(cat <<'EOF'
## Summary
<What this task delivers, in one or two sentences.>

## Context
From: <spec section, e.g. FR-2 / Non-Functional Requirements>

## Acceptance Criteria
- [ ] <Verifiable outcome>
- [ ] <Verifiable outcome>
- [ ] <How the behaviour is verified: the automated test that covers it, or the manual
      steps to reproduce it>

## Dependencies
Depends on: <#<n>, #<n> — or "none">
EOF
)"
```

Rules for issue creation:

- Create issues in **dependency order** so earlier issues have lower numbers, then edit
  later issues to reference the actual issue numbers of their dependencies (use
  `gh issue edit <n> --body ...` to fill in `#<n>` once known).
- Keep titles imperative and concise (e.g. "Add user authentication endpoint").
- Apply consistent labels (e.g. `feature`, `enhancement`, `chore`, `docs`, `test`).
  Create missing labels with `gh label create` if needed, after confirming with the user.
- The **Dependencies** section is required — `/auto-issue-worker` reads it to decide
  ordering. Write the line in exactly the form `Depends on: #3, #7` (or `Depends on: none`);
  the flow greps that line instead of reading whole issue bodies.
- Every issue's **Acceptance Criteria** must say how the change is verified, with a check the
  implementer can actually run in this project — normally an automated test at the level the
  change lives at.
- Require end-to-end verification only where the project already has a harness that runs it.
  Where it does not, ask for the manual verification steps in the PR description instead, and
  make building that harness its own task. An acceptance criterion nothing can execute is
  either skipped or answered with a guess.

### Step 5 — Report

- Print a summary table mapping each task to its created issue number/URL.
- Tell the user they can now run `/auto-issue-worker` to implement the issues automatically.

## Rules

- Never create issues before the user approves the task list (Step 3).
- Each issue must be self-contained: a developer (or the issue-implementer agent) should be
  able to implement it from the issue body plus `spec.md` alone.
- Keep the dependency graph acyclic — flag and resolve any circular dependencies with the user.
- Order the tasks so the verification harnesses a later task depends on (test runner, CI
  workflow, E2E setup) come early enough to be usable.
- Use the same language as `spec.md` for issue titles and bodies.
- If `gh` fails (auth, permissions, missing repo), report the error clearly and stop.
