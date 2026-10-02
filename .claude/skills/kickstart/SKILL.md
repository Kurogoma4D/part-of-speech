---
name: kickstart
description: Run the full kickstarter workflow — setup, spec, issues — in one command.
argument-hint: "[project goal in a sentence (optional)]"
---

You are orchestrating the **project-kickstarter** workflow end to end. Run the skills
below **in order**, treating each as a checkpoint: complete one, confirm the result with
the user, then move to the next. Do not skip a step unless its output already exists and
the user agrees to reuse it.

Optional context from the user: $ARGUMENTS

## Step 0 — Orient

- Briefly tell the user the workflow you will run: `spec-builder` → `template-setup` →
  `supply-chain-guard` → update README → commit & push → `spec-to-issues`, then offer
  `auto-issue-worker`, and optionally `pentest` once enough is implemented.
- Detect current state so you can skip already-done steps:
  - Does `spec.md` exist at the repository root?
  - Are there remaining `{{...}}` placeholders in `.claude/` (outside `template-setup`)?
  - Are there already open GitHub issues?

## Step 1 — Build the spec (`spec-builder`)

- Invoke the **spec-builder** skill to interview the user and produce/refresh `spec.md`.
- The spec is built first so the project metadata it captures (name, stack, structure, QA
  commands) can feed the placeholder values in the next step.
- If `spec.md` already exists, let `spec-builder` decide whether to update or restart.
- Do not proceed until the user approves the spec.

## Step 2 — Configure the template (`template-setup`)

- Invoke the **template-setup** skill to fill the `.claude/` placeholders, reusing the facts
  already recorded in `spec.md` as defaults.
- If no placeholders remain, tell the user setup is already done and continue to Step 3
  (offer to re-run only if they say project details changed).

## Step 3 — Harden the supply chain (`supply-chain-guard`)

- Invoke the **supply-chain-guard** skill to set up supply-chain guardrails based on the
  policy captured in `spec.md` (section 7): dependency pinning and frozen installs,
  install-script/registry controls, Claude Code permission boundaries, and CI hardening.
- The skill applies config changes only with the user's approval and files a GitHub issue
  per remaining risk (vulnerable deps, unpinned actions, unvetted MCP servers). Those issues
  feed `/auto-issue-worker` later.
- Doing this before the commit step ensures the hardening config is committed with the setup.

## Step 4 — Update the project README

With the requirements settled in `spec.md`, refresh the project's own `README.md` so it
describes what is actually being built.

- Read the current `README.md` (if any) and rewrite it from `spec.md`: project name and
  overview, key features (from Scope / Functional Requirements), tech stack and setup
  (from Constraints), and how to run it once known.
- Keep it a project README — describe the product, not this kickstarter template or its
  internal `.claude/` workflow.
- Preserve any still-relevant existing sections (license, badges, contribution notes).
- Show the user the result and get approval before moving on.

## Step 5 — Commit & push the setup

Now that `spec.md` exists, the placeholders are filled, the supply-chain guardrails are in
place, and the README is updated, commit and push the diff so the configured template, spec,
README, and hardening config are on the remote before issues are created.

- Show the user the diff (`git status` / `git diff`) and confirm the changes look right.
- If on the default branch, create a branch first (e.g. `kickstart-setup`).
- Stage and commit the changes — typically `spec.md`, `README.md`, the rewritten `.claude/`
  files, and any supply-chain hardening config (`.npmrc`, `.github/workflows/`,
  `dependabot.yml`, `.claude/settings.json`):

  ```bash
  git add -A   # spec.md, README.md, .claude, and any supply-chain hardening config
  git commit -m "Set up project: add spec.md, update README, configure .claude templates, harden supply chain"
  git push -u origin HEAD
  ```

- Append the standard co-author trailer to the commit message.
- If push fails (no remote, auth, protected branch), report it and ask the user how to
  proceed instead of forcing it. Do not proceed to Step 6 until the changes are pushed (or
  the user explicitly chooses to skip pushing).

## Step 6 — Break into issues (`spec-to-issues`)

- Invoke the **spec-to-issues** skill to decompose `spec.md` and register GitHub issues.
- This skill confirms the task list with the user before creating any issues — respect that.
- Capture the list of created issue numbers/URLs.

## Step 7 — Offer automated implementation (`auto-issue-worker`)

- Once issues exist, **ask the user** whether to start implementing them now.
- Only if they confirm, invoke the **auto-issue-worker** skill.
- This step makes real code changes and PRs, so never start it without explicit approval.

## Step 8 — Penetration test (`pentest`, optional)

- Once enough of the project is implemented to be worth probing, **ask the user** whether to
  run an authorized penetration test.
- Only if they confirm, invoke the **pentest** skill. It combines static analysis and dynamic
  testing against the locally-run app, then files confirmed vulnerabilities as GitHub issues.
- The created security issues can be fed back into `/auto-issue-worker` to drive the fixes.
- Skip this step if there is not yet enough implemented to test meaningfully.

## Rules

- Invoke each skill via its Skill tool — do not reimplement their logic inline.
- Stop and report if any step fails; do not silently continue to the next step.
- Respect every in-skill confirmation gate (spec approval, task-list approval, issue creation).
- After the workflow, give a short summary: what was configured, the spec path, the issues
  created, and whether implementation was started.
