# PROCESS: Bounded pagination for GET /api/products

## The feature
`GET /api/products` returned every active product in a single response. It now
pages with strictly validated `limit` (1–100, default 50) and `offset`
(0 to `Number.MAX_SAFE_INTEGER`), ordered by `ORDER BY name, id`, with bound
parameters. Invalid values return 400 with a fixed message. The contract is in
`SPEC.md`; the review is in `REVIEW.md`.

## Shape: one implementing agent plus two independent reviewers
- **One implementer.** The change is about five small files that depend on each
  other in sequence: parser, then model, then route. Parallel implementers would
  have edited the same files and needed coordination, with no speed gain.
- **Two read-only reviewers** (`.claude/agents/specs-reviewer.md` and
  `test-auditor.md`, adapted from Day 3). Independence matters most at review time.
  Each starts with fresh context, judges against SPEC.md rather than against
  Claude's reasoning, and cannot edit files.
- **Was it the right call?** Yes. The implementation needed no rework. The defect
  that mattered, a missing security regression test, was found by an independent
  reviewer, not by the implementer re-reading its own work.

## Commit order (full hashes; times are local, +0800)

| Commit | Time | What |
|---|---|---|
| `1454c093c865de24a17043260541f6c206eea593` | 11-12 08:59 | setup: `.gitignore` only, on `main` |
| `01bbe3264cc56b9c2fb42022f07e4b12fd46bea4` | 08:59 | SPEC.md only |
| `3e77d0c55a24b7447c9de30d51ed09c17dcd4594` | 09:18 | both reviewer agents |
| `aa7fd6b691821fcbb9ed2d438c155dfb068d3697` | 09:18 | SPEC §7 clarification (before any test existed) |
| `19f49c418bcea07c6e9f7bd55cabbed999595385` | 09:37 | **failing tests** plus a throw-only parser stub |
| `61408e46522079b8c69043692335dde015a12af1` | 09:46 | **implementation** (one cohesive commit) |
| `d1cb6c13f3f241cda9dd862aadb385ba6576174e` | 10:02 | SPEC §8: H13 coverage amendment |
| `e6e8a9c3249fdbae54ca1386538ef29618abe070` | 10:18 | `fix:` H13 regression tests and the test-file header comment |

## Test-first evidence
- **Red checkpoint (`19f49c4`):** 73 failed, 47 passed, 120 total. All 44 baseline
  tests (7 suites) passed, and so did the three predicted regression guards M6, H0
  and H12.
  - The failures had three causes: 55 hit the stub's `parsePagination not implemented`;
    11 got SQL ending `ORDER BY name`; 7 expected a 400 that the old handler never sent.
  - `test-auditor` in red mode returned PASS, with no findings.
- **Implementation (`61408e4`):** 10/10 suites and 120/120 tests passed on the
  **first run**. No implementation fix was needed.
- **The `src/utils/pagination.js` stub** in the red commit only threw an error.
  Without it, `require` would fail with "Cannot find module", which is a failure for
  the wrong reason.

## Review loop: FAIL → fix → re-pass
1. **First final review (implementation uncommitted):** `specs-reviewer` PASS,
   `test-auditor` PASS, no findings.
2. **Adversarial review at `61408e4`:**
   - `specs-reviewer`: PASS, no findings.
   - `test-auditor`: PASS with a **medium** finding. No test showed that public
     query parameters are ignored, or that they cannot turn off active-product
     filtering. A route doing `Product.findAll({ ...req.query, limit, offset })`
     would pass all 120 tests while `?activeOnly=` exposed inactive products.
3. **The user explicitly strengthened the criterion:** a missing effective
   regression test for a security boundary the SPEC requires is blocking and high.
   Re-run under that criterion, `test-auditor` returned **FAIL** (high) on the same gap.
4. **`d1cb6c1`:** H13 added to SPEC §8 as coverage only, outside the historical
   red-checkpoint counts.
5. **First H13 attempt** (`activeOnly: ""` and an unknown `foo`, exact `toStrictEqual`
   on the `findAll` arguments, full SQL):
   - 121/121 passed.
   - Re-review: `specs-reviewer` PASS with one **low** finding (the test-file header
     still said `H0–H12`). `test-auditor` PASS with one **medium** finding (a route
     that turns the filter off only for the trigger value `"false"` would still pass).
6. **`e6e8a9c`:** added the `"false"` and `"0"` cases and fixed the header. 123/123
   passed. Under the same stricter criterion, both reviewers returned **PASS, no
   findings**.

**The production code was already correct throughout.** The fix added coverage, not
behaviour, which is why every H13 case passed on its first run. **No fault was
injected**; the reviewers traced the mutations on paper. Apart from the one header
comment line, every assertion from the failing-test commit is unchanged
(`git diff 19f49c4 -- tests/` contains only additions plus that line).

