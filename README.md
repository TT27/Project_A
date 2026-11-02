# StatementDesk v0.1.0 (beta)

Local-first desktop application for reconciling a supplier statement against an
accounts payable ledger export. Primary platform: macOS 13+ (Apple Silicon and Intel).
Secondary platform: Windows 11 x64.

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
npm run icons        # regenerate placeholder icons from build/icon-source.svg
```

## Repository layout

```
src/main        Electron main process (window, menu, security, validated IPC)
src/preload     Narrow contextBridge API (no generic IPC)
src/renderer    React UI (components, pages, hooks, styles)
src/shared      Data contracts: TypeScript types + Zod schemas shared by all layers
src/domain      Pure financial engine (money, dates, references, reconciliation)
src/import      CSV / XLSX readers and mapping            (Phase 3)
src/storage     SQLite persistence and migrations         (Phase 4)
src/export      XLSX / CSV / HTML report writers          (Phase 5)
tests/          unit, property, integration, e2e
samples/        Synthetic SUP001 golden fixtures
docs/           User-facing documentation
scripts/        Build helpers (icons, sample workbooks)
build/          electron-builder resources (icons, entitlements, notarize hook)
```

## Signing status

No Apple Developer ID or Windows code-signing certificate is configured. Builds are
**unsigned development builds**. The notarization hook (`build/notarize.cjs`) activates
automatically when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are set.
Publisher verification is a release blocker for public distribution.

## Documentation

See the `docs/` directory:

- [User guide](docs/USER_GUIDE.md)
- [Supported input formats](docs/SUPPORTED_FORMATS.md)
- [Privacy statement](docs/PRIVACY.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Test & validation report](docs/TEST_AND_VALIDATION_REPORT.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Third-party notices](docs/THIRD_PARTY_NOTICES.md) · [SBOM](docs/sbom.json)
- [Implementation report](docs/IMPLEMENTATION_REPORT.md)

## Packaging note

macOS (`npm run dist:mac`, dmg+zip arm64+x64) and Windows (`npm run dist:win`, NSIS x64) installers
**must be built on their respective target OSes**. The app depends on the native module `better-sqlite3`,
which `node-gyp` cannot cross-compile from Linux. Builds produced without signing credentials are
unsigned development builds — publisher verification is a release blocker. See the release checklist.
