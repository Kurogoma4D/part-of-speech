---
name: template-setup
description: |
  Fill in the template placeholders across the `.claude/` agents and skills based on an
  interview about the target project. Use right after copying this kickstarter template
  into a project, or when project details change and the placeholders need refreshing.
  Invoke with `/template-setup`.
allowed-tools:
  - Read
  - Edit
  - Bash
  - AskUserQuestion
---

# Template Setup

You configure this kickstarter template for a concrete project by replacing every
`{{...}}` placeholder in the `.claude/` agents and skills with real values gathered from
the user. After this skill runs, `/spec-builder`, `/spec-to-issues`, and
`/auto-issue-worker` are ready to use against the user's repository.

The template supports both Claude Code and Codex:

- Skills are shared. `.agents/skills` is a symlink to `.claude/skills`, so filling a skill's
  placeholders covers both agents at once.
- Subagents are defined separately for each agent: `.claude/agents/*.md` (Claude) and
  `.codex/agents/*.toml` (Codex). Both are source files and both carry the same placeholders,
  so fill them in both.

## Workflow

### Step 1 — Discover the placeholders and files

Scan the `.claude/` directory and the Codex subagents for remaining placeholders,
**excluding this skill's own directory** so its instructions are never rewritten:

```bash
{ grep -rno '{{[A-Z_]*}}' .claude --include='*.md' \
    | grep -v '.claude/skills/template-setup/'
  grep -rno '{{[A-Z_]*}}' .codex/agents 2>/dev/null
} | sort -u
```

- List which files contain which placeholders.
- If no placeholders remain, tell the user setup is already complete and ask whether they
  want to re-run anyway (e.g. project details changed). Stop if not.

### Step 2 — Gather facts automatically

Before asking the user, infer what you can and use it as defaults to confirm.

**Prefer `spec.md` if it exists.** If `/spec-builder` has already produced a `spec.md` at
the repository root, read it first — it is the richest source of project facts:

- `PROJECT_NAME`, `PROJECT_DESCRIPTION`, `PROJECT_SHORT_DESCRIPTION` ← Overview section.
- `PROJECT_STRUCTURE`, `KEY_DEPENDENCIES`, `LANGUAGE_VERSION_NOTE`, `TECH_STACK`,
  `QA_COMMANDS` ← Constraints section (tech stack, platforms, dependencies, tooling).
- Use these as pre-filled defaults; only ask the user to confirm or fill what `spec.md`
  does not cover. If there is no `spec.md`, suggest running `/spec-builder` first, but
  proceed with the interview if the user prefers.

Also inspect the repository directly:

```bash
git remote get-url origin 2>/dev/null   # derive GITHUB_OWNER / GITHUB_REPO
basename "$(git rev-parse --show-toplevel)"  # candidate PROJECT_NAME
```

- Parse the remote URL (`git@github.com:owner/repo.git` or `https://github.com/owner/repo`)
  into `GITHUB_OWNER` and `GITHUB_REPO`.
- Inspect the repo for stack hints (e.g. `package.json`, `Cargo.toml`, `pyproject.toml`,
  `go.mod`, `build.gradle`) to fill gaps in `TECH_STACK`, `KEY_DEPENDENCIES`, `QA_COMMANDS`.

### Step 3 — Interview the user

Use `AskUserQuestion` to confirm the inferred values (from `spec.md` and the repo) and fill
whatever remains. Group questions so the user is not overwhelmed, and skip anything already
confidently derived from `spec.md`. Collect a value for **every** placeholder found in Step 1:

