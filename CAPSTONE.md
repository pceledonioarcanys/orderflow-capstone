# Week 3 Capstone — One Real Feature, Your Stack

Everything you need for the capstone is in this zip. Read this file top to bottom before you start; it is the whole brief.

## What this is

You deliver one feature, end-to-end, using the full workflow from the last three weeks: explore the codebase, write a SPEC, write failing tests first, implement with Claude Code (single agent or the Day 3 orchestration — your call), review with your standing team, and ship a pull request with green CI. The stack is yours; the workflow is what's assessed. It's roughly **half a day of focused work**, and it may run past the session — submission is due **before the Day 5 session starts**. On Day 5 you present it.

## Before the capstone day (do this the evening before — ~30–45 min)

Pick the codebase you'll work on:

- **Your own stack (recommended):** fork a small open-source project in your preferred stack to your GitHub account. It should have an existing test suite that runs locally **without paid services**, with one command (`npm test`, `dotnet test`, `pytest`, …), and be small enough that you can explain its structure after 30 minutes of exploration. Get the tests green locally, push the fork, and add a GitHub Actions workflow that runs that same test command — confirm the Actions tab shows green. Then copy two things from this zip into your fork: `.claude/skills/arcanys-session-export/` and (if you don't have your own yet) `.claude/settings.json` as your security baseline.
- **The fallback:** if you'd rather not hunt for a repo, or your pick won't go green — use the OrderFlow project in this zip. Push it to a repo on your GitHub account and add the same Actions workflow. Same task, same rules, no penalty.
- **Never client code.** Open-source or your own personal project only. No exceptions.

## The task

Pick one feature — from this pool, adapted to your repo, or your own idea of the same size:

pagination on an endpoint that returns everything · audit logging on the state-changing operations of one module · a role/permission check on existing endpoints · input-validation hardening on one boundary with consistent error responses · rate limiting on a public endpoint · a cache with explicit invalidation for one hot path · internationalisation of one user-facing feature · a filtered CSV/JSON export for an existing resource.

**Sizing rule:** half a day, touches at least three files, needs both new code and changes to existing code, and has at least one genuinely non-obvious decision. If it needs a diagram to explain, it's too big.

## How to work

1. **Explore first.** Understand the code you'll touch before you plan (Week 1 discipline).
2. **SPEC.md before any code.** In the repo root: which files change, in what order, a testable definition of done, and how you'll verify — including your one test command.
3. **Failing tests before the implementation.** Write tests that encode the SPEC, commit them, watch them fail for the right reason. These commits must come before your implementation commits — **your git history is your proof, so no squashing or force-pushing anywhere in the capstone.**
4. **Port your standing team.** Your `specs-reviewer` and `test-auditor` from Day 3 go into the fork's `.claude/agents/`, with your repo's test command in their tools instead of `npm test`.
5. **Implement — your shape.** Plan mode first. One agent or an orchestrated fan-out, your call — you'll justify it in PROCESS.md. Loop until tests **and** your reviewer pass. At least one FAIL → fix → re-pass should appear in your transcript; if everything sails through, make the reviewer stricter until it earns its keep.
6. **Write two short files as you go:**
   - **REVIEW.md** — an honest SPECS pass over your final diff, with a real Security section (inputs, authorisation, new attack surface).
   - **PROCESS.md** — the prompts that mattered, **what Claude got wrong and how you caught it** (you'll present this on Day 5), and whether your single-agent-vs-orchestra call was right.
7. **Ship.** Push the branch, open the PR on your fork, confirm the Actions run on it is green, and read the whole final diff yourself — in the session, out loud to Claude if you like, but read it.

## What to submit (before the Day 5 session)

1. Run the **arcanys-session-export** skill in your working session and fill in the Analysis — point it at your evidence: which commits are the failing tests, where the FAIL → fix → re-pass happened, where you read the final diff. Then zip it: say *"zip my export for submission"*, or run:

   ```bash
   node .claude/skills/arcanys-session-export/scripts/export-session.js --zip
   ```

   (Run it from your repo's root. Terminal CLI or the VS Code extension panel both work.)
2. Upload the `.zip` to the assignment, and paste **three links** in the text reply: your repo, the PR, and the green Actions run.

## How it's graded

The TA never runs your code — everything is checked from your evidence, so it works in any stack. Six things, all visible in what you submit:

- [ ] **SPEC.md written before the implementation** (commit order shows it) and the work roughly followed it — or PROCESS.md says why not.
- [ ] **Failing tests committed before the implementation**, red for the right reason, never weakened afterwards.
- [ ] **The diff fits the repo** — matches its existing patterns, no drive-by refactors, as small as the feature allows.
- [ ] **REVIEW.md's security section is real** — specific to this change, not boilerplate.
- [ ] **The evidence is complete** — green Actions run on the PR branch, both agent files in `.claude/agents/` adapted to your stack, one genuine FAIL → fix → re-pass in the export, the final diff read by you.
- [ ] **PROCESS.md shows judgment** — at least one concrete Claude mistake you caught, and an honest call on the shape you chose.

A smaller finished feature with a complete evidence trail always beats an ambitious half-feature. If you're past six hours, shrink the scope in SPEC.md and say so in PROCESS.md — that *is* the disciplined move.
