#!/usr/bin/env node
/*
 * arcanys-session-export
 *
 * Reads the current Claude Code session's JSONL transcript and writes a
 * markdown file ready to attach to a TalentLMS assignment.
 *
 * Usage:
 *   node export-session.js [options]
 *
 * Options:
 *   --out <path>          Output markdown file path. Default: ./session-export-<timestamp>.md
 *   --session <id>        Specific session UUID (otherwise picks the most recent in the project).
 *   --cwd <path>          Project directory to look up. Default: process.cwd().
 *   --include-tools       Include tool calls inline as collapsible blocks. Default: summary line only.
 *   --include-thinking    Include the assistant's internal thinking blocks. Default: skipped.
 *   --list                List available sessions for the current project and exit.
 *   --help                Print this help text.
 *
 * No external dependencies. Pure Node.js (built-in modules only).
 * Works on macOS, Linux, and Windows wherever Node is available — and if
 * Claude Code is installed, Node is installed.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");

// ------------------------------------------------------------------
// Zip packaging (TalentLMS rejects .md uploads, so we wrap the markdown
// in a .zip). Pure Node — no external zip tool required on any OS.
// ------------------------------------------------------------------

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

// Write a single-file .zip (deflate). entryName is the name inside the archive.
function zipSingleFile(zipPath, entryName, contentBuf) {
  const name = Buffer.from(entryName, "utf8");
  const data = Buffer.isBuffer(contentBuf) ? contentBuf : Buffer.from(contentBuf);
  const deflated = zlib.deflateRawSync(data);
  const crc = crc32(data);
  const d = new Date();
  const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header sig
  local.writeUInt16LE(20, 4);         // version needed
  local.writeUInt16LE(0, 6);          // flags
  local.writeUInt16LE(8, 8);          // method: deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central dir header sig
  central.writeUInt16LE(20, 4);         // version made by
  central.writeUInt16LE(20, 6);         // version needed
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk #
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(0, 42); // local header offset

  const localTotal = local.length + name.length + deflated.length;
  const centralTotal = central.length + name.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir sig
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);  // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralTotal, 12);
  eocd.writeUInt32LE(localTotal, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(
    zipPath,
    Buffer.concat([local, name, deflated, central, name, eocd])
  );
}

// Find the newest session-export-*.md in a directory (for `--zip` with no arg).
function findLatestExportMd(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const mds = entries
    .filter((f) => /^session-export-.*\.md$/i.test(f))
    .map((f) => {
      const full = path.join(dir, f);
      return { full, mtime: fs.statSync(full).mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return mds.length ? mds[0].full : null;
}

// ------------------------------------------------------------------
// CLI parsing
// ------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    out: null,
    session: null,
    cwd: process.cwd(),
    includeTools: false,
    includeThinking: false,
    list: false,
    help: false,
    zip: false,
    zipFile: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--session") args.session = argv[++i];
    else if (a === "--cwd") args.cwd = argv[++i];
    else if (a === "--include-tools") args.includeTools = true;
    else if (a === "--include-thinking") args.includeThinking = true;
    else if (a === "--list") args.list = true;
    else if (a === "--zip") {
      args.zip = true;
      // optional value: the .md to package (else newest session-export-*.md in cwd)
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) args.zipFile = argv[++i];
    } else if (a === "--help" || a === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

const HELP = `arcanys-session-export — export a Claude Code session as markdown.

Usage:
  node export-session.js [options]

Options:
  --out <path>          Output markdown file (default: ./session-export-<ts>.md)
  --session <id>        Specific session UUID
  --cwd <path>          Project directory to look up (default: process.cwd())
  --include-tools       Include tool calls inline as collapsible blocks
  --include-thinking    Include the assistant's internal thinking blocks
  --list                List available sessions for the current project and exit
  --zip [file.md]       Package a markdown export as an uploadable .zip (TalentLMS
                        rejects .md). With no path, zips the newest
                        session-export-*.md in the current folder. Run this AFTER
                        you fill in the Analysis section.
  --help, -h            Show this help

Default behaviour: locates ~/.claude/projects/<sanitised-cwd>/ for the current
working directory, picks the most recently modified .jsonl, and writes a
markdown file with verbatim user prompts and assistant responses.
`;

// ------------------------------------------------------------------
// Project / session location
// ------------------------------------------------------------------

function sanitiseCwd(cwd) {
  // Claude Code names the project directory after the cwd, replacing EVERY
  // non-alphanumeric character (/, \, :, spaces, underscores, dots, …) with "-".
  // It does NOT collapse runs, so "Week1 - Day1" -> "Week1---Day1".
  // Examples:
  //   /Users/joe/work          -> -Users-joe-work
  //   C:\Users\joe\my work     -> C--Users-joe-my-work
  //   D:\AI Training\Week1 - Day1  -> D--AI-Training-Week1---Day1
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function getClaudeHome() {
  // Allow override for sandboxed environments and non-default installs.
  if (process.env.CLAUDE_HOME) return process.env.CLAUDE_HOME;
  return path.join(os.homedir(), ".claude");
}

function getProjectsRoot() {
  return path.join(getClaudeHome(), "projects");
}

function locateProjectDir(cwd) {
  const projectsRoot = getProjectsRoot();
  const candidate = path.join(projectsRoot, sanitiseCwd(cwd));
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return candidate;
  }
  // Fallback: project-dir naming can drift across Claude Code / OS versions.
  // Match on the FULLY sanitised cwd (exact, or as a suffix to tolerate a
  // leading-separator difference). FAIL LOUD if more than one dir matches —
  // every assignment's working dir shares the same basename
  // ("06-practice-codebase"), so a loose basename match would silently pick
  // the WRONG day's transcript. Better to stop and ask than ship the wrong log.
  if (!fs.existsSync(projectsRoot)) {
    throw new Error(`No Claude Code projects directory at ${projectsRoot}`);
  }
  const target = sanitiseCwd(cwd);
  const dirs = fs
    .readdirSync(projectsRoot)
    .filter((d) => {
      const full = path.join(projectsRoot, d);
      return fs.statSync(full).isDirectory();
    });
  let matches = dirs.filter((d) => d === target);
  if (matches.length === 0) matches = dirs.filter((d) => d.endsWith(target));
  if (matches.length === 1) return path.join(projectsRoot, matches[0]);
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous Claude Code project directory for cwd "${cwd}".\n` +
        `${matches.length} directories match — refusing to guess (could attach the wrong session).\n` +
        `Pass --cwd <full path> or --session <uuid> to disambiguate. Candidates:\n  ` +
        matches.join("\n  ")
    );
  }
  throw new Error(
    `Could not find a Claude Code project directory for cwd "${cwd}".\n` +
      `Looked in ${projectsRoot}.\n` +
      `Try --cwd <path> or --session <uuid>.`
  );
}

function listSessions(projectDir) {
  const files = fs
    .readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const full = path.join(projectDir, f);
      const stat = fs.statSync(full);
      return { file: f, full, mtime: stat.mtime, size: stat.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files;
}

function pickLatestSession(projectDir) {
  const sessions = listSessions(projectDir);
  if (sessions.length === 0) {
    throw new Error(`No sessions found in ${projectDir}`);
  }
  return sessions[0].full;
}

function findSessionById(projectDir, sessionId) {
  const sessions = listSessions(projectDir);
  const match = sessions.find((s) => s.file === `${sessionId}.jsonl`);
  if (!match) {
    throw new Error(
      `Session ${sessionId} not found in ${projectDir}. ` +
        `Use --list to see available sessions.`
    );
  }
  return match.full;
}

// ------------------------------------------------------------------
// JSONL parsing
// ------------------------------------------------------------------

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const records = [];
  let lineNo = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNo++;
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      console.error(
        `Warning: skipping malformed JSON on line ${lineNo}: ${err.message}`
      );
    }
  }
  return records;
}

// Decide whether a record should appear in the rendered transcript.
function isRenderableRecord(rec) {
  if (!rec || typeof rec !== "object") return false;
  const t = rec.type;
  if (t === "user" || t === "assistant" || t === "attachment") return true;
  return false;
}

// Extract a flat list of content blocks from a record's message.content.
function extractContentBlocks(content) {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (Array.isArray(content)) {
    return content.filter((b) => b && typeof b === "object");
  }
  return [];
}

// ------------------------------------------------------------------
// Markdown rendering
// ------------------------------------------------------------------

function isUserToolResult(rec) {
  if (rec.type !== "user") return false;
  const blocks = extractContentBlocks(rec.message && rec.message.content);
  return blocks.length > 0 && blocks.every((b) => b.type === "tool_result");
}

function renderUserPrompt(rec) {
  const blocks = extractContentBlocks(rec.message && rec.message.content);
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (typeof rec.message?.content === "string") return rec.message.content.trim();
  return text.trim();
}

function summariseToolUse(block) {
  // block.name is the tool, block.input is the params object.
  const name = block.name || "Tool";
  const input = block.input || {};
  const summary = formatToolInputSummary(name, input);
  return `[Used **${name}**${summary ? `: ${summary}` : ""}]`;
}

function formatToolInputSummary(name, input) {
  // Best-effort one-line summary of the tool's most identifying argument.
  if (input.file_path) return "`" + input.file_path + "`";
  if (input.path) return "`" + input.path + "`";
  if (input.pattern) return "pattern `" + input.pattern + "`";
  if (input.command)
    return "`" + String(input.command).split("\n")[0].slice(0, 80) + "`";
  if (input.url) return input.url;
  if (input.query) return '"' + String(input.query).slice(0, 80) + '"';
  if (input.description) return String(input.description).slice(0, 80);
  // Fall back to a short JSON snippet.
  try {
    const s = JSON.stringify(input);
    return s.length > 100 ? s.slice(0, 97) + "..." : s;
  } catch {
    return "";
  }
}

function renderAssistantBlocks(rec, opts) {
  const blocks = extractContentBlocks(rec.message && rec.message.content);
  const parts = [];
  for (const b of blocks) {
    if (b.type === "text") {
      const t = (b.text || "").trim();
      if (t) parts.push(t);
    } else if (b.type === "tool_use") {
      if (opts.includeTools) {
        const summary = summariseToolUse(b);
        const inputJson = safeJson(b.input || {});
        parts.push(
          `<details><summary>${summary}</summary>\n\n\`\`\`json\n${inputJson}\n\`\`\`\n</details>`
        );
      } else {
        parts.push(`*${summariseToolUse(b)}*`);
      }
    } else if (b.type === "thinking") {
      if (opts.includeThinking) {
        const t = (b.thinking || b.text || "").trim();
        if (t) {
          parts.push(`<details><summary>[Thinking]</summary>\n\n${t}\n\n</details>`);
        }
      }
      // else: skipped silently
    }
  }
  return parts.join("\n\n");
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function renderAttachment(rec) {
  // The attachment record shape varies; pick whatever filename-ish field is present.
  const att = rec.attachment || rec.file || rec.message || rec;
  const name =
    att?.name || att?.filename || att?.path || att?.uri || "[attachment]";
  return `*[Attached: ${name}]*`;
}

function fmtTimestamp(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  } catch {
    return String(ts);
  }
}

function renderMarkdown(records, meta, opts) {
  // Filter to renderable records, in chronological order (records are usually
  // in order already; use timestamp as a tie-breaker).
  const ordered = records
    .filter(isRenderableRecord)
    .map((r, i) => ({ r, i, ts: r.timestamp || "" }))
    .sort((a, b) => {
      if (a.ts && b.ts && a.ts !== b.ts) return a.ts.localeCompare(b.ts);
      return a.i - b.i;
    })
    .map((x) => x.r);

  const sections = [];
  let promptIdx = 0;

  // Header
  sections.push(`# Session Transcript

| Field | Value |
|---|---|
| Session ID | \`${meta.sessionId}\` |
| Project | \`${meta.cwd}\` |
| Source file | \`${meta.sourcePath}\` |
| Started | ${fmtTimestamp(meta.startedAt)} |
| Ended | ${fmtTimestamp(meta.endedAt)} |
| Records | ${meta.totalRecords} (${meta.userPrompts} user prompts, ${meta.assistantTurns} assistant turns) |
| Exported | ${fmtTimestamp(new Date().toISOString())} |
`);

  // Analysis section (template — learner fills in before submitting)
  sections.push(`---

## Analysis (FILL IN BEFORE SUBMITTING)

<!--
  Replace this section with whatever the assignment requires:
   - Day 1: the verified prompt + your one-sentence finding
   - Day 2: the strongest before/after pair, or your flagged self-review cycle
   - Day 3a: confirmed claim + questionable claim with line refs
   - Day 3b: pre/post confidence scores, why-it-missed paragraph, manual test
   - Day 4a: your Critical-tier task entry verbatim
   - Day 4b: one issue per snippet + overall reflection
   - Day 5: best/worst prompt + one pattern noticed

  See the assignment brief in TalentLMS for the exact fields.
-->

_Add your analysis here, then delete this comment._
`);

  // Transcript
  sections.push(`---

## Transcript
`);

  for (const rec of ordered) {
    const ts = fmtTimestamp(rec.timestamp);
    if (rec.type === "user") {
      if (isUserToolResult(rec)) continue; // skip tool-result wrappers
      const prompt = renderUserPrompt(rec);
      if (!prompt) continue;
      promptIdx++;
      sections.push(
        `### Prompt ${promptIdx}${ts ? ` — ${ts}` : ""}\n\n` +
          quoteBlock(prompt) +
          "\n"
      );
    } else if (rec.type === "assistant") {
      const body = renderAssistantBlocks(rec, opts);
      if (!body) continue;
      sections.push(`**Agent${ts ? ` (${ts})` : ""}:**\n\n${body}\n`);
    } else if (rec.type === "attachment") {
      sections.push(renderAttachment(rec));
    }
  }

  sections.push(`---

_Generated by \`arcanys-session-export\`._
`);
  return sections.join("\n");
}

function quoteBlock(text) {
  return text
    .split("\n")
    .map((line) => "> " + line)
    .join("\n");
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  // --zip: package an existing markdown export as an uploadable .zip and exit.
  if (args.zip) {
    const mdPath =
      args.zipFile || args.out || findLatestExportMd(args.cwd);
    if (!mdPath || !fs.existsSync(mdPath)) {
      throw new Error(
        "No markdown file to zip. Pass --zip <path-to-session-export.md>, " +
          "or run from the folder that contains your session-export-*.md."
      );
    }
    const zipPath = mdPath.replace(/\.md$/i, ".zip");
    zipSingleFile(zipPath, path.basename(mdPath), fs.readFileSync(mdPath));
    console.log(`Wrote ${zipPath}`);
    console.log(
      `Upload this .zip to TalentLMS — it contains ${path.basename(mdPath)}.`
    );
    return;
  }

  const projectDir = locateProjectDir(args.cwd);

  if (args.list) {
    const sessions = listSessions(projectDir);
    if (sessions.length === 0) {
      console.log(`No sessions found in ${projectDir}.`);
      return;
    }
    console.log(`Sessions in ${projectDir}:`);
    for (const s of sessions) {
      const id = s.file.replace(/\.jsonl$/, "");
      console.log(`  ${s.mtime.toISOString()}  ${(s.size / 1024).toFixed(1)} KB  ${id}`);
    }
    return;
  }

  const sourcePath = args.session
    ? findSessionById(projectDir, args.session)
    : pickLatestSession(projectDir);

  const records = readJsonl(sourcePath);
  if (records.length === 0) {
    throw new Error(`No records in ${sourcePath}`);
  }

  // Pull session metadata from the first/last records that have a timestamp.
  const withTs = records.filter((r) => r.timestamp);
  const startedAt = withTs.length ? withTs[0].timestamp : "";
  const endedAt = withTs.length ? withTs[withTs.length - 1].timestamp : "";
  const sessionId =
    records.find((r) => r.sessionId)?.sessionId ||
    path.basename(sourcePath, ".jsonl");
  const userPrompts = records.filter(
    (r) => r.type === "user" && !isUserToolResult(r)
  ).length;
  const assistantTurns = records.filter((r) => r.type === "assistant").length;

  const meta = {
    sessionId,
    cwd: args.cwd,
    sourcePath,
    startedAt,
    endedAt,
    totalRecords: records.length,
    userPrompts,
    assistantTurns,
  };

  const md = renderMarkdown(records, meta, {
    includeTools: args.includeTools,
    includeThinking: args.includeThinking,
  });

  const outPath =
    args.out ||
    path.join(
      args.cwd,
      `session-export-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19)}.md`
    );
  fs.writeFileSync(outPath, md);
  console.log(`Wrote ${outPath}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Source:  ${sourcePath}`);
  console.log(
    `  ${userPrompts} user prompts, ${assistantTurns} assistant turns, ${records.length} total records.`
  );
  console.log(
    `\nNext steps:\n` +
      `  1. Open ${path.basename(outPath)} and fill in the "Analysis" section at the top.\n` +
      `  2. Package it for upload (TalentLMS does not accept .md files):\n` +
      `       node "${__filename}" --zip "${outPath}"\n` +
      `  3. Upload the resulting .zip to the TalentLMS assignment.`
  );
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
