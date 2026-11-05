# StatementDesk test results

## Current verification

| Check | Command | Result |
|---|---|---|
| Unit, property and integration tests | `npm test` | 108 passed across 15 files |
| Lint | `npm run lint` | Passed |
| TypeScript | `npm run typecheck` | Passed |
| Production bundle | `npm run build` | Passed |
| Desktop end-to-end tests | `npm run test:e2e` | The current run stopped at Electron launch because the Linux environment blocked a socket. The previous build reported three passing tests. |

The automated tests cover import parsing, financial comparisons, project migrations, saved runs and export safety. Regression tests cover project switching during import, incomplete drafts, historical exports, malformed CSV quoting, native Excel dates and packaged sample paths.

To run the desktop suite on Linux with a virtual display, use `xvfb-run -a npm run test:e2e`.

## Sample reconciliation

The SUP001 sample has an AUD 2,860.00 statement balance and an AUD 2,533.00 ledger balance. It produces an AUD 327.00 difference, four exact matches and four exceptions. See the [sample files](../samples/README.md) for the individual amounts.

## Reconciliation benchmark

A previous benchmark ran the comparison engine five times on 10,000 rows per side. The median was **44.7 ms**, with a range of 30.6 to 55.6 ms. The host used an AMD EPYC 9254, 2 vCPUs, 7.8 GB RAM and Node.js 24.21.0. This measures the comparison engine. Import, SQLite and rendering are outside the benchmark.

Run `node scripts/perf.mjs 10000` to reproduce it.

## Installers

Linux packaging attempts reached the native dependency rebuild, where `node-gyp` could not cross-compile `better-sqlite3`. Build and verify installers on [the target platforms](RELEASE_CHECKLIST.md).
