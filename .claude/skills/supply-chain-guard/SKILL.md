---
name: supply-chain-guard
description: |
  Harden the project against software supply-chain attacks across two layers: project
  dependencies (lockfile pinning, audits, install-time script controls) and the CI/build
  pipeline (SHA-pinned actions, least-privilege tokens, Dependabot/Renovate). Sets up the
  guardrails with the user's approval, then audits existing dependencies and files a GitHub
  issue per remaining risk. Use during environment setup, or whenever dependencies or CI
  change. Invoke with `/supply-chain-guard`. The created issues are consumed by
  `/auto-issue-worker`.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---

# Supply Chain Guard

You harden the **{{PROJECT_NAME}}** repository (`{{GITHUB_OWNER}}/{{GITHUB_REPO}}`) against
software supply-chain attacks. You do two things:

1. **Establish guardrails** — apply preventive configuration (dependency pinning, install
   script controls, CI hardening) so a compromised or malicious dependency or action has a
   much smaller blast radius.
2. **Audit and triage** — scan what already exists for known-vulnerable or unpinned
   dependencies and file one GitHub issue per remaining risk so `/auto-issue-worker` can
   drive the fixes.

This is defensive, authorized work on the user's own project. Every change that touches a
config file or files an issue goes through the user's approval first.

Project tech stack (use it to pick the right package manager, registry, and CI specifics):

{{TECH_STACK}}

## Workflow

### Step 1 — Detect the stack and current posture

Identify what the project uses so later steps target the right tooling. Do **not** modify
anything yet.

- Detect package manager(s) and ecosystems from manifests and lockfiles:
  `package.json` + (`package-lock.json` | `pnpm-lock.yaml` | `yarn.lock` | `bun.lockb`),
  `pyproject.toml` / `requirements*.txt` + (`poetry.lock` | `uv.lock`), `Cargo.toml` +
  `Cargo.lock`, `go.mod` + `go.sum`, `Gemfile` + `Gemfile.lock`, etc.
- Note which lockfiles exist and whether they are committed (`git ls-files`).
- Detect CI: list `.github/workflows/*.yml` and any existing `dependabot.yml` /
  `renovate.json`.
- Summarize the current posture to the user before proposing changes.

### Step 2 — Layer 1: project dependency guardrails

Propose the applicable items below for the detected ecosystems, show the exact diffs, and
apply only what the user approves.

- **Commit and verify lockfiles.** Every ecosystem with a lockfile must have it committed.
  In CI and local installs, use frozen/locked installs so resolution cannot drift:
  `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`,
  `pip install --require-hashes` (or `uv sync --frozen`), `cargo build --locked`,
  `go mod verify`.
- **Pin exact versions.** Discourage floating ranges for direct deps where practical
  (e.g. npm `.npmrc` with `save-exact=true`; document the policy for others).
- **Control install-time scripts.** Arbitrary `postinstall` scripts are a primary supply-chain
  vector. For npm/pnpm/yarn, propose `ignore-scripts=true` in `.npmrc` (or pnpm
  `onlyBuiltDependencies` allowlist) and document which packages legitimately need scripts.
- **Pin the registry.** Set the registry explicitly in `.npmrc` / `pip.conf` / `.cargo/config.toml`
  to prevent dependency-confusion via alternate registries. For private scopes, bind the
  scope to its registry.
- **Run an audit** appropriate to the stack and capture results for Step 5:
  `npm audit` / `pnpm audit` / `yarn npm audit`, `pip-audit`, `osv-scanner -r .`,
  `cargo audit`, `govulncheck ./...`, `bundle audit`. If a tool is not installed, note it
  and prefer `osv-scanner` as the cross-ecosystem fallback (or recommend installing it).

Example `.npmrc` hardening (confirm before writing):

```ini
save-exact=true
ignore-scripts=true
audit-level=moderate
registry=https://registry.npmjs.org/
```

### Step 3 — Layer 2: CI / build pipeline guardrails

