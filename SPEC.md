# SPEC: Bounded pagination for GET /api/products

## 1. Problem
`GET /api/products` (`src/routes/products.js`) calls `Product.findAll({ category })`
(`src/models/Product.js`). That runs `SELECT * FROM products WHERE is_active = true
[AND category = $1] ORDER BY name` with no row bound. A single request returns every
matching product. Rows that share a name can come back in any order.

## 2. Contract

### 2.1 Request
`GET /api/products?category=<string>&limit=<int>&offset=<int>`

The parameter names and the default of 50 follow `Order.findAll` (`src/models/Order.js`).

| Param      | Default | Accepted values                                         |
|------------|---------|---------------------------------------------------------|
| `limit`    | 50      | integer 1–100 inclusive                                 |
| `offset`   | 0       | integer 0–9007199254740991 (`Number.MAX_SAFE_INTEGER`)  |
| `category` | none    | unchanged from current behaviour                        |

- **Absent** (`req.query[name] === undefined`): the default applies.
- **Present**: the value must be a string whose **entire** content is either `0` or a
  non-zero ASCII digit followed by ASCII digits (`1`–`9`, then `0`–`9`), with **no
  other character anywhere**: no leading or trailing whitespace, and no line
  terminators (LF, CR, CRLF). The numeric value must also be in range. Everything
  else is rejected.
- The implementation must reject trailing line terminators no matter how matching
  is written. If a regular expression is used, it must not use the `m` (multiline)
  flag. Without `m`, JavaScript's `$` matches only at the end of the input. A Node
  v22.22.0 check confirmed that `/^(0|[1-9][0-9]*)$/` rejects `"5\n"`, `"5\r"` and
  `"5\r\n"`, and accepts `"5\n"` only when `m` is set. The LF, CR and CRLF tests are
  kept as regression guards against a future change to the matching.
- Express 4's default `qs` query parser can produce arrays and objects, so a
  present value that is not a string is rejected.

| Input                                          | Value seen by the handler | Result |
|------------------------------------------------|----------------------|--------|
| omitted                                        | `undefined`          | default |
| `limit=`, or `limit` with no value             | `""`                 | 400 |
| `1.5`, `10.0`, `1e2`                           | string               | 400 |
| `+5`, `-1`, `-0`                               | string               | 400 |
| `" 5"`, `"5 "`, `"\t5"`                        | string               | 400 |
| `"5\n"`, `"5\r\n"`, `"5\r"`, `"\n5"`           | string               | 400 |
| `0x10`, `abc`, full-width `５`                 | string               | 400 |
| `007`, `01`, `00`                              | string               | 400 (only `"0"` itself may start with 0) |
| `limit=1&limit=2`, `limit[]=1`                 | array                | 400 |
| `limit[a]=1`                                   | object               | 400 |
| limit `0` or `101`                             | out of range         | 400 |
| offset `9007199254740992` or longer digit strings | beyond safe integer | 400 |
| limit `1`, `99`, `100`; offset `0`, `9007199254740991` | valid        | accepted |

Unknown query parameters are still ignored.

### 2.2 Errors
Invalid values get **HTTP 400** in the existing `{ error }` shape. The check runs
**before the product model or the database is called**. The messages are fixed text
and never echo the input:

- `LIMIT_ERR`: `{ "error": "limit must be an integer between 1 and 100" }`
- `OFFSET_ERR`: `{ "error": "offset must be an integer between 0 and 9007199254740991" }`

`limit` is checked first. If both are invalid, the response carries `LIMIT_ERR`.

### 2.3 Model and query
`Product.findAll({ category, activeOnly = true, limit = 50, offset = 0 })`:
- **`activeOnly` keeps its current behaviour.** When it is `true` (the default, and
  what the public listing uses), the query includes `is_active = true`. When it is
  `false`, that predicate is left out, as it is today.
- `category = $n` is added when `category` is truthy, as today. An empty
  `category=` still means no filter.
- Results are ordered by `ORDER BY name, id`. `id` is the `SERIAL` primary key, so the
  order is total.
- The query ends with `LIMIT $n OFFSET $m`, both as bound parameters and never in the
  SQL text.
- No `COUNT(*)` or total query is added.
- The model does not validate `limit`/`offset`; the route does. The only current
  caller of `Product.findAll` is `GET /api/products`. Because the defaults are in the
  model, any internal call without `limit` is also bounded to 50 rows, including calls
  with `activeOnly = false`. This is an **accepted** change. Filtering for such calls
  is unchanged: `activeOnly = false` still leaves out `is_active = true`.

