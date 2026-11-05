# How StatementDesk works

StatementDesk is an Electron desktop app. React renders the interface and the main process handles file access, SQLite and report writing. The preload bridge exposes a small set of validated IPC methods to the renderer. The reconciliation engine in `src/domain` works independently of the desktop app.

## From source file to report

1. An import worker reads CSV or XLSX, applies the column mapping and returns the valid rows and validation counts. Each valid row keeps its original row number.
2. SQLite stores the current import for each side. Amounts are stored as signed integer cents, and the engine compares the statement and ledger by supplier, currency, document type and reference.
3. Each run records the comparison and its source metadata in one transaction. Re-importing a file replaces the current input for that side. The original rows and source details stay with earlier runs.
4. Review decisions are stored as a history of events. Exports use the selected run's rows and source details. Excel and HTML also include the draft status when invalid rows were omitted.

Projects created before source snapshots can still be opened and reviewed. A new reconciliation is needed to export a report with reliable source details.

## Local data and security

The renderer runs with context isolation and sandboxing. It uses the preload bridge to request file operations. An export destination must come from the save dialog. Spreadsheet exports guard against formula injection, and the HTML report escapes text from source files.

Project files and reports are stored locally. See the [privacy statement](PRIVACY.md) for storage and encryption details.

## Verification and release

The [test report](TEST_AND_VALIDATION_REPORT.md) records automated checks and the reconciliation benchmark. The [release checklist](RELEASE_CHECKLIST.md) covers signing, installers and clean-install tests.
