# StatementDesk — User Guide

StatementDesk reconciles a **supplier statement** against your **accounts payable (AP) ledger export** for a single supplier, as at a chosen cut-off date. Everything runs locally; no data leaves your computer.

## 1. Home

- **Try the sample project** — loads the bundled SUP001 fixture end to end so you can see a full reconciliation without preparing files.
- **New project** — start a reconciliation from your own files.
- **Open recent** — reopen a previously saved project (results and review notes are preserved).

## 2. Project setup

Enter the **supplier name/ID**, the **statement cut-off date**, and confirm the currency is **AUD** (the only supported currency in v0.1). A project is created as a local SQLite file you choose the location for.

## 3. Import and mapping

For each side (statement and ledger):

1. Choose a **CSV or XLSX** file via the native file dialog.
2. For XLSX, pick the **sheet** and, if needed, the **header row / data range**.
3. **Map columns** to the canonical fields: document reference, document date, document type, and amount (plus optional due date). Mapping profiles are remembered per supplier.
4. Review the **import diagnostics** — row counts, skipped rows and reasons.

### Amount conventions

- **Invoices are positive**, **credit notes are negative**.
- All amounts are stored as **signed integer cents** — there is no floating-point currency maths.

## 4. Validation

StatementDesk shows **control totals** for each side (count and sum of outstanding amounts) and the **difference**. Completeness warnings flag rows that could not be fully normalised. Confirm the totals match your source documents before continuing.

## 5. Reconciliation results

The deterministic engine applies matching Rules 1–6 and categorises every outcome:

- **Exact match** — reference and amount agree.
- **Amount mismatch** — same reference, different amount.
- **Statement-only** — present on the statement, absent from the ledger.
- **Ledger-only** — present in the ledger, absent from the statement.
- **Ambiguous / possible duplicate** — multiple candidates; handled conservatively (never auto-matched).

Filters and status views let you focus on exceptions. Every row remains traceable to its original source row number.

## 6. Exception review

For each exception you can record a **review decision** and a **note**. Decisions are stored as append-only review events, so the history is preserved and results survive close/reopen.

## 7. Export

From the **Export** page you can produce:

- **XLSX workbook** — Summary, Exceptions, Matched, ImportedStatement, ImportedLedger, Exclusions, ImportSettings sheets.
- **Exceptions CSV** — a fixed, documented column set.
- **Printable HTML report** — self-contained, no scripts, safe to archive or print to PDF from your browser.

You choose the output location through a native save dialog. Financial values are written as numeric cells with two-decimal display; identifiers are written as text and any value starting with `= + - @` is neutralised against spreadsheet formula injection.

Exports use the inputs saved with the displayed run. Excel and HTML reports label incomplete drafts and show how many invalid rows were omitted. The fixed-format CSV is available for runs with no invalid rows. Older runs without source snapshots remain viewable. Run a new reconciliation from Validation to export a report from a migrated project.

## 8. Feedback and diagnostics

An **offline** feedback form captures preparation time, review time, usefulness, problems encountered and likelihood to recommend. The optional diagnostics bundle contains only app version, OS version, row counts and error codes — **no customer data**. You preview everything before it is saved to a file you choose. Nothing is transmitted anywhere.

## Keyboard & accessibility

The interface is keyboard navigable and follows the macOS design language (hidden-inset title bar, light/dark tokens). Failure states are reported accurately rather than hidden.