### 2.4 Response
HTTP 200, unchanged shape: `{ "products": [...], "count": <number> }`.
- `count` is the number of products in **this page** (`products.length`).
- If `offset` is at or past the number of matches, the response is
  `200 { "products": [], "count": 0 }`.
- No `total`, `hasMore`, `next`, or Link header is added. A client has reached the
  last page when `count < limit`. If the last page holds exactly `limit` items, one
  more request returns `count: 0`.
- `limit` caps the **number of rows** returned. It does not cap the response size in
  bytes (`description` is an unbounded `TEXT` column and the endpoint returns
  `SELECT *`), and it does not cap database execution cost (§3).

### 2.5 Behaviour change (accepted break)
Before this change, a request with no parameters returned **every** matching product,
and `count` equalled the number of matches. After it, the same request returns at
most 50 rows, and `count` is the page length.

Keeping the field names the same does **not** make existing callers compatible. It
makes the truncation **silent**: a caller that expects the whole catalogue gets
HTTP 200 and a well-formed body with no sign that rows are missing. Callers that need
the full set must page with `offset` until `count < limit`. This break is accepted on
purpose. No metadata is added to signal it.

## 3. Decisions and trade-offs
- **Strict rejection rather than silent fallback.** `src/routes/orders.js` uses
  `parseInt(x) || default`, which turns `abc` into 50, `10abc` into 10, `0` into 50
  and `-5` into -5. Copying that here would hide client bugs, treat `limit=0` like an
  omitted value, and let a negative offset reach PostgreSQL, which would answer with a
  500. A 400 keeps the bound visible and enforceable. The orders route is not changed.
- **Leading zeros are rejected**, except `"0"` itself, so every accepted value has
  exactly one spelling.
- **Offset ceiling.** `Number.MAX_SAFE_INTEGER` is a **representation limit**: it
  makes sure the value converts exactly between a JavaScript number and PostgreSQL
  `bigint`. It is **not** a database-cost limit.
- **Limitations of offset pagination.**
  - If products are inserted, deleted, deactivated or renamed between requests, rows
    shift between pages, so a client can see a product twice or miss one.
    `ORDER BY name, id` makes the order deterministic for a fixed dataset. It does not
    make it stable across writes.
  - PostgreSQL still produces and discards the first `offset` rows. Without an index
    on `(name, id)` it likely sorts the whole filtered set on every request. That is
    expected, not measured: no `EXPLAIN` has been run. Deep offsets cost more, and this
    feature does not bound database execution cost. Keyset pagination would be the
    follow-up if that matters.
- **Sizing (capstone rule).** About half a day of work. It changes three existing files
  (route, model, README) and adds a parser and three test files. It needs new code and
  changes to existing code. Its non-obvious decisions are strict rejection against the
  repository's lenient precedent, handling `qs` arrays and objects, and the silent
  change to what `count` means. It needs no diagram.

## 4. Security
- **Public access is unchanged.** The route keeps `optionalAuth()` and has no
  permission check. Pagination results don't depend on who is calling.
- **Input is handled strictly.** `limit` and `offset` are checked by type (string
  only), by exact full-string digit form, and by range, before any model or database
  call. Rejection messages are fixed text, so input is never reflected back. Input
  values are not logged.
- **SQL parameters are bound.** `limit` and `offset` reach PostgreSQL only as `$n`
  parameters, and they are already validated numbers. `category` stays a bound
  parameter.
- **Filtering is preserved.** The public listing always calls the model with
  `activeOnly = true`, so paging cannot expose inactive products. The category filter
  behaves as before.
- **New attack surface.** There are two new query parameters on an anonymous endpoint.
  Malformed values stop at a 400 before any database work. Valid values can still ask
  for deep offsets.
- **Large offsets.** An anonymous client can repeat
  `offset=9007199254740991&limit=100`. Each request returns no rows but may still cost
  a filter-and-sort. `optionalAuth` (`src/middleware/auth.js`) has no rate limiting,
  so this endpoint has no per-client throttle, before or after this change. This
  feature neither adds nor removes denial-of-service protection.
- **Unchanged.** The endpoint still returns `SELECT *`. `category` is still not
  validated.

