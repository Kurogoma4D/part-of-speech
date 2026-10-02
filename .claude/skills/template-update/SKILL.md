---
name: template-update
description: |
  Pull updates from the kickstarter template into a working repository created from it,
  using a per-file 3-way merge so project-specific placeholder values are preserved and
  only the template's own changes are applied. Use when the upstream template has been
  updated and you want those changes reflected here. Invoke with `/template-update`.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

# Template Update

You bring updates from the upstream kickstarter template into a working repository that was
created from it (via GitHub's "Use this template", so there is **no** shared git history).

The template ships files for both Claude Code and Codex. The template-owned paths are
`.claude/` (Claude skills and subagents), `.agents/skills` (a symlink to `.claude/skills`),
and `.codex/agents/*.toml` (Codex subagents). Skills and both subagent formats are all source
files carrying `{{...}}` placeholders, so all of them are merged the same way.

The working repo's `.claude/` files have had their `{{...}}` placeholders replaced with real
project values by `/template-setup`. A naive overwrite would lose those values, so you apply
the template's changes with a **per-file 3-way merge**:

- `base` — the template file at the commit this repo was last synced to (still has placeholders).
- `theirs` — the template file at the latest commit (still has placeholders).
- `ours` — the working file on disk (placeholders already filled in).

`git merge-file` replays the `base → theirs` diff (the template's actual edits) onto `ours`,
leaving filled placeholders untouched. A conflict is raised where a template edit lands on or
next to a filled-placeholder line (the two changes share one diff hunk) — this is expected
near placeholders, and resolving it is mechanical: keep `ours`' value, take `theirs`' change.

## The version marker

The sync point is recorded in `.claude/.template-version` (committed in the working repo,
**not** present in the template itself):

```
TEMPLATE_REPO=https://github.com/Kurogoma4D/project-kickstarter.git
TEMPLATE_REF=main
TEMPLATE_BASE_SHA=<commit sha last synced to>
```

`TEMPLATE_BASE_SHA` is the `base` for the next merge. This skill updates it after a
successful sync.

## Workflow

### Step 1 — Locate the template and the base commit

Read `.claude/.template-version` if it exists and parse the three values.

If it is **missing** (e.g. this repo predates the marker), bootstrap it:

- Default `TEMPLATE_REPO` to `https://github.com/Kurogoma4D/project-kickstarter.git`
  and `TEMPLATE_REF` to `main`; confirm with the user via `AskUserQuestion` if unsure.
- The base SHA is the template commit this repo was originally created from. Fetch the
  template (Step 2) and show recent commits so the user can pick it:

  ```bash
  git log --oneline -20 FETCH_HEAD
  ```

  If the user does not know, offer two choices: (a) treat the **current** template HEAD as
  the base and apply nothing this run (records the marker so future runs merge cleanly), or
  (b) pick the oldest listed commit to replay the full history of template changes (more
  likely to produce conflicts). Recommend (a) unless they know they are behind.

### Step 2 — Fetch the latest template without touching `origin`

Fetch directly from the URL into `FETCH_HEAD` — do **not** add a permanent remote:

```bash
git fetch --no-tags "$TEMPLATE_REPO" "$TEMPLATE_REF"
NEW=$(git rev-parse FETCH_HEAD)
```

`$NEW` is the latest template commit. Because the base SHA is an ancestor of the fetched
branch, its objects are now reachable too.

If `$NEW` equals `TEMPLATE_BASE_SHA`, the repo is already up to date — report that and stop.

### Step 3 — Compute the set of changed template files

List the template-owned files that differ between the base and the latest template commit:

```bash
git diff --name-status "$TEMPLATE_BASE_SHA" "$NEW" -- .claude/ .agents/ .codex/
```

Classify each path:

- **Modified** (in both base and new) → 3-way merge (Step 4a).
- **Added** (in new only) → new template file (Step 4b).
- **Deleted** (in base only) → propose removal (Step 4c).

Notes:

- `.codex/agents/*.toml` are source files with the same placeholders as `.claude/agents/*.md`,
  so merge them the same way.
- The `.agents/skills` symlink is committed as a symlink — restore it if missing.
- Ignore `.claude/.template-version` itself — it is local-only and never comes from the template.

### Step 4 — Apply changes per file

**4a — Modified files (3-way merge).** For each modified path that also exists on disk:

```bash
git show "$TEMPLATE_BASE_SHA":"$path" > /tmp/tu_base
git show "$NEW":"$path"               > /tmp/tu_theirs
# merge in place: ours (working file) <- base -> theirs
git merge-file -p --diff3 "$path" /tmp/tu_base /tmp/tu_theirs > /tmp/tu_merged
```

- If `git merge-file` exits `0` (no conflict), overwrite `path` with `/tmp/tu_merged` (use
  `Write`, or `cp /tmp/tu_merged "$path"`).
- If it exits non-zero (conflicts), the merged output contains `<<<<<<< / ||||||| / >>>>>>>`
  markers. Write it to disk, then **read the file and resolve each conflict by hand**: keep
  the working repo's filled placeholder values, take the template's surrounding changes, and
  remove every marker. Re-read to confirm no markers remain.
- If a modified path does **not** exist on disk (locally deleted), ask the user whether to
  re-introduce it from the template or skip it.

**4b — Added files.** Files new in the template are written as-is and still contain
placeholders. Create the file from `git show "$NEW":"$path"`, then run `/template-setup`
afterwards (Step 6) to fill the new placeholders.

**4c — Deleted files.** Never delete silently. List files removed upstream and ask the user
whether to delete them locally; only remove the ones they confirm.

### Step 5 — Verify the merge

- Confirm no conflict markers remain anywhere:

  ```bash
  grep -rn '^<<<<<<< \|^>>>>>>> \|^||||||| ' .claude .codex/agents || echo "clean"
  ```

- Show the user `git diff -- .claude/ .agents/ .codex/` so they can review exactly what
  changed.
- If any placeholders were re-introduced (added files, or template lines that re-added a
  token), report them:

  ```bash
  grep -rno '{{[A-Z_]*}}' .claude --include='*.md' \
    | grep -v '.claude/skills/template-setup/'
  grep -rno '{{[A-Z_]*}}' .codex/agents 2>/dev/null
  ```

### Step 6 — Record the new base and report

Update the marker to the freshly-synced commit:

```bash
# rewrite only the TEMPLATE_BASE_SHA line, keeping REPO/REF
```

Use `Edit` to set `TEMPLATE_BASE_SHA=$NEW` in `.claude/.template-version` (create the file
from the Step 1 values if it did not exist).

Then summarize:

- Files merged cleanly / merged with manual conflict resolution / added / deleted.
- Any re-introduced placeholders — recommend running `/template-setup` to fill them.
- Remind the user to review `git diff` and commit when satisfied.

## Rules

- Operate only inside the template-owned paths (`.claude/`, `.agents/`, `.codex/`). Never
  touch application code or other project files, including the project's own `README.md`.
- Keep the two subagent formats consistent — `.claude/agents/*.md` and `.codex/agents/*.toml`
  describe the same agents, so a change merged into one usually has a counterpart in the other.
- Preserve filled placeholder values — when resolving a conflict, the working repo's value
  wins over the template's placeholder token.
- Do not add a permanent git remote; fetch by URL into `FETCH_HEAD`.
- Do not commit unless the user explicitly asks.
- If `git fetch` fails (network/auth), report it and stop rather than guessing.
- `.claude/.template-version` is local to the working repo — never expect it from the
  template, and never overwrite the `TEMPLATE_REPO`/`TEMPLATE_REF` lines the user set.
