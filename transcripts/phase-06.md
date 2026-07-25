# Phase 6 — Backend: reviewer-runnable privacy & auth e2e tests

**Date:** 2026-07-26
**Agent:** Claude Code (Sonnet 5)
**Repo:** https://github.com/Wrpfix/BBL-FullStack-Test.git

> Note: this is a reconstructed summary of the session, not a raw log
> export. It records what was asked, decided, and done, in order.

## Request

With Collection/Bookmark CRUD, sharing, and the frontend already built
(phases 3–5), the user asked (in Thai) for an automated test suite a
reviewer could run themselves to actually prove — not just assert — the
CLAUDE.md privacy claims:

1. User A cannot GET/PATCH/DELETE user B's collection or bookmark — must
   get `404`, never `403` (a `403` would leak that the resource exists).
2. A request with no token / an expired token / a wrong-audience token is
   rejected on *every* protected route, not just some.
3. `GET /me` returns exactly the token's own user, never another user's
   data.
4. `GET /collections/:id/bookmarks` returns only that collection owner's
   bookmarks.
5. Pagination/filter query params behave correctly.

Explicit instruction: run the tests for real and report actual pass/fail,
not a summary; if anything failed, diagnose whether it was a test bug or a
real backend bug and fix accordingly, and call out any genuine bug found.

## Investigation before writing anything

Read the existing test patterns first rather than guessing conventions:

- `backend/test/app.e2e-spec.ts` and `shared.e2e-spec.ts` for the e2e
  harness shape (`Test.createTestingModule({ imports: [AppModule] })`,
  `setGlobalPrefix('api')`, global `ValidationPipe`).
- `backend/src/auth/jwt-verification.spec.ts` for how this repo already
  tests real JWT verification without hitting Auth0's live JWKS endpoint:
  generate a local RSA keypair, monkey-patch
  `JwtStrategy._secretOrKeyProvider` to return the local public key, and
  sign test tokens with the matching private key via `jsonwebtoken`.
- `collections.service.ts` / `bookmarks.service.ts` to confirm the
  `findFirst`/`updateMany`/`deleteMany` + `{ id, ownerId }` +
  `NotFoundException` on `count === 0` pattern that's supposed to make
  cross-user access structurally impossible.
- `prisma/schema.prisma`, DTOs, and controllers for exact field
  names/routes/pagination shape (`PaginatedResult<T>`, `page`/`limit`,
  `ListBookmarksQueryDto.collectionId`).

Confirmed there was no existing test database or docker-compose setup —
`backend/.env` points at a dev MySQL on `localhost:3307`, which wasn't
running. Checked Docker was available (`docker --version` /
`docker ps` worked) and decided to stand up a disposable MySQL container
rather than mock Prisma, since the whole point was proving real
database-level scoping, not service-logic-in-isolation (that's already
covered by the mocked unit specs).

## Implementation

New file: `backend/test/privacy-and-auth.e2e-spec.ts` (77 tests).

- **Test database**: `mysql:8.0` container (`bbl-test-mysql`, host port
  3308, db `bookmarks_test`), migrated with
  `prisma migrate deploy` against that URL. The suite throws in
  `beforeAll` unless `DATABASE_URL` contains `"bookmarks_test"`, as a
  guard rail against a reviewer accidentally pointing it at a real dev/prod
  database (the suite truncates `bookmark`/`collection`/`user` between
  every test).
- **Auth bypass**: same technique as `jwt-verification.spec.ts` — a
  locally generated RSA keypair, `JwtStrategy._secretOrKeyProvider`
  monkey-patched per test app instance, tokens signed locally with
  `jsonwebtoken` for arbitrary `sub`/`aud`/`iss`/`expiresIn`. No live Auth0
  network calls anywhere in the suite.