## 5. Non-goals
- Pagination, validation or ordering changes on any other endpoint.
- Changing the lenient parsing in `src/routes/orders.js`.
- Totals, `hasMore` or other metadata, Link headers, cursor or keyset pagination.
- Indexes or migrations.
- Validating `category`, or changing `GET /api/products/:id`.
- Fixing pre-existing OrderFlow issues unrelated to this endpoint.

## 6. Artifacts

| File | New / modified | Purpose |
|---|---|---|
| `SPEC.md` | new | this document |
| `.claude/agents/specs-reviewer.md` | new (adapted from Day 3) | read-only SPECS review against SPEC.md |
| `.claude/agents/test-auditor.md` | new (adapted from Day 3) | read-only test audit, aware of the red and green phases |
| `tests/utils/pagination.test.js` | new | parser tests (P rows) |
| `tests/models/product.test.js` | new | SQL structure and bound-parameter tests (M rows) |
| `tests/routes/products.test.js` | new | direct handler tests (H rows) |
| `src/utils/pagination.js` | new | `parsePagination(query)` returns `{ limit, offset }` or `{ error }`; `DEFAULT_LIMIT = 50` and `MAX_LIMIT = 100` as named constants |
| `src/models/Product.js` | modified | §2.3 |
| `src/routes/products.js` | modified | call `parsePagination(req.query)`; on error return 400 with `{ error }`; otherwise call `Product.findAll({ category, limit, offset })`; update the JSDoc |
| `README.md` | modified | endpoint row: "List active products (paginated: `limit` 1–100, default 50; `offset`)" |
| `REVIEW.md` | new | SPECS pass over the final diff, with a feature-specific Security section |
| `PROCESS.md` | new | prompts, the mistakes Claude made and how they were caught, why one implementing agent |

The `.gitignore` setup change is committed alone on `main`, **before** the feature
branch is created, and is never mixed into a feature commit (§9 step 0).

## 7. Test design (no port binding)
Supertest needs a listening socket, and local port binding is blocked in the
sandbox. The route tests call the real handler directly, with mocked
`req`/`res`/`next`.

- **Finding the handler:** the tests load the exported router and take
  `router.stack.find(l => l.route && l.route.path === "/" && l.route.methods.get)`.
  The handler is the **last** layer of that route. No handler logic is copied into the
  tests. This relies on Express 4 internals (`router.stack`, `layer.route`), which
  `package-lock.json` pins to 4.22.1.
- **What runs for real, and what is mocked:** the pagination parser and `Product.findAll`
  run for real. `db.query` is mocked
  (`jest.mock("../../src/config/database", () => ({ query: jest.fn() }))`, following
  `tests/services/userService.test.js`). In the route tests, the auth module is also
  mocked, solely for the `optionalAuth` registration sentinel described below. That mock
  does not verify real authentication or the Express middleware pipeline.
  `jest.spyOn(Product, "findAll")` runs the real model and lets tests assert it was
  **not** called. `jest.clearAllMocks()` runs in
  `beforeEach` and spies are restored in `afterEach`.
- **`res` mock:** `status` and `json` are `jest.fn()` that return `res`. The tests
  `await` the handler.
- **Checking `optionalAuth` without running it:** the route test mocks
  `../../src/middleware/auth` so that `optionalAuth` is a `jest.fn` returning a
  **sentinel** middleware with a unique identity. The test asserts that `optionalAuth`
  was called once when the router loaded, that the route has exactly two layers, that
  `layer.route.stack[0].handle` is **the same object** as the sentinel (`toBe`), and
  that the handler is the last layer. This proves the route registered what
  `optionalAuth()` returned, ahead of the handler. It does not rely on a function
  name. It does **not** prove that the real `optionalAuth` works, and the sentinel is
  never run as if it were real authentication.
- **SQL assertions:** `norm = s => s.replace(/\s+/g, " ").trim()`. Tests compare
  `norm(sql)` with the **complete** expected statement using equality, so every
  predicate, parameter position, the ordering, `LIMIT` and `OFFSET` are checked.
  Only whitespace differences are ignored. Parameters are compared with `toEqual`.

### 7.1 What the tests prove, and what they don't
| Layer | Shown by | Proven? |
|---|---|---|
| Parser accepts and rejects inputs | P tests on the real function | Yes |
| Handler status, body, `next(err)`, no model call on 400 | H tests on the real handler | Yes, for the handler alone. The Express pipeline, `qs` and the error handler are not run. |
| SQL text and bound parameters sent to `pg` | M and H tests with mocked `db.query` | Yes, for what is **sent** |
| PostgreSQL applies LIMIT/OFFSET, filters and ordering | needs a real database | **Not verified.** A mocked short array proves nothing about this. |
| Full HTTP behaviour | needs a running server | **Not verified** |
| `optionalAuth` registered ahead of the handler | sentinel identity (H0) | Registration and order only |

