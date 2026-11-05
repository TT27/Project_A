# Sample fixtures (synthetic)

Supplier **SUP001**, currency **AUD**, cutoff **2026-09-30**. Statement dates are DD/MM/YYYY;
ledger dates are YYYY-MM-DD, so both supported date formats are exercised.

| File | Rows | Total |
|---|---:|---:|
| statement_SUP001_2026-09-30.csv / .xlsx | 8 | 2,860.00 |
| ap_ledger_SUP001_2026-09-30.csv / .xlsx | 7 | 2,533.00 |

Expected: 4 exact matches, 4 exception groups (INV102 amount +30.00, INV103 statement only
+220.00, INV105 ambiguous duplicate +165.00, INV106 ledger only −88.00), difference +327.00.

The .xlsx variants are generated from the CSVs by `npm run samples:xlsx`.
