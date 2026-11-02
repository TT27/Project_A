# StatementDesk v0.1.0 — Final Implementation Report

Local-first desktop app that reconciles a supplier statement against an AP ledger export. Built per `SPEC_ORIGINAL.md`. This report records what is **completed**, **partial**, **blocked**, and **unverified**.

## 1. Architecture

Electron (main + preload + renderer) with a strict security boundary and a pure, UI-independent financial core.

```
src/main        Electron main: window, macOS menu, security config, Zod-validated IPC, export write-path authorisation
src/preload     contextBridge — frozen, narrow typed API surface (9 namespaces); no Node leaked to renderer
src/renderer    React + Vite UI: Home, Setup, Import&Mapping, Validation, Results, Review, Export, Feedback
src/domain      PURE engine: money (integer cents), dates, reference normalisation, compareOpenItems (Rules 1–6),
                validateControls, ENGINE_VERSION. ESLint purity rule forbids Electron/Node/DB/UI imports here.
src/import      CSV/XLSX readers, worker-based inspect/parse/normalise, import diagnostics
src/storage     SQLite ProjectRepository + migrations (7 tables, WAL, immutable runs, append-only review_events, backup)
src/export      buildReport + XLSX (ExcelJS) / CSV / HTML writers, formula-guard, diagnostics builder
src/shared      Zod contracts shared across the IPC boundary
samples/        Golden SUP001 fixtures
docs/           All required documentation
```

Security: `contextIsolation` on, `nodeIntegration` off, `sandbox` on, `webviewTag` off, CSP set, `setWindowOpenHandler` denies. All IPC arguments are Zod-validated; exports may only be written to paths the user approved through a native save dialog.

## 2. Modules & features completed

- **Financial domain** — signed integer cents throughout (no float currency maths); AUD only; invoices positive, credit notes negative. Deterministic `compareOpenItems` implements matching Rules 1–6; duplicates/ambiguous candidates are surfaced, never auto-matched. Control totals per side + difference. `ENGINE_VERSION` stamped on runs.
- **Import** — CSV + XLSX (sheet/header/range selection), mapping profiles, worker-based processing, per-row diagnostics. Every imported row remains traceable to its source row.
- **Persistence** — SQLite with migrations; reconciliation runs are immutable; review events are append-only; projects reopen with results and notes intact; `.statementdesk` association; integrity check refuses corrupted files; `db.backup`.
- **Reports/exports** — XLSX workbook (Summary, Exceptions, Matched, ImportedStatement, ImportedLedger, Exclusions, ImportSettings) with numeric money cells (2-dp display) and text identifiers; Exceptions CSV with the exact spec §9 columns; self-contained printable HTML (no scripts/external resources). Formula injection neutralised (leading `= + - @` prefixed with `'`) without losing the DB-preserved value; HTML fully escaped; precise "No differences found within the imported data." wording.
- **UX** — all 8 screens; Home "Try sample" wired to `app.openSample`; offline Feedback & diagnostics (preview before save; diagnostics contain only app/OS version, row counts, error codes — no customer data; no fictional support URL). macOS design language, keyboard accessible, accurate failure states.

## 3. Tests executed + results (all real)

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS** (0/0)
- `npm run build` — **PASS**
- `npx vitest run` — **100/100** across 14 files (domain, property-based, import, storage integration, security-config, export-security, export-ipc-guard, golden)
- `xvfb-run -a npm run test:e2e` — **3/3** (launch; bridge-surface/no-Node; full golden workflow with persistence across reopen)

See `TEST_AND_VALIDATION_REPORT.md` for the full breakdown.

## 4. Golden case output (verified)

Statement total **286000c** (AUD 2,860.00), ledger total **253300c** (AUD 2,533.00), difference **+32700c** (+327.00); **4 exact matches + 4 exceptions** (amount mismatch INV102 +30.00, statement-only INV103 +220.00, ambiguous duplicate INV105 ±165.00, ledger-only INV106 −88.00). Reproduced by both `golden.test.ts` and the e2e workflow.

## 5. Performance (measured)

10,000 rows/side (20,000 total, 10,000 outcomes): **median 44.7 ms** (min 30.6, max 55.6; 5 runs) on AMD EPYC 9254, 2 vCPU, 7.8 GB, Node v24.21.0. Reproduce: `node scripts/perf.mjs 10000`.

## 6. Security limitations

- Project files and exports are **not encrypted at rest** in v0.1 (rely on OS disk encryption).
- Unsigned/not-notarized development builds only — publisher verification is a release blocker.

## 7. Packaging status + artifact paths

**Blocked on this Linux host** for both macOS and Windows. Root cause: native module `better-sqlite3` cannot be cross-compiled (`node-gyp does not support cross-compiling native modules from source`). The JS bundle builds; only the foreign-platform native rebuild fails. No installers or checksums were produced. Builds must run on macOS (dmg+zip arm64+x64) and Windows (NSIS x64) respectively, or a per-OS CI matrix. electron-builder config is complete; outputs will land under `release/`.

## 8. Remaining blockers / outstanding before public beta

1. macOS code signing (Developer ID) + notarization — needs credentials; must not be fabricated.
2. Windows Authenticode signing — needs certificate.
3. Clean macOS **and** Windows install/uninstall testing on the target OSes (cannot be done on Linux).
4. SHA-256 checksums of the produced installers.
5. Independent end-user validation.

Per the spec's Definition of Done, these external release gates are **not** represented as completed.

## 9. Exact commands

```bash
npm install
npm run dev                       # develop
npm run typecheck && npm run lint && npm run build
npx vitest run                    # unit/property/integration
xvfb-run -a npm run test:e2e      # e2e (Linux); plain `npm run test:e2e` on mac/win
node scripts/perf.mjs 10000       # performance
npm run dist:mac                  # dmg+zip arm64+x64  (run on macOS)
npm run dist:win                  # NSIS x64           (run on Windows)
```

## 10. Definition-of-Done status

Application launches ✅ · primary workflow functional ✅ · CSV/XLSX import ✅ · financial validation correct ✅ · golden test passes ✅ · duplicates conservative ✅ · every row traceable ✅ · review decisions persist ✅ · exports reproduce results ✅ · projects reopen ✅ · required automated tests pass ✅ · offline workflow ✅ · no known critical security/data-integrity defects ✅ · documentation present ✅ · **distributable build can be generated ⛔ on this host (requires target OS — config verified correct).**