- **Cross-user isolation**: seeded two real users (A, B) plus rows owned by
  B, then hit every mutating/read route on B's resources as A — asserted
  `404` (not `403`) on GET/PUT/PATCH/DELETE for both collections and
  bookmarks, plus `POST/DELETE :id/share`. Added a same-body-comparison
  test (foreign id vs. made-up id → identical response body) to prove
  there's no existence oracle, and a direct-DB-write test that seeds a
  bookmark owned by B but carrying A's `collectionId` FK (impossible via
  the API today, but proves the *read* path filters by `ownerId`, not just
  `collectionId`, independent of whatever the write path currently
  enforces).
- **Auth guard coverage**: parametrized (`it.each`) over all 16 protected
  routes × {no token, expired token, wrong audience, garbage/malformed
  token} = 64 cases, all asserted `401`. Added one sanity check that
  `/api/health` is still public, so a bug that broke the guard globally
  (e.g. an accidental `@Public()` on everything) wouldn't silently pass.
- **`/me`**: seeded user B *before* user A specifically to catch an
  "always returns the first row" class of bug; asserted A's token returns
  A's `id`/`auth0Sub`/`email` and not B's.
- **`GET /collections/:id/bookmarks`**: asserted only the target
  collection's bookmarks come back (not bookmarks from the same owner's
  *other* collections, not the cross-owner FK-leak case above), and that a
  non-owner gets `404` on the endpoint entirely.
- **Pagination/filtering**: page/limit split across 5 seeded collections
  with no duplicate/overlapping ids between pages, `limit=101` rejected
  with `400` (DTO's `@Max(100)`), `bookmarks?collectionId=` scoping to the
  right collection, and `collectionId` pointing at *another user's*
  collection returning an empty page rather than that user's bookmarks.

## Running it

```
docker run -d --name bbl-test-mysql -e MYSQL_ROOT_PASSWORD=test_pw \
  -e MYSQL_DATABASE=bookmarks_test -p 3308:3306 mysql:8.0 \
  --default-authentication-plugin=mysql_native_password

DATABASE_URL="mysql://root:test_pw@127.0.0.1:3308/bookmarks_test" \
  npx prisma migrate deploy

DATABASE_URL="mysql://root:test_pw@127.0.0.1:3308/bookmarks_test" \
  npx jest --config ./test/jest-e2e.json privacy-and-auth
```

## Results — actually run, not summarized

```
Test Suites: 1 passed, 1 total
Tests:       77 passed, 77 total
Time:        ~4s
```

Also re-ran the full pre-existing e2e suite and the full unit suite
against the same setup to confirm nothing regressed:

```
DATABASE_URL=... npx jest --config ./test/jest-e2e.json   → 3 suites, 84 tests, all pass
npm test (unit)                                            → 7 suites, 40 tests, all pass
```

**No bugs found.** Every test passed on the first run — the existing
`{ id, ownerId }`-scoped Prisma queries and blanket `NotFoundException`
pattern already satisfy CLAUDE.md's privacy rules end-to-end through real
HTTP requests against a real database, not only in the mocked service
specs from earlier phases.

## Commits

Not yet committed — `backend/test/privacy-and-auth.e2e-spec.ts` is a new,
untracked file as of the end of this session. Per CLAUDE.md rule 4, this
should land as its own single logical commit
(`test(e2e): cover cross-user isolation, auth guard, and pagination
against a real DB`) rather than being folded into an unrelated change.

## Open items carried into the next phase

- Commit the new e2e spec (not yet done this session).
- The disposable test MySQL container (`bbl-test-mysql`, port 3308) was
  left running at the end of the session for immediate re-runs; needs
  `docker rm -f bbl-test-mysql` when no longer needed, and there's no
  npm script wrapping the docker-up/migrate/test sequence yet — currently
  three manual commands, documented in this transcript and in the
  session's final response but not codified in `package.json` or CI.
- Still-outstanding from phase 5 (unchanged): no automated frontend
  tests; `cacheLocation="memory"` vs `localStorage` trade-off unresolved;
  JIT-created user's placeholder email; confirm Auth0 issues signed RS256
  access tokens (not opaque) in the dashboard; no UI for the sharing
  endpoints.
