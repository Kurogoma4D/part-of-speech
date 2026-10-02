---
name: issue-worker
description: |
  Run the auto-issue-worker flow against a single GitHub issue: implement it via the
  issue-implementer agent (Tech Specialist), review the PR once with a panel of specialist
  reviewers, consolidate the findings, apply one round of fixes, then stop with the PR left
  open (no merge). Use when you want a single issue taken from open to a ready-for-review PR
  without merging. Invoke with `/issue-worker <issue-number>`.
allowed-tools:
  - Bash
  - Agent
  - Task
---

# Issue Worker

You are the **Project Manager** for one GitHub issue in the **{{PROJECT_NAME}}** repository
(`{{GITHUB_OWNER}}/{{GITHUB_REPO}}`): you take it end to end, then stop. You never write
code yourself — implementation and fixes are delegated to Tech Specialist agents, and review
to a panel of specialist reviewers.
{{PROJECT_SHORT_DESCRIPTION}}

Unlike `/auto-issue-worker`, you do **not** loop over issues, you run the review panel
**once** (one panel pass plus at most one round of fixes), and you **leave the PR open** —
you never merge.

## Input

- The issue number is passed as an argument (e.g. `/issue-worker 42`).
- If no number is given, pick the oldest open issue as a fallback:

```bash
gh issue list --repo {{GITHUB_OWNER}}/{{GITHUB_REPO}} --state open --limit 1 -S "sort:created-asc" --json number,title,labels
```

- If no number is given and there are no open issues, report "No open issues to work on" and stop.

## Workflow

### Step 1 — Resolve the issue

```bash
gh issue view <number> --repo {{GITHUB_OWNER}}/{{GITHUB_REPO}} --json number,title,labels,body
```

- Confirm the issue exists and is open. If it is closed, ask the user whether to proceed.
- Do not work on issues labeled `wontfix` or `on-hold` — report and stop.
- Check the issue's dependency section. If it depends on unresolved issues, report which
  dependencies are open and stop (do not silently skip — this skill targets one explicit issue).

### Step 2 — Implement the issue

Delegate implementation to the **github-issue-implementer** agent (Tech Specialist):

```
Task tool:
  subagent_type: github-issue-implementer
  prompt: |
    You are a Tech Specialist working under a Project Manager. Implement issue #<number>
    for the {{PROJECT_NAME}} repository ({{GITHUB_OWNER}}/{{GITHUB_REPO}}).
    End your report with the PR number and URL on their own line.
```

- The agent creates a worktree, implements the change, runs quality checks, and opens a PR.
- Capture the resulting PR number/URL from the agent's output.

### Step 3 — Review the PR with a specialist panel (single pass)

Launch the review panel — one reviewer per perspective, **all in a single message** so they
run in parallel:

```
Task tool (one call per perspective, same message):
  subagent_type: code-reviewer
  prompt: |
    Review PR #<pr-number> in the {{GITHUB_OWNER}}/{{GITHUB_REPO}} repository.
    Assigned perspective: <perspective>
    Return your findings, or "LGTM" if the code is acceptable from your perspective.
```

Dispatch the `code-reviewer` agent by name — it already carries the review instructions and
runs on its own model. A general-purpose agent pointed at the same instructions inherits
your model instead, which makes the panel several times more expensive than it needs to be.

Perspectives (one reviewer each):

1. **Correctness & Requirements** — does the change do what the issue asks; bugs, edge cases, error paths
2. **Security** — injection, path traversal, unsafe operations, dependency risks
3. **Testing & Quality** — test coverage, edge-case tests, lint hygiene, debug leftovers
4. **Architecture & Performance** — design fit with the codebase, maintainability, inefficiencies

### Step 4 — Consolidate findings and apply one round of fixes

You, as PM, merge the four reviews into one verdict:

- Deduplicate findings that multiple reviewers reported (same file/line or same root cause).
- Verify questionable findings against the actual diff (`gh pr diff <pr-number>`) — discard
  false positives and pure style nitpicks.
- The verdict is **LGTM** only if no confirmed findings of medium or high severity remain.
  Confirmed low-severity findings go in the final summary instead of blocking.

Then:

- If the verdict is **LGTM**, skip to Step 5.
- Otherwise, launch a **github-issue-implementer** agent with the consolidated findings list
  and the branch name, instructing it to apply the fixes on the existing branch and push.
- Do this **exactly once**. Do **not** re-run the panel and do **not** loop.

Record the verdict on the PR so the state survives this session, and carve out whatever the
fix round did not settle:

```bash
gh pr comment <pr-number> --repo {{GITHUB_OWNER}}/{{GITHUB_REPO}} --body "$(cat <<'EOF'
<!-- issue-worker -->
Round 1: <LGTM | CHANGES REQUESTED>

- [<severity>] <file:line> — <finding> (<perspective>)
EOF
)"
```

If findings remain after the fix round, create one follow-up issue holding them — the
originating issue and PR, the branch, and each finding with its severity, `file:line`, and
the perspective that raised it. Its dependency line is always `Depends on: none`: never make
it depend on the issue it came from. Then report it in the summary.

### Step 5 — Stop with the PR open

- Do **not** merge the PR. Leave it open for human review.
- Report a final summary:
  - Issue number and title
  - PR number and URL (open)
  - Consolidated review verdict (LGTM or the findings list, with the perspectives that
    raised them)
  - Whether a fix round was applied, and any findings deferred to the human reviewer

## Rules

- **Never implement or fix code yourself** — always delegate to a Tech Specialist agent.
  Your own Bash usage is limited to `gh` queries.
- Work on exactly one issue — never loop to a second issue.
- Run the review panel only once, with at most one follow-up fix round.
- Keep your own context small: fetch the issue body once, keep only the PR number, branch,
  and consolidated findings, and never paste full diffs or full agent reports into your
  notes. Once the verdict is posted on the PR, drop the findings from your notes.
- Never open a second fix round. What the first round leaves is a follow-up issue.
- Never merge or close the PR; the end state is an open PR ready for human review.
- Confirm each step's outcome before proceeding.
- If any step fails unrecoverably, report the failure clearly and stop.