Tests write `qs` output as JS values (arrays, objects); raw query strings are not
parsed. Optional checks against a real database or HTTP server are **not part of this
work and are not run**. If they are done later, REVIEW.md records how and what was seen.

## 8. Requirement-to-test matrix
Tests write the error strings out in full and never import them from the code under test.
**Pre-implementation state:** `src/utils/pagination.js` is a stub that only throws
`Error("parsePagination not implemented")`. The route and the model are unchanged.

### Parser: `tests/utils/pagination.test.js`
| ID | `query` | Expected | Predicted at red checkpoint |
|---|---|---|---|
| P1 | `{}` | `{ limit: 50, offset: 0 }` | fails: throws "not implemented" |
| P2 | limit `"1"`, `"99"`, `"100"` | that limit (a `number`), offset 0 | fails: throws |
| P3 | limit `"0"`, `"101"` | `{ error: LIMIT_ERR }` | fails: throws |
| P4 | offset `"0"`, `"9007199254740991"` | that offset (a `number`), limit 50 | fails: throws |
| P5 | offset `"9007199254740992"`, `"99999999999999999999"` | `{ error: OFFSET_ERR }` | fails: throws |
| P6 | limit `""`; offset `""` | the matching error | fails: throws |
| P7 | `"1.5"`, `"10.0"`, `"1e2"` | error | fails: throws |
| P8 | `"+5"`, `"-1"`, `"-0"` | error | fails: throws |
| P9 | `" 5"`, `"5 "`, `"\t5"` | error | fails: throws |
| P10 | `"5\n"`, `"5\r\n"`, `"5\r"`, `"\n5"` (for limit and for offset) | error | fails: throws |
| P11 | `"0x10"`, `"abc"`, `"５"` | error | fails: throws |
| P12 | limit `"007"`, `"01"`; offset `"00"` | error | fails: throws |
| P13 | `["1","2"]`, `["1"]`, `{ a: "1" }` for each param | error | fails: throws |
| P14 | `{ limit: "0", offset: "-1" }` | `{ error: LIMIT_ERR }` | fails: throws |
| P15 | `{ limit: "10", offset: "5" }` | exactly `{ limit: 10, offset: 5 }`, no extra keys | fails: throws |

### Model: `tests/models/product.test.js` (`db.query` resolves `{ rows }`)
| ID | Call | Expected `norm(sql)` and params | Predicted at red checkpoint |
|---|---|---|---|
| M1 | `findAll({})` | `SELECT * FROM products WHERE is_active = true ORDER BY name, id LIMIT $1 OFFSET $2`, `[50, 0]` | fails: SQL ends `ORDER BY name`, params `[]` |
| M2 | `findAll({ category: "books", limit: 10, offset: 20 })` | `SELECT * FROM products WHERE is_active = true AND category = $1 ORDER BY name, id LIMIT $2 OFFSET $3`, `["books", 10, 20]` | fails: params `["books"]` |
| M3 | `findAll({ activeOnly: false })` | `SELECT * FROM products ORDER BY name, id LIMIT $1 OFFSET $2`, `[50, 0]` | fails: SQL ends `ORDER BY name`, params `[]` |
| M4 | `findAll({ activeOnly: false, category: "books" })` | `SELECT * FROM products WHERE category = $1 ORDER BY name, id LIMIT $2 OFFSET $3`, `["books", 50, 0]` | fails |
| M5 | `findAll({ limit: 7, offset: 13 })` | SQL text contains neither `7` nor `13`; params `[7, 13]` | fails: params `[]` |
| M6 | any call | returns the mocked `rows` unchanged | passes (regression guard) |