## What Claude got wrong, and how it was caught

| Mistake | Caught by |
|---|---|
| **The test matrix had no row showing that public query parameters cannot turn off active-product filtering.** SPEC §2.1 and §4 required the behaviour, but §8 never tested it. This is the main one. | `test-auditor` (adversarial, then the stricter criterion) |
| Planned Supertest route tests, even though local port binding is blocked in the sandbox | The user, pointing to the Day 3 crash |
| Wrote that `is_active = true` "always" applies, ignoring the model's existing `activeOnly` option | User review of the SPEC |
| Called existing callers "compatible" because the field names stayed the same, although they are silently truncated | User review |
| Listed a pre-existing vulnerability without checking it | User review; removed |
| Left the workflow outside SPEC.md and made the reviewers non-phase-aware (they would have demanded green tests at the red checkpoint) | User review |
| SPEC §7 said "Only `db.query` is mocked" while also planning an auth mock | User; clarified in `aa7fd6b` |
| First agent drafts: flagged `Number()` by its mere presence; treated a red test that unexpectedly passed as automatically vacuous; used `git log base..HEAD` as proof of ancestry | User; corrected before `3e77d0c` |
| Wrote two H0 assertions that can never fail (`products.test.js:104,107`) | `test-auditor`; kept and documented, since SPEC forbids removal |
| Proposed `activeOnly: "false"` alone as a fix. `"false"` is truthy, so it would not catch the spread route. | `test-auditor` |
| Did not update the test-file header when adding H13 | `specs-reviewer` (low) |
| Cited the H0 lines as "104 and 108" in one report; the tautologies are at 104 and 107 | Found while writing this file |

**A disproved claim, not a Claude mistake.** A supporting reviewer said JavaScript's
`$` would let `/^(0|[1-9][0-9]*)$/` accept `"5\n"`. A Node v22.22.0 check showed the
regex without the `m` flag rejects LF, CR and CRLF; it accepts `"5\n"` only with `m`.
The LF/CR/CRLF tests were kept as regression guards.

## Prompts that mattered (verbatim excerpts from the user's prompts)
- 11-11 07:31Z: *"Day 3 Supertest tests crashed because local port binding was blocked. Replace the Supertest plan with direct route-handler tests using mocked req/res/next, plus parser and model tests as appropriate."*
- 11-11 07:40Z: *"The reviewer’s trailing-newline claim was incorrect."* … *"Keep those regression cases, but do not label this a Claude planning mistake."*
- 11-12 01:49Z: *"Report only reproducible defects or evidenced requirement violations. Do not invent requirements or a FAIL to satisfy the exercise."*
- 11-12 01:57Z: *"A missing effective regression test for a SPEC-required security boundary is a blocking, high-severity coverage finding, even when the requirement lacks a dedicated matrix row."*
- Paraphrase (not a quote): every step was authorized narrowly, by file, and each prompt ended with "stop after the report". That kept every commit's scope reviewable.

## Environment and session notes
- **Sandbox blockers.**
  - The sandbox denies writes inside `.git/` (`index.lock: Operation not permitted`), so **the user made every Git write in an external terminal** from commands Claude prepared.
  - Reads of `~/.ssh` and `gh`'s keychain access are blocked.
  - CI run `42975756633` was verified through a temporary, Git-ignored `--settings` file listing four exact `gh` commands.
  - Local port binding is blocked, hence direct handler tests. `curl` is denied by project settings.
  - The `fnm` shell hook makes `cd` exit non-zero, so commands chained with `&&` after `cd` failed until they used `;`.
- **Sessions** (project `Week3 - Capstone`):
  - `e39a7523…` (11-11 05:43–07:26Z): baseline, CI and blocker diagnosis. Its only later record is a stray resume command typed into it at 11-12 00:53Z.
  - `e66c8370…` (11-11 07:22–07:46Z): planning and SPEC.
  - `e66c8370…` resumed 11-12 from 00:54Z: everything else. VS Code was reloaded once (about 01:20Z) so the project agents would register.
- **Exports.** An interim checkpoint export was made on 11-11 at 07:43Z. The final
  export is still to do. The exporter leaves out tool outputs and thinking, and does
  not capture the user's external-terminal commands, which appear only where the
  user pasted them.

## Time evidence
These figures come from session logs and commit times, as wall-clock spans. They are not focused-work hours.
- **11-11, setup session:** about 1 h 43 min (05:43–07:26Z).
- **11-11, planning session:** about 24 min (07:22–07:46Z), overlapping setup by about 4 min.
- **11-12:** about 1 h 26 min of session activity (00:54–02:20Z, as of writing). Feature commits ran 08:59–10:18 local.
- **Not captured:** time spent in the user's external terminal, or outside these sessions.
- **Six-hour guidance:** no claim is made about compliance; the evidence above is all there is.
