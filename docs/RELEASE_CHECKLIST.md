# Before releasing StatementDesk

See the [test report](TEST_AND_VALIDATION_REPORT.md) for checks already run and the result of the latest desktop test attempt.

- [ ] Run the desktop tests on a host that can launch Electron.
- [ ] On macOS, run `npm run dist:mac` for Apple Silicon and Intel. Sign with Developer ID and notarise the app. Verify a clean install, first launch and Gatekeeper on both architectures.
- [ ] On Windows, run `npm run dist:win` for the x64 NSIS installer and sign it. Verify a clean install, first launch, Start-menu entry and project retention after uninstall.
- [ ] Run an independent trial with real supplier data.
- [ ] Generate SHA-256 checksums for the installers.
- [ ] Confirm release approval before publishing the installers.

Builds without signing credentials are for development.
