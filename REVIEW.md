# REVIEW: Bounded pagination for GET /api/products

## Scope

| | |
|---|---|
| Feature range | `1454c093c865de24a17043260541f6c206eea593` (setup base, on `main`) → `e6e8a9c3249fdbae54ca1386538ef29618abe070` (`feature/products-pagination`) |
| Source of truth | `SPEC.md` |
| Files changed by the feature | `src/utils/pagination.js` (new), `src/models/Product.js`, `src/routes/products.js`, `README.md`, three new test files, `SPEC.md`, `.claude/agents/*.md` |
| Untouched | `src/routes/orders.js`, `src/middleware/`, `src/config/`, migrations, dependencies, settings |

## SPECS assessment

**S — Security:** see the Security section below.

**P — Patterns**
- The route calls the model directly, as it did before. No service layer is added.
- `src/utils/pagination.js` is pure. It takes query values and returns `{ limit, offset }` or `{ error }`, and touches no request, response, database or logger.
- LIMIT and OFFSET are added as bound parameters, in the same style as `Order.findAll` (`src/models/Product.js:27-30`).
- `DEFAULT_LIMIT` and `MAX_LIMIT` are each defined once (`src/utils/pagination.js:9-10`). The model imports `DEFAULT_LIMIT` rather than repeating 50 (`src/models/Product.js:2,7`).
- There are no drive-by refactors.

**E — Edge cases**
- Limit: boundaries 0, 1, 99, 100 and 101. Offset: 0, 2^53−1 and 2^53. Also empty strings, decimals and exponents, signs, whitespace and LF/CR/CRLF, hex, full-width digits, leading zeros, and `qs` arrays and objects.
- If both parameters are invalid, the `limit` error is returned.
- An empty page returns `200 { products: [], count: 0 }`, and `count` is the number of rows returned.
- An empty `category` means no filter. `activeOnly: false` callers keep their filtering behaviour and now get the default limit.
- A database rejection is passed to `next(err)` exactly once, and no response is sent.
- Tests: P1–P15 (`tests/utils/pagination.test.js`), M1–M6 (`tests/models/product.test.js`) and H0–H13 (`tests/routes/products.test.js`).

**C — Context**
- Every SPEC §2 contract item is implemented as written.
- The README endpoint row matches SPEC §6. The README note documents the accepted behaviour change: a request with no parameters now returns at most 50 rows, so existing callers that expected the full catalogue are silently truncated.
- The commit order follows SPEC §9: SPEC, agents, failing tests, one implementation commit, then a SPEC coverage amendment and a `fix:` coverage commit.

**S — Simplicity**
- One small parser function, a four-line model change and a five-line route change.
- No new dependencies, options or metadata. There is no COUNT query and no `total`/`hasMore`.

## Security
- **Strict input validation.**
  - `limit` and `offset` must be strings whose entire content matches `/^(0|[1-9][0-9]*)$/`. The regex has no `m` flag (`src/utils/pagination.js:13,21`).
  - Only after that check is the value converted with `Number()` and checked for safe-integer status and range (`:22-23`).
  - Arrays, objects, whitespace, line terminators, signs, decimals and leading zeros are rejected before any conversion. So there is no lenient path of the `parseInt("10abc")` kind.
- **Validation before data access.** The route returns 400 before calling the model (`src/routes/products.js:16-19`). H3–H8 assert that neither `Product.findAll` nor `db.query` is called on a rejected request.
- **Bound SQL.** `category`, `limit` and `offset` reach PostgreSQL only as `$n` parameters (`src/models/Product.js:17-19,27-30`). M1–M5, H9 and H13 compare the full normalised SQL text and the exact parameter arrays.
- **Public access unchanged.** `optionalAuth()` is still registered ahead of the handler (`src/routes/products.js:13`). H0 checks this by sentinel identity, which proves registration and order only. There is still no permission check, and results do not depend on the caller.
- **Active-product filtering preserved.** The route passes only `{ category, limit, offset }` (`src/routes/products.js:22`), so `activeOnly` keeps its default `true` (`src/models/Product.js:6`).
- **Model-option overrides from the query are ignored.** H13 sends `activeOnly` set to `""`, `"false"` and `"0"`, plus an unknown `foo`. It asserts that `Product.findAll` receives exactly `{ category, limit, offset }`, checked with `toStrictEqual`, and that the SQL still contains `is_active = true`.
- **Fixed validation errors.** The two messages are fixed text and never contain the input (`src/utils/pagination.js:15-16`). H3–H8 assert the exact response bodies.
- **Logging.** The parser and handler add no logging of `limit`, `offset` or other query input. However, the application's existing request logging (`morgan("dev")`, `src/index.js:27`) may record full request URLs, including query strings. This feature does not change that.
- **Large offsets.** An anonymous client can request very large offsets, up to `9007199254740991`. Those requests return no rows but may still cost PostgreSQL a filter and sort. `optionalAuth` has no rate limiting. This feature neither adds nor removes denial-of-service protection.
- **What the limit bounds.** `limit` caps the **number of rows** returned. It does not cap the response size in bytes: `description` is an unbounded `TEXT` column and the endpoint returns `SELECT *`. It also does not cap database execution cost (SPEC §2.4, §3).