### Handler: `tests/routes/products.test.js`
| ID | `req.query`, db mock | Expected | Predicted at red checkpoint |
|---|---|---|---|
| H0 | none | sentinel identity check (§7) | passes (structure guard) |
| H1 | `{}`, three rows | full M1 SQL, params `[50, 0]`; `res.json({ products: rows, count: 3 })`; `res.status` and `next` not called | fails: params `[]` |
| H2 | limit `"99"`; limit `"100"` | params `[99, 0]`; `[100, 0]`; 200 | fails |
| H3 | limit `"101"` | `res.status(400)` and `json({ error: LIMIT_ERR })`; `Product.findAll`, `db.query` and `next` not called | fails: 200 with products |
| H4 | limit `"0"` | same as H3 | fails |
| H5 | offset `"9007199254740992"` | 400 `OFFSET_ERR`; no model or database call | fails |
| H6 | limit `["1","2"]`; limit `{ a: "1" }` | 400 `LIMIT_ERR`; no model or database call | fails |
| H7 | limit `"5\r\n"` | 400 `LIMIT_ERR`; no model or database call | fails |
| H8 | limit `"abc"`, offset `"-1"` | 400 `LIMIT_ERR` (both invalid) | fails |
| H9 | category `"books"`, limit `"10"`, offset `"20"` | full M2 SQL, `["books", 10, 20]` | fails |
| H10 | category `""` | full M1 SQL, `[50, 0]` | fails: params `[]` |
| H11 | offset `"1000"`, rows `[]` | params `[50, 1000]`; `json({ products: [], count: 0 })`; no 400 | fails: params `[]` |
| H12 | `{}`, `db.query` rejects with `new Error("connection refused")` | `next` called once with **that** error object; `res.status` and `res.json` not called | passes (regression guard) |
| H13 | `{ category: "books", limit: "10", offset: "20", activeOnly: "", foo: "x" }`, rows `[]` | `Product.findAll` called exactly once with exactly `{ category: "books", limit: 10, offset: 20 }`; full M2 SQL (`SELECT * FROM products WHERE is_active = true AND category = $1 ORDER BY name, id LIMIT $2 OFFSET $3`), params `["books", 10, 20]`; `res.json({ products: [], count: 0 })`; `res.status` and `next` not called | not part of the red checkpoint (added after implementation; see below) |

Predicted at the red checkpoint: every new test fails except M6, H0 and H12, which
pass as regression guards. The baseline (7 suites, 44 tests) stays green.
These predictions and the audited red counts (73 failed, 47 passed, 120 total) cover
P1–P15, M1–M6 and H0–H12 only. They are historical and are not changed by H13.

**H13 (added after implementation).** H13 adds **coverage, not behaviour**. It is a
regression test for two existing requirements:
- §2.1: unknown query parameters are ignored;
- §4: the public listing always calls the model with `activeOnly = true`, so public
  callers cannot override active-product filtering.

A stricter final-phase `test-auditor` review found that no earlier test would catch a
route that forwards query values to the model, for example
`Product.findAll({ ...req.query, limit, offset })`. That route passes H0–H12, but
`?activeOnly=` reaches the model as `""` and drops `is_active = true`. The empty string
is used deliberately: `"false"` is a truthy string and would not catch that route.
The exact-argument check on `Product.findAll` also catches any other unapproved option
being forwarded.

The committed implementation already meets both requirements, so H13 is expected to
**pass immediately** against the current code. It is not a red test, and it is added in
its own commit after the implementation commit (§9 step 5).

## 9. Workflow and commit order
No squashing and no force-pushing at any point.

0. **Setup, then branch.** Nothing is pushed during steps 0–2.
   - On `main`, commit **only** the pending `.gitignore` line (the setup commit).
   - Create `feature/products-pagination` from that setup commit.
   - Every later step happens on `feature/products-pagination`.
