# StatementDesk v0.1.0 (beta)

StatementDesk compares a supplier statement with an accounts payable ledger export.
It runs on macOS 13 or later (Apple Silicon and Intel) and targets Windows 11 x64.

Everything is processed locally. There are no accounts, no cloud sync, no telemetry
and no network activity during import, comparison, review or export.

## Development

Requires Node.js 20+ and npm. Dependencies are pinned in `package-lock.json`.

```bash
npm install          # installs dependencies and downloads the Electron runtime
npm run dev          # launch with hot reload
npm run lint         # ESLint (type-aware)
npm run typecheck    # tsc for main/preload/renderer/tests
npm test             # Vitest unit + property + integration tests
npm run test:e2e     # Playwright driving the built Electron app (Linux: xvfb-run -a npm run test:e2e)
npm run build        # electron-vite production build into out/
npm run dist:mac     # DMG + ZIP for arm64 and x64 into release/
npm run dist:win     # NSIS installer (secondary target) into release/
npm run icons        # rebuild icons from build/icon-source.svg
```

## Repository layout

```
src/main        Electron main process (window, menu, security, validated IPC)
src/preload     Narrow contextBridge API (no generic IPC)
src/renderer    React UI (components, pages, hooks, styles)
src/shared      Data contracts: TypeScript types + Zod schemas shared by all layers
src/domain      Pure financial engine (money, dates, references, reconciliation)
src/import      CSV and XLSX readers and column mapping
src/storage     SQLite project files and migrations
src/export      XLSX, CSV and HTML report writers
tests/          unit, property, integration, e2e
samples/        Example statement and ledger for supplier SUP001
docs/           User-facing documentation
scripts/        Build helpers (icons, sample workbooks)
build/          electron-builder resources (icons, entitlements, notarize hook)
```

## Installer builds

Run `npm run dist:mac` on macOS or `npm run dist:win` on Windows. The native
`better-sqlite3` dependency needs a build for the target OS. Installers are written to
`release/`.

Builds without signing credentials are for development. The macOS notarisation hook
uses `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. See the
[release checklist](docs/RELEASE_CHECKLIST.md) for signing and installation checks.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Supported input formats](docs/SUPPORTED_FORMATS.md)
- [Privacy statement](docs/PRIVACY.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Test & validation report](docs/TEST_AND_VALIDATION_REPORT.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Third-party notices](docs/THIRD_PARTY_NOTICES.md) · [SBOM](docs/sbom.json)
- [How StatementDesk works](docs/IMPLEMENTATION_REPORT.md)
