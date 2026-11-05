# Troubleshooting

### The app won't open on macOS ("unidentified developer")
Development builds are **unsigned**. Right-click the app → **Open**, then confirm. (A signed, notarized build will remove this step — see the Release Checklist.)

### Import skips rows / shows fewer rows than expected
Check the mapping preview or Validation page for the affected rows. Common causes include a missing column, blank reference, invalid date or unreadable amount. Fix the source file or adjust the column mapping and re-import.

### Totals don't match my source document
Confirm you selected the correct **sheet** and **data range** (XLSX), and that credit notes are negative. The Validation screen shows per-side counts and sums so you can isolate the discrepancy.

### Dates look wrong (day/month swapped)
Check the date format selected for text dates on the Import & Mapping page. The statement sample uses DD/MM/YYYY and the ledger sample uses YYYY-MM-DD.

### A spreadsheet value shows a leading apostrophe
That is deliberate. Values beginning with `= + - @` are neutralised to prevent spreadsheet formula injection. The original value is preserved in the project database.

### Export fails with an authorisation error
Exports can only be written to a path you selected through the native save dialog in the same session. Re-open the save dialog and choose the destination again.

### A project file won't open ("corrupted")
If a project fails the integrity check, open a backup copy. To make a backup, close the project before copying its `.statementdesk` file.

### Reset to a clean state
Close the app and open a different project, or create a new one. Deleting a project file removes its data permanently.