## Test and review results

| Check | Result | Who ran it |
|---|---|---|
| `npm test` at e6e8a9c's content (before committing it) | 10/10 suites, 123/123 tests, exit 0 | Claude (implementing agent), in session |
| `npm test` (same content) | 10/10 suites, 123/123 tests | `test-auditor`, reported in its review output |
| `specs-reviewer`, final, stricter security criterion | **PASS, no findings** | Reported by the agent. It cannot run tests and did not. |
| `test-auditor`, final, stricter security criterion | **PASS, no findings** | Reported by the agent |
| `git diff 19f49c4 -- tests/` | Only additions, plus a one-line header comment change (`H0–H12` → `H0–H13`) | Claude, and both reviewers |

The user has not personally run the checks above. The CI result below comes from external-terminal output the user supplied.

| CI check | Result | Source |
|---|---|---|
| GitHub Actions `Tests`, `pull_request` event, PR head `b52746f93ff946bac1e4d9c3c3f9b82a86c1ac09`: [run 43144918492](https://github.com/pceledonioarcanys/orderflow-capstone/actions/runs/43144918492) | `completed` / `success`. The run's head SHA matches the PR head exactly. | The user's external-terminal output |

This result verifies **only** commit `b52746f93ff946bac1e4d9c3c3f9b82a86c1ac09`. It does not cover this REVIEW.md update or any later commit.

## Known limitations (non-blocking)
- **Two H0 assertions can never fail:** `expect(listLayer).toBeDefined()` at `tests/routes/products.test.js:104` and `expect(listLayer.route.stack[1].handle).toBe(handler)` at `:107`. They are kept, because SPEC §9 forbids removing assertions after the failing-test commit. The real H0 checks are at lines 103, 105, 106 and 108.
- **H13 covers specific trigger values.** It tests `""`, `"false"` and `"0"`. The exact-argument check rejects any extra model option, but no example-based test can rule out every imaginable trigger.
- **Evidence limits (SPEC §7.1).**
  - The database is mocked, so the tests prove the SQL and parameters that are **sent**, not how PostgreSQL applies LIMIT/OFFSET, filtering or ordering.
  - The route tests call the handler directly. `qs` parsing, the Express middleware chain, the real `optionalAuth` and the global error handler are not exercised.
  - No real PostgreSQL, HTTP server or authentication check was run.

## Shipping status
- [x] `main` (setup commit `1454c093c865de24a17043260541f6c206eea593`) pushed before the feature branch. The local tracking ref `origin/main` matches.
- [x] PR: https://github.com/pceledonioarcanys/orderflow-capstone/pull/1 (base `main`, head `feature/products-pagination`). Reported from the user's external terminal.
- [x] Green CI for PR head `b52746f93ff946bac1e4d9c3c3f9b82a86c1ac09`: [run 43144918492](https://github.com/pceledonioarcanys/orderflow-capstone/actions/runs/43144918492), `pull_request`, completed / success.
- [ ] **Green CI on the final PR head.** This REVIEW.md update and the human-review record (below) each add a commit and move the PR head, so the final head needs its own successful run with a matching head SHA.

## Human review

| | |
|---|---|
| Reviewed revision | `87d5cf13374c8109a26f9f77f202894853980243` |
| Base | `1454c093c865de24a17043260541f6c206eea593` (`main`) |
| Diff range | `main` (`1454c093…`) → `87d5cf13…`, 12 files |
| Date | 2026-11-12 (Asia/Manila) |
| Review method | The complete diff was displayed and read in sections: production code and README; parser and model tests; route tests; SPEC.md in four parts; both reviewer agent definitions; REVIEW.md and PROCESS.md. |

The user's confirmation, quoted:

> I confirm that I personally read the entire PR diff from main at 1454c093c865de24a17043260541f6c206eea593 through 87d5cf13374c8109a26f9f77f202894853980243, including production code, README, all tests, SPEC.md, both agent definitions, REVIEW.md, and PROCESS.md. I understand the documented behavior change, verification limits, retained test-quality limitations, and review-cycle timeline.

This record covers only revision `87d5cf13374c8109a26f9f77f202894853980243`. The commit that adds this section changes nothing else. Any other later change needs a new review (SPEC §9 step 8).