Harden GitHub Actions (or the project's CI) with the user's approval. Show diffs first.

- **Pin actions to a full commit SHA**, not a moving tag — `uses: actions/checkout@<40-char-sha>`
  with the human-readable version in a trailing comment. Floating tags (`@v4`, `@main`) let a
  compromised action push malicious code into your pipeline.
- **Least-privilege tokens.** Add a top-level `permissions: { contents: read }` and grant more
  only per-job where needed. Avoid `write-all`.
- **Don't leak the checkout token.** Set `persist-credentials: false` on `actions/checkout`
  unless the job genuinely needs to push.
- **Verify lockfiles in CI.** Use the frozen-install commands from Step 2 so CI fails if the
  lockfile and manifest disagree.
- **Automated dependency updates.** Propose `dependabot.yml` (or Renovate) so updates are
  reviewable PRs.
- **Optional:** `step-security/harden-runner` for egress control, and OpenSSF Scorecard for an
  ongoing posture score. Offer these; do not force them.
- **`dependency-review` workflow** (`actions/dependency-review-action` /
  `dependency-review.yml`): do not add it on your own. Ask the user whether they want it,
  explain that it reviews dependency changes on PRs (and that it needs a GitHub plan with the
  dependency graph enabled — Advanced Security on private repos), and add it only if they
  approve.

### Step 4 — Triage findings and confirm with the user

Consolidate everything that the guardrails could not fix automatically — known
vulnerabilities from the audits, unpinned actions you could not safely rewrite, missing
lockfiles in ecosystems you do not control. For each:

- Assign a **severity** (Critical / High / Medium / Low) by impact and exploitability.
- De-duplicate items sharing one root cause into a single issue.
- Present a table and get approval on what to file before creating any issue:

| # | Title | Severity | Layer (dep / ci) | Location | Fix |
|---|-------|----------|------------------|----------|-----|

- Do not create issues until the user approves the list.

### Step 5 — Create the issues

For each approved finding, create an issue with `gh`, keeping the body compatible with
`/auto-issue-worker`:

```bash
gh issue create \
  --repo {{GITHUB_OWNER}}/{{GITHUB_REPO}} \
  --title "[supply-chain] <concise risk title>" \
  --label "supply-chain" \
  --body "$(cat <<'EOF'
## Summary
<The supply-chain risk and its impact, in one or two sentences.>

## Severity
<Critical | High | Medium | Low> — <layer: dependency | ci>

## Location
<file:line / manifest / workflow affected>

## Details
<Why this is exploitable: e.g. vulnerable version + advisory ID, unpinned action, postinstall risk.>

## Remediation
<Recommended fix — target version, SHA to pin to, config to add.>

## Acceptance Criteria
- [ ] The risk is remediated as described above
- [ ] Lockfiles / pins are committed and CI verifies them
- [ ] The fix does not regress existing functionality
- [ ] E2E behavior is verified and guaranteed at the completion of this task

## Dependencies
- <Depends on #<n>, or "None">
EOF
)"
```

Rules for issue creation:

- Apply a `supply-chain` label (create it with `gh label create supply-chain` if missing,
  after confirming with the user). Add a severity label too if the project uses them.
- Order issues by severity (Critical/High first) so they surface earlier to `/auto-issue-worker`.
- **Redact real secrets** — describe the location, never paste the value.
- Every issue's **Acceptance Criteria** must include
  "E2E behavior is verified and guaranteed at the completion of this task".

### Step 6 — Report

- Summarize the guardrails applied (which config files changed) and the issues filed
  (number/URL per finding).
- Note anything you recommended but the user declined, and any audit tool that was missing.
- Tell the user they can run `/auto-issue-worker` to drive the remaining fixes.

## Rules

- **Authorized, defensive scope only**: harden this repository and its tooling. Do not probe
  third-party systems.
- **Approve before applying**: show the exact diff for every config change and the full list
  before filing issues. Never weaken an existing security rule without explicit confirmation.
- **Non-destructive audits**: run audit/scan tools in read-only mode; do not auto-upgrade
  dependencies without approval.
- Use the same language as `spec.md` for issue titles and bodies.
- Never add a `dependency-review` workflow (`actions/dependency-review-action` /
  `dependency-review.yml`) on your own; ask the user first and add it only with approval.
- Do not commit changes unless the user explicitly asks.
- If `gh` fails (auth, permissions, missing repo), report the error clearly and stop.
