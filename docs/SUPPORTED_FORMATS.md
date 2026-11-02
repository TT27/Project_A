# Supported Input Formats

## File types

- **CSV** — UTF-8 (BOM tolerated), comma-delimited, RFC-4180 quoting.
- **XLSX** — Office Open XML. Sheet, header row and data range are selectable. `.xls` (legacy binary) is **not** supported.

PDF, scanned images and OCR are **out of scope** for v0.1.

## Required columns (mapped during import)

| Canonical field | Notes |
|---|---|
| Document reference | Invoice / credit-note number. Normalised (case, whitespace, common prefixes) for matching. |
| Document date | See date handling below. |
| Document type | Invoice or credit note. |
| Amount | Signed. **Invoices positive, credit notes negative.** |
| Due date (optional) | Used for display only. |

## Amounts

- Currency is **AUD only**.
- Parsed into **signed integer cents**; thousands separators and a leading currency symbol are tolerated.
- Credit notes must be negative (or typed as credit notes so the sign is applied).

## Dates

- Statement sample uses **DD/MM/YYYY**; ledger sample uses **YYYY-MM-DD**. Both are supported; the format is inferred/confirmed per column during mapping.
- Rows dated after the cut-off are handled per the reconciliation rules.

## XLSX specifics

- Only the selected sheet and range are read.
- Formulas are read as their computed values; no macros are executed.

## Golden sample

The bundled `samples/` fixture (supplier **SUP001**, cut-off **2026-09-30**) contains:

- `statement_SUP001_2026-09-30.csv` — 8 rows, AUD 2,860.00 (DD/MM/YYYY)
- `ap_ledger_SUP001_2026-09-30.csv` — 7 rows, AUD 2,533.00 (YYYY-MM-DD)

Expected: difference **+327.00**, **4 exact matches + 4 exceptions** (amount mismatch INV102 +30, statement-only INV103 +220, ambiguous duplicate INV105 ±165, ledger-only INV106 −88).
