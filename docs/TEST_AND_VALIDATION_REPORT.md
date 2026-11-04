# Test & Validation Report — StatementDesk v0.1.0

Generated for the Phase 7 exit review. All results below were **actually executed** in the build environment on the date of this report.

## Build environment

| | |
|---|---|
| OS | Ubuntu Linux (kernel 6.16.9+), headless |
| CPU | AMD EPYC 9254, 2 vCPU |
| RAM | 7.8 GB |
| Node.js | v24.21.0 |
| Electron (target) | 39.8.10 |

> The build host is **Linux**. macOS and Windows installer builds and clean-install testing **cannot** be executed here (see Packaging status).

## Static checks

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | **PASS** (main, preload, web/renderer, tests) |
| Lint | `npm run lint` | **PASS** (0 errors, 0 warnings; includes `src/domain` purity rule) |
| Production build | `npm run build` | **PASS** (electron-vite → `out/`) |

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Unit + property + integration | `npx vitest run` | **100 passed / 100** across 14 files |
| End-to-end (Electron) | `xvfb-run -a npm run test:e2e` | **3 passed / 3** |

### Vitest coverage areas
- Domain: money, dates, reference normalisation, reconciliation Rules 1–6, control totals, property-based (fast-check) invariants.
- **Golden test case** (`golden.test.ts`): reproduces the reference fixture exactly — statement 286000c, ledger 253300c, difference **+32700c**, 4 exact + 4 exceptions.
- Import: CSV/XLSX parsing, normalisation, diagnostics.
- Storage (integration): corrupted-file rejection, single-transaction import (no partial rows), multiple immutable runs, migration-preserves-data.
- Security: `security-config.test.ts` asserts `webPreferences` (contextIsolation, nodeIntegration=false, sandbox, webSecurity, webviewTag=false), CSP, and `setWindowOpenHandler` deny.
- Export security (`export-security.test.ts`, 6 tests): CSV + XLSX formula-injection neutralisation, HTML escaping, "No differences found" wording, 7 mandated sheets, numeric money cells.
- Export/IPC guard (`export-ipc-guard.test.ts`, 8 tests): invalid IPC arguments rejected via contract schemas; write-path authorisation guard (only save-dialog-approved paths accepted).

### End-to-end coverage
1. App launches, Home shows version + local-processing statement.
2. Renderer has **no** `require`/`process`; bridge surface is exactly the 9 expected namespaces.
3. **Full golden workflow**: `app.openSample` → `reconcile.run` (asserts golden summary) → `review.record` → close/reopen → note persists. *(This is the Phase 5 exit criterion — the complete sample workflow functions without developer intervention.)*

## Performance

`scripts/perf.mjs` bundles the pure `compareOpenItems` engine and runs it against generated data.

| Metric | Value |
|---|---|
| Dataset | 10,000 rows per side (20,000 total), 10,000 outcomes |
| Runs | 5 (median reported) |
| **Median** | **44.7 ms** |
| Min / Max | 30.6 ms / 55.6 ms |
| Hardware | AMD EPYC 9254, 2 vCPU, 7.8 GB, Node v24.21.0 |

Reproduce with `node scripts/perf.mjs 10000`.

## Packaging status

| Target | Command | Result |
|---|---|---|
| macOS dmg+zip (arm64 + x64) | `npm run dist:mac` | **BLOCKED** |
| Windows NSIS x64 | `npm run dist:win` | **BLOCKED** |

**Root cause (identical for both):** the app depends on the native module **`better-sqlite3`**. electron-builder's `@electron/rebuild` must compile it for each target platform/ABI, and `node-gyp` **does not support cross-compiling native modules from source** on this Linux host:

```
⨯ node-gyp does not support cross-compiling native modules from source.
  preparing moduleName=better-sqlite3 arch=x64
```

The JavaScript bundle builds successfully (electron-vite step completes); the failure is strictly the native-module rebuild for a foreign platform. **These installers must be built on their respective target OSes** (macOS for the dmg/zip, Windows for the NSIS exe), or in a per-OS CI matrix where prebuilt `better-sqlite3` binaries resolve.

No distributable artifacts were produced; therefore no SHA-256 checksums of installers exist yet. The electron-builder configuration (`electron-builder.yml`) is complete and correct — mac dmg+zip for arm64+x64 (min macOS 13), Windows NSIS secondary, notarize hook present-but-inactive.

## Tests blocked in this environment (must run on target OS)

- macOS dmg/zip build + launch of a signed/unsigned `.app`.
- Windows NSIS installer build + clean install / uninstall / project-retention.
- Code signing + notarization verification (no credentials; must not be fabricated).
- Independent end-user validation.
