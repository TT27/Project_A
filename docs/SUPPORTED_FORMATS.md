# Supported Input Formats

## File types

- **CSV** uses UTF-8, with or without a byte order mark. Fields can be quoted, including fields with commas or line breaks. Fix any quoting errors before importing.
- **XLSX** lets you choose the worksheet, header row and data range.

Supported file extensions are `.csv` and `.xlsx`.

## Required columns (mapped during import)

| Canonical field | Notes |
|---|---|
| Document reference | Invoice or credit note number. Surrounding spaces are trimmed. Case, prefixes, punctuation and leading zeros are preserved. |
| Document date | See date handling below. |
| Document type | Invoice or credit note. |
| Amount | Signed. **Invoices positive, credit notes negative.** |

You can also map supplier, currency and as-of date columns.

## Amounts

Use AUD. Amounts are stored as signed cents. The importer accepts thousands separators and a leading currency symbol. If the source uses positive values for credit notes, choose the option to apply the sign by document type.

## Dates

Choose `DD/MM/YYYY` or `YYYY-MM-DD` for dates stored as text. The app reads native Excel dates directly. Document dates after the project cut-off are flagged as invalid.

## XLSX specifics

The import uses rows from the selected sheet and range. For formula cells it uses the last value saved in the workbook. A required formula cell without a saved value is flagged during import.

## Sample files

The bundled `samples/` fixture (supplier **SUP001**, cut-off **2026-09-30**) contains:

- `statement_SUP001_2026-09-30.csv` — 8 rows, AUD 2,860.00 (DD/MM/YYYY)
- `ap_ledger_SUP001_2026-09-30.csv` — 7 rows, AUD 2,533.00 (YYYY-MM-DD)

The expected result is an AUD 327.00 difference, with four exact matches and four exceptions. See the [sample breakdown](../samples/README.md) for the individual amounts.
