# Arcanys Session Export — Claude Code Skill

A Claude Code skill that exports the current session as a structured
markdown file ready to attach to an Arcanys TalentLMS assignment.

## What it does

After you finish a Day 1–5 exercise, ask Claude to "export this session" (or
run the script directly). You get a single markdown file with:

- A header with the session ID, project, start/end timestamps, and
  prompt/response counts.
- An **Analysis** section at the top — a placeholder you fill in with what
  the assignment asks for (verification notes, tier choices, reflections,
  etc.).
- A **Transcript** section — every prompt and response in chronological
  order with timestamps, plus one-line summaries of each tool call.

Then package it for upload: re-run the script with `--zip` to produce a
`session-export-<timestamp>.zip` (TalentLMS does not accept `.md` files), and
upload that `.zip` as your assignment submission.

## Why this skill exists

Without it, learners have to copy-paste prompts and responses from their
terminal into a template by hand. That is slow, error-prone, and
inconsistent across the cohort. With it, the mechanical work disappears and
the learner only has to write the analysis (which is the actual learning
artifact).

## Requirements

- **Node.js** — already installed if you have Claude Code, since Claude
  Code itself is a Node application.
- **Read access to `~/.claude/projects/`** — where Claude Code stores
  session transcripts. Override with `CLAUDE_HOME=/path/to/.claude` if
  needed.

That's it. No Python, no npm dependencies, no global installs. Pure
built-in Node modules.

## Install

Two options. The first is what learners get by default — no install at all.

### Option 1 — project-scoped (recommended for Arcanys learners)

Each Arcanys assignment zip already contains this skill at
`.claude/skills/arcanys-session-export/`. Just unzip and run Claude Code
from the extracted folder:

```bash
cd path/to/extracted/Week1\ -\ Day1
claude
```

Claude Code auto-discovers the skill from `.claude/skills/`. Nothing to
copy, nothing to install. The skill is available for the duration of any
session you start in that folder.

### Option 2 — global install (if you want it available in every project)

Copy the skill folder into your `~/.claude/skills/`:

**macOS / Linux:**
```bash
mkdir -p ~/.claude/skills
cp -r path/to/arcanys-session-export-skill ~/.claude/skills/arcanys-session-export
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills"
Copy-Item -Recurse "path\to\arcanys-session-export-skill" "$HOME\.claude\skills\arcanys-session-export"
```

That's it. Next time you start a Claude Code session — anywhere — the
skill is available.

### Both at once

You can have the skill in both locations. Project-scoped takes
precedence in its own directory; global covers everything else. There
is no conflict.

## Use it

In any Claude Code session, say something like:

- *"Export this session as markdown."*
- *"Save this session for submission."*
- *"Create a Day 3a submission file."*

Claude will run the skill, produce a `session-export-<timestamp>.md` file
in your current working directory, and tell you the path. Open the file,
fill in the **Analysis** section at the top with what the assignment brief
asks for, then say *"zip my export for submission"* (or run the script with
`--zip`) to produce the uploadable `session-export-<timestamp>.zip`. Upload
that **`.zip`** to TalentLMS — `.md` files are not accepted.

You can also run the script directly without going through Claude:

```bash
node ~/.claude/skills/arcanys-session-export/scripts/export-session.js
```

### Common flags

```bash
# Custom output filename
node ~/.claude/skills/arcanys-session-export/scripts/export-session.js \
  --out day-3a-submission.md

# List available sessions for the current project
node ~/.claude/skills/arcanys-session-export/scripts/export-session.js \
  --list

# Pick a specific past session by UUID
node ~/.claude/skills/arcanys-session-export/scripts/export-session.js \
  --session 7c257a59-6fb1-4948-9401-a46662259b27

# Include tool calls inline as collapsible blocks (default: one-line summaries)
node ~/.claude/skills/arcanys-session-export/scripts/export-session.js \
  --include-tools

# Include the agent's internal thinking blocks (default: skipped)
node ~/.claude/skills/arcanys-session-export/scripts/export-session.js \
  --include-thinking

# Show all options
node ~/.claude/skills/arcanys-session-export/scripts/export-session.js --help
```

## What gets exported, what does not

**Included by default:**
- User prompts, verbatim
- Assistant text responses, verbatim
- Tool calls, summarised as one line each (`[Used Read: src/foo.js]`)
- Attached files (filename)
- Timestamps for every prompt and response
- Session header (session ID, project, started, ended, counts)

**Excluded by default:**
- Tool-result wrappers (internal plumbing — the result the assistant
  receives back from a tool, not a user-facing message)
- Queue and system events
- Assistant thinking blocks (internal reasoning)

Use `--include-tools` and `--include-thinking` to opt in.

## Troubleshooting

**`Error: No Claude Code projects directory at /Users/.../.claude/projects`**
Claude Code stores sessions under `~/.claude/projects/`. If yours is in a
non-default location (or you are running in a sandboxed environment), set
`CLAUDE_HOME=/path/to/.claude` before running the script.

**`Error: Could not find a project directory for cwd "..."`**
The current directory does not match any tracked Claude Code project. Run
the script from the same directory you ran your Claude Code session in, or
pass `--cwd /path/to/project`.

**`Error: No sessions found`**
The project directory exists but contains no `.jsonl` transcripts. Either
you have not run a session in this project yet, or the sessions have aged
out per `cleanupPeriodDays` in your Claude Code settings (default ~30
days).

## File layout

```
arcanys-session-export-skill/
├── README.md                 # this file
├── SKILL.md                  # skill manifest Claude Code reads
└── scripts/
    └── export-session.js     # the export script (vanilla Node, no deps)
```

## Maintenance

The script depends on the Claude Code session JSONL schema, which has the
shape (verified 2026): top-level fields `type`, `timestamp`, `sessionId`,
`message.role`, `message.content`. If Anthropic changes the schema, the
parser may need updates — check the script for `extractContentBlocks` and
`isUserToolResult` first.
