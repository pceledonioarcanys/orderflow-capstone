---
name: arcanys-session-export
description: Export the current Claude Code session as a markdown file ready to attach to an Arcanys training assignment. Use when the user has finished a Day 1–5 exercise and wants to submit a session export to TalentLMS, or when they say "export this session", "save this session as markdown", "make a session log", "package this for submission", or "create a submission file". Produces a structured markdown with a fillable Analysis section at the top and the full verbatim transcript below.
---

# Arcanys Session Export

This skill exports the user's current Claude Code session as a markdown file
they can fill in and submit to TalentLMS.

## When to use this skill

Trigger when the user asks to:
- Export, save, dump, or package the current session
- Create a submission file for a Day 1–5 assignment
- Get a markdown copy of their prompts and the agent's responses
- Prepare a session export for the Arcanys TalentLMS course

## What the skill does

It runs a single Node.js script that:
1. Locates the user's current Claude Code session JSONL on disk (under
   `~/.claude/projects/<sanitised-cwd>/`)
2. Picks the most recently modified `.jsonl` for the current working directory
3. Parses verbatim user prompts and assistant responses (skips internal
   tool-result wrappers, internal thinking blocks, and queue events)
4. Writes a markdown file with two parts:
   - **Analysis (FILL IN)** — a placeholder section the user fills in before
     uploading. The placeholder lists what each Day 1–5 assignment needs.
   - **Transcript** — every prompt and response in chronological order with
     timestamps, plus a one-line summary of every tool call.
5. Prints the output path and the next steps (fill in the Analysis section,
   then package as a `.zip` for upload).

The same script also **packages a finished export as a `.zip`** (via `--zip`).
This matters because **TalentLMS does not accept `.md` uploads** — learners must
upload the zipped copy. The zip step is run *after* the Analysis section is
filled in (the script uses a pure-Node zip writer, so no external zip tool is
needed on any OS).

## How to invoke it

Run the bundled script with Node.js. Default invocation, no flags needed:

```bash
node "$HOME/.claude/skills/arcanys-session-export/scripts/export-session.js"
```

This writes the export to the current working directory as
`session-export-<timestamp>.md`.

Common flags the user may ask for:

```bash
# Pick the destination file:
node "$HOME/.claude/skills/arcanys-session-export/scripts/export-session.js" \
  --out day-3a-submission.md

# Pick a specific past session by UUID (use --list first to see options):
node "$HOME/.claude/skills/arcanys-session-export/scripts/export-session.js" \
  --session 7c257a59-6fb1-4948-9401-a46662259b27

# List available sessions for the current project:
node "$HOME/.claude/skills/arcanys-session-export/scripts/export-session.js" \
  --list

# Include tool calls inline as collapsible blocks (default: one-line summaries):
node "$HOME/.claude/skills/arcanys-session-export/scripts/export-session.js" \
  --include-tools

# Include the agent's internal thinking blocks (default: skipped):
node "$HOME/.claude/skills/arcanys-session-export/scripts/export-session.js" \
  --include-thinking

# Package a FINISHED export as an uploadable .zip (run after filling in Analysis;
# TalentLMS rejects .md). With no path it zips the newest session-export-*.md here:
node "$HOME/.claude/skills/arcanys-session-export/scripts/export-session.js" \
  --zip
# ...or name the file explicitly:
node "$HOME/.claude/skills/arcanys-session-export/scripts/export-session.js" \
  --zip session-export-2026-01-04-10-00-00.md
```

## What you (the agent) should do when this skill is invoked

1. **Confirm the user is ready to export.** Ask if they want the most recent
   session (default) or a specific one (use `--list` to show options).
2. **Run the script** in the user's current working directory. Pass `--out`
   if the user named a destination filename, otherwise let the default
   timestamped name apply.
3. **Read the script's output** and report to the user:
   - The output file path
   - The number of user prompts and assistant turns captured
   - The reminder to fill in the Analysis section
4. **Optionally help the user fill in the Analysis section.** If they say
   "fill in the analysis for me" or "I did Day 4a", read the relevant
   assignment brief in the user's TalentLMS bundle (or in this repo at
   `talent lms/Week 1/Day N/05-assignment.md`) and pre-fill what the brief
   asks for, leaving subjective items (tier choices, verification notes,
   reflections) flagged as `TODO:` for the user.
5. **Do not edit the Transcript section.** The agent's job is to fill the
   Analysis. The Transcript is the verbatim record.
6. **Package for upload.** Once the Analysis section is filled in, run the
   script again with `--zip` to produce the uploadable `.zip` (TalentLMS does
   not accept `.md`). Tell the user to upload that `.zip`, not the `.md`.

## Requirements

- Node.js (any modern version). Already installed if the user is running
  Claude Code, since Claude Code itself is a Node application.
- Read access to `~/.claude/projects/`. (Override with `CLAUDE_HOME` env var
  for non-default install locations or sandboxed environments.)

## What gets exported, what does not

**Included:**
- User prompts (verbatim)
- Assistant text responses (verbatim)
- Tool calls (one-line summary by default; full input with `--include-tools`)
- Attached files (filename only)
- Timestamps for every prompt and response
- Session metadata header (session ID, project, started/ended, totals)

**Excluded by default:**
- Tool-result wrappers (the JSON the assistant receives back from a tool —
  these are internal plumbing, not user-facing)
- Queue and system events
- Assistant thinking blocks (internal reasoning)

The user can opt into including thinking and full tool inputs with the
relevant flags above.

## Failure modes and recovery

- **"No Claude Code projects directory at …"** — The script could not find
  `~/.claude/projects/`. Either Claude Code is installed in a non-default
  location (set `CLAUDE_HOME=/path/to/.claude`) or the user has not yet had
  any sessions in this project (run a session first).
- **"Could not find a project directory for cwd …"** — The current working
  directory does not match any tracked Claude Code project. Try `--cwd
  /path/to/project` to point at the right one, or `--list` from the right
  directory to see what's tracked.
- **"Ambiguous Claude Code project directory …"** — Two or more tracked
  projects match (common because every assignment's working dir is named
  `06-practice-codebase`). The script refuses to guess rather than attach the
  wrong day's transcript. Re-run with `--cwd "<full path to the day's folder>"`
  or `--session <uuid>` (from `--list`) to disambiguate.
- **"No sessions found"** — The project directory exists but contains no
  `.jsonl` files. The user has not run a session in this project, or
  sessions have aged out per `cleanupPeriodDays` (default ~30 days).

## After the export

Tell the user:

1. Open the output `.md` file.
2. Replace the `Analysis (FILL IN BEFORE SUBMITTING)` section with what the
   assignment brief asks for.
3. Package it as a `.zip`: re-run the script with `--zip` (it zips the newest
   `session-export-*.md` in the folder, or pass the filename). **TalentLMS does
   not accept `.md` uploads — you must upload the `.zip`.**
4. Upload the resulting `.zip` to the TalentLMS Assignment unit for the day they
   just completed.
