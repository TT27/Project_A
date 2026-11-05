# Using StatementDesk

StatementDesk compares one supplier statement with an accounts payable ledger export at the same cut-off date. Your files and results stay on your computer.

## Start or open a project

Choose **New reconciliation** and enter the supplier name, supplier ID and cut-off date. Select both source files and confirm that they show outstanding items at the same date. StatementDesk supports AUD. Choose where to save the `.statementdesk` project file.

On Home, **Try sample** opens an example for supplier SUP001. To resume your own work, choose **Open existing project** or select a project from **Recent local projects**. Saved imports, the latest run and review notes are available when you reopen a project.

## Import both files

1. For an Excel workbook, choose the worksheet. Set the header row and data range if needed.
2. Map the document reference, type, date and outstanding amount. You can also map supplier, currency and as-of date.
3. Choose the format for dates stored as text. Choose whether amounts are already signed or the app should apply the sign by document type. Invoices are positive and credit notes are negative.
4. If you have an independent total from the source, enter it as the control total. Preview the mapping, check any flagged rows, then import the file.

## Check the totals

On **Validation**, compare each imported total with the control total and check how many rows were valid, invalid or excluded. A matching control total can still hide offsetting errors.

If rows are invalid, correct the files and re-import them. You can also acknowledge the omissions and run an incomplete draft. Results show the number of invalid rows left out.

## Review the results

The app groups rows by document type and reference for the selected supplier. An exact match has the same date and amount on both sides. Other groups show amount or date differences, items found on only one side, or possible duplicates. Duplicate groups need review. Use the source row numbers to find the original entries.

Open **Review** to record a decision and note for an exception. The project keeps a history of those decisions.

## Export a run

| Format | What it contains |
|---|---|
| Excel workbook | Summary, exceptions, matches, imported rows, exclusion counts and source details |
| Exceptions CSV | One row per exception in a fixed column order |
| HTML report | A printable summary and exception list that opens in your browser |

Exports use the source data recorded for the displayed run. Excel and HTML label incomplete drafts and show how many invalid rows were omitted. The fixed-format CSV is available for runs with no invalid rows. If an older run was saved before the app recorded its sources, open **Validation** and run the reconciliation again before exporting.

## Save feedback locally

Use **Feedback** to record what worked and what got in the way. You can preview and save the form to a local file. Optional diagnostics contain version information, row counts and error codes. Supplier names, references and amounts stay out of the diagnostics.