| Placeholder | What to ask / infer |
|---|---|
| `PROJECT_NAME` | Project name (default: repo directory name) |
| `PROJECT_DESCRIPTION` | One-sentence description of what the project is |
| `PROJECT_SHORT_DESCRIPTION` | One-line project summary used by `auto-issue-worker` |
| `GITHUB_OWNER` | GitHub owner/org (default: from `origin` remote) |
| `GITHUB_REPO` | GitHub repo name (default: from `origin` remote) |
| `PROJECT_STRUCTURE` | Directory/module layout of the project |
| `KEY_DEPENDENCIES` | Main libraries/frameworks |
| `LANGUAGE_VERSION_NOTE` | Language version and notable language features |
| `TECH_STACK` | Tech stack bullet list (language, framework, DB, testing, package manager) |
| `LANGUAGE_SPECIFIC_REVIEW_CRITERIA` | Language-specific review focus (for code-reviewer) |
| `LANGUAGE_SPECIFIC_REVIEW_RULES` | Language-specific review rules (for code-reviewer) |
| `LANGUAGE_SPECIFIC_IMPLEMENTATION_GUIDELINES` | Implementation guidelines (for issue-implementer) |
| `QA_COMMANDS` | QA commands run before a PR (build, lint, format, test) |
| `KNOWN_FLAKY_TESTS` | Known unstable tests/suites that can fail without a real regression (default: "none known") |

Rules:

- Propose concrete defaults (especially for the inferred and language-specific values) and
  let the user accept or override. The kickstarter README contains worked examples for the
  multi-line placeholders — offer those as a starting point matching the user's language.
- For multi-line placeholders (`TECH_STACK`, `QA_COMMANDS`, etc.), confirm the full
  markdown block with the user before applying.
- Do not leave any placeholder unanswered. If the user is unsure, suggest a sensible value
  and confirm rather than inventing silently.

### Step 4 — Apply the replacements

For each placeholder, replace **all** occurrences across the matching files using `Edit`
with `replace_all: true` (one Edit per file per placeholder). Never edit any file under
`.claude/skills/template-setup/`.

- Replace the entire token including the braces (e.g. the `PROJECT_NAME` token) with the
  confirmed value.
- For multi-line values, ensure the surrounding markdown (list indentation, code fences)
  stays valid.

The same placeholders live in both subagent formats, so fill `.claude/agents/*.md` (Claude)
and `.codex/agents/*.toml` (Codex) with the same values. In the `.toml` files, keep multi-line
values inside their existing `'''` blocks so the file stays valid TOML.

Skills need no equivalent step — `.agents/skills` is a symlink to `.claude/skills`, so the
filled skill files are shared with Codex automatically.

### Step 5 — Verify and report

Re-run the Step 1 scan to confirm no placeholders remain (outside this skill), in both the
`.claude/` files and the Codex subagents:

```bash
grep -rno '{{[A-Z_]*}}' .claude --include='*.md' \
  | grep -v '.claude/skills/template-setup/'
grep -rno '{{[A-Z_]*}}' .codex/agents 2>/dev/null
```

- If any remain in either location, fill them.
- Report a summary of placeholder → value mappings and the files changed.
- Tell the user the next step: run `/spec-builder` to start gathering requirements.

### Step 6 — Record the template sync point

So that `/template-update` can later pull upstream template changes with a 3-way merge,
record the commit this repo currently matches in `.claude/.template-version`. Fetch the
template HEAD (this repo was just created from it, so HEAD is the correct base):

```bash
TEMPLATE_REPO=https://github.com/Kurogoma4D/project-kickstarter.git
git fetch --no-tags "$TEMPLATE_REPO" main && git rev-parse FETCH_HEAD
```

Write `.claude/.template-version` (skip silently if the fetch fails — `/template-update`
can bootstrap it later):

```
TEMPLATE_REPO=https://github.com/Kurogoma4D/project-kickstarter.git
TEMPLATE_REF=main
TEMPLATE_BASE_SHA=<the sha printed above>
```

## Rules

- **Never** modify files under `.claude/skills/template-setup/` — that would corrupt this
  skill for future runs.
- Confirm every value with the user before writing; this skill edits multiple files at once.
- Do not commit changes unless the user explicitly asks.
- If the repository has no `origin` remote, ask the user for `GITHUB_OWNER`/`GITHUB_REPO`
  directly instead of failing.
