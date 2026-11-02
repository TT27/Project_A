# Troubleshooting

### The app won't open on macOS ("unidentified developer")
Development builds are **unsigned**. Right-click the app → **Open**, then confirm. (A signed, notarized build will remove this step — see the Release Checklist.)

### Import skips rows / shows fewer rows than expected
Check the import diagnostics panel for the reason per row. Common causes: unmapped required column, blank reference, unparseable date, or amount that isn't numeric. Fix the source file or adjust the column mapping and re-import.

### Totals don't match my source document
Confirm you selected the correct **sheet** and **data range** (XLSX), and that credit notes are negative. The Validation screen shows per-side counts and sums so you can isolate the discrepancy.

### Dates look wrong (day/month swapped)
Confirm the date format for each column during mapping. The statement sample uses DD/MM/YYYY and the ledger sample uses YYYY-MM-DD.

### A spreadsheet value shows a leading apostrophe
That is deliberate. Values beginning with `= + - @` are neutralised to prevent spreadsheet formula injection. The original value is preserved in the project database.

### Export fails with an authorisation error
Exports can only be written to a path you selected through the native save dialog in the same session. Re-open the save dialog and choose the destination again.

### A project file won't open ("corrupted")
StatementDesk refuses to open a project whose integrity check fails, rather than risk partial/incorrect data. Restore from a backup copy if you have one. Use **File → Back up project** periodically.

### Reset to a clean state
Close the app and open a different project, or create a new one. Deleting a project file removes its data permanently.
