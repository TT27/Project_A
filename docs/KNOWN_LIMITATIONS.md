# Known Limitations (v0.1)

- **Single currency:** AUD only.
- **Single supplier per project:** one statement vs one ledger export at a time.
- **No PDF/OCR/image import:** CSV and XLSX only (`.xls` legacy binary not supported).
- **No GenAI, no cloud, no network:** fully offline and deterministic by design.
- **No encryption at rest:** project files and exports are plain local files — rely on OS disk encryption.
- **No multi-user / concurrent access:** a project file is intended for single-user, single-session use.
- **Reconciliation scope:** StatementDesk compares the two imported datasets. It does **not** verify your complete accounting ledger and is not a substitute for a full audit.
- **Ambiguous matches are never auto-resolved:** possible duplicates are surfaced for manual review rather than guessed.
- **Signing/notarization:** development builds are **unsigned and not notarized** — see the Release Checklist. This is a release blocker for public distribution.
- **Clean installation testing** on macOS and Windows has **not** been performed in the Linux build environment and must be done on the target OSes before public beta.