1. **`docs: add SPEC for products pagination`**: this file only.
2. **`chore: add specs-reviewer and test-auditor for pagination`**: both agents adapted
   from Week 3 Day 3, **before any test or implementation**. The adaptations:
   - They read `SPEC.md` where they used to read `PLAN.md`. If it's missing, they FAIL.
   - The pending-order Context and coverage sections are replaced with §2–§8 of this
     SPEC and the P/M/H IDs.
   - The baseline is 7 suites / 44 tests. `npm test` is the single test command.
   - Direct handler tests are the expected convention, and Supertest is not used.
   - They must flag any claim that mocked `db.query` calls prove PostgreSQL behaviour.
   - **They are phase-aware:**
     - **Red checkpoint (`test-auditor`):** judges whether each new failure is expected
       by §8 and fails for a meaningful reason (an assertion about behaviour or the
       stub's "not implemented"), not a crash, a syntax error, a missing module or a
       broken mock. It must **not** require the new tests to pass. It also checks that
       the baseline 44 tests still pass and that the regression guards pass. The
       checkpoint gets FAIL if a failure is unexpected or meaningless, if a test is
       vacuous, or if a matrix row is missing.
     - **Final (`specs-reviewer` + `test-auditor`):** requires `npm test` fully green
       and both reviewers PASS.
   - **`specs-reviewer` scope:** the branch diff against the setup commit (step 0)
     plus anything staged, so it can review committed work and fixes. It also checks
     that `git diff <test commit>..HEAD -- tests/` removes or loosens no assertion.
   - Tools stay read-only, as on Day 3. Security settings are unchanged.
3. **Red checkpoint, then `test: add failing tests for products pagination`.** This
   commit holds the three test files plus a stub `src/utils/pagination.js` that only
   throws `Error("parsePagination not implemented")` and exports `parsePagination`.
   - **Why the stub:** without it, `require` fails with "Cannot find module", which
     crashes the whole parser test file. That is a failure for the wrong reason, and
     it hides the failures for each case.
   - **Why it can't hide anything:** the stub has no logic and exports no constants, so
     it can't make a test pass.
   - **Before committing:** `test-auditor` runs the red checkpoint. The commit message
     records the actual red and green counts against §8.
4. **`feat: paginate GET /api/products with strict limit/offset`**: one cohesive
   commit containing the parser, the model, the route and README. `npm test` is green
   before committing. No intermediate commit is half-implemented.
5. **Final review:** `specs-reviewer` and `test-auditor` on the feature diff. Each
   FAIL → fix → re-pass cycle produces its own `fix: …` commit, followed by a re-run of
   both reviewers until both PASS with tests green. **Test assertions committed in
   step 3 are never removed or loosened.** Tests may only be added, and any addition
   is explained in PROCESS.md.
6. **`docs: add REVIEW.md`** and **`docs: add PROCESS.md`**.
7. With approval, push `main` (the setup commit) **before** opening the PR, so the PR
   diff contains only feature commits. Then push the branch, open the PR against
   `main`, and confirm the GitHub Actions run on the PR branch is green.
8. **The user's personal review of the entire final PR diff.** The user reads the
   whole diff `main...feature/products-pagination` at the PR's head revision. An agent
   review does not replace this.
   - The user then records, in a `## Human review` section of REVIEW.md, the **full
     40-character SHA** that was reviewed, the diff range, the date, and a
     confirmation in their own words that they read the entire diff.
   - That record is added in one `docs: record human review of final diff` commit that
     changes only that REVIEW.md section. `git diff --stat <reviewed SHA>..HEAD` must
     show only `REVIEW.md`.
   - Any other change after the review needs a fresh review of the entire diff and a
     new record.
   - After that commit is pushed, the GitHub Actions run on the PR head must be green.

### Process-evidence rule
PROCESS.md separates **planning corrections caught in review** (before any code
existed) from **executed FAIL → fix → re-pass cycles** (step 5). A planning
correction never counts as the required executed cycle. A genuine executed cycle is
still required.

A review claim that verification disproved is recorded as a **disproved claim**, not
as a Claude mistake. Example: the claim that the parser regex would accept a
trailing newline, which §2.1's Node check disproved.

## 10. Verification
- Single command: **`npm test`**, the same command CI runs (`.github/workflows/test.yml`).
- Database and HTTP behaviour is not verified (§7.1).

## 11. Definition of done
- [ ] Commits appear in the §9 order: the `.gitignore` setup commit on `main`, then on
      `feature/products-pagination` the SPEC, agents, failing tests, implementation,
      any fixes, REVIEW/PROCESS, and the human-review record.
- [ ] The red checkpoint was audited, and its counts match §8 or the differences are
      explained.
- [ ] `npm test` is green: the 44 baseline tests plus every row in §8.
- [ ] No test assertion from the failing-test commit is removed or loosened.
- [ ] `specs-reviewer` PASS and `test-auditor` PASS on the final diff, with at least
      one genuine executed FAIL → fix → re-pass before it.
- [ ] REVIEW.md has a Security section specific to this change; PROCESS.md follows the
      process-evidence rule.
- [ ] The user personally reviewed the entire final PR diff. REVIEW.md records the full
      reviewed SHA, the diff range, the date and the user's confirmation. After that
      SHA, only the REVIEW.md record changed. An agent review is not a substitute.
- [ ] The GitHub Actions run on the final PR head is green.
