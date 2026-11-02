# Release Checklist — StatementDesk v0.1

Status legend: ✅ done · ⚠️ partial · ⛔ blocked (needs target OS / credentials) · ⬜ not started

## Code quality
- ✅ TypeScript type check passes (`npm run typecheck`)
- ✅ Lint passes incl. `src/domain` purity rule (`npm run lint`)
- ✅ Production build succeeds (`npm run build`)
- ✅ Unit/property/integration tests: 100/100 (`npx vitest run`)
- ✅ End-to-end tests: 3/3 (`xvfb-run -a npm run test:e2e`)
- ✅ Golden test case reproduces spec fixture exactly
- ✅ Performance measured and recorded (10k rows/side, median 44.7 ms)

## Security & privacy
- ✅ contextIsolation on, nodeIntegration off, sandbox on (asserted in test)
- ✅ CSP set; `setWindowOpenHandler` denies new windows
- ✅ Typed, Zod-validated IPC; invalid arguments rejected (tested)
- ✅ Export write paths restricted to save-dialog-approved locations (tested)
- ✅ CSV/XLSX formula-injection neutralised; HTML output escaped (tested)
- ✅ No network activity / telemetry
- ⚠️ Project files & exports **not encrypted at rest** — documented in Privacy statement (acceptable for v0.1, rely on OS disk encryption)

## Packaging (macOS primary, Windows secondary)
- ✅ electron-builder config complete: mac dmg+zip arm64+x64 (min macOS 13), Windows NSIS x64
- ⛔ `npm run dist:mac` build — blocked on Linux (native `better-sqlite3` cannot be cross-compiled); **must build on macOS**
- ⛔ `npm run dist:win` build — blocked on Linux (same root cause); **must build on Windows**
- ⛔ SHA-256 checksums of installers — pending the builds above
- ⬜ Windows target filename `StatementDesk-0.1.0-win-x64-Setup.exe` — produced by NSIS build on Windows

## Signing & notarization (release blockers)
- ⛔ macOS code signing (Developer ID) — no credentials; **must not be fabricated**
- ⛔ macOS notarization — notarize hook present but inactive without credentials
- ⛔ Windows Authenticode signing — no certificate
- ⚠️ Any build produced now is an **unsigned development build**; publisher verification must be marked as a release blocker

## Documentation
- ✅ README (updated)
- ✅ User guide
- ✅ Supported input formats guide
- ✅ Privacy statement
- ✅ Known limitations
- ✅ Troubleshooting guide
- ✅ Test & validation report
- ✅ Release checklist (this file)
- ✅ Third-party notices + SBOM (`docs/THIRD_PARTY_NOTICES.md`, `docs/sbom.json`)
- ✅ Implementation report (`docs/IMPLEMENTATION_REPORT.md`)

## Before public beta (outstanding)
1. Build signed, notarized macOS dmg+zip (arm64 + x64) on macOS; verify clean install + Gatekeeper.
2. Build signed Windows NSIS installer on Windows; verify clean install / uninstall / project retention / Start-menu entry.
3. Generate and publish SHA-256 checksums for all installers.
4. Independent end-user validation on real supplier data.
5. Do **not** auto-publish releases or distribute binaries without explicit authorisation.
