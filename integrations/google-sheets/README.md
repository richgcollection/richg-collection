# Google Sheet ⇄ website stock sync

Keeps the **RICH G COLLECTION - STOCK TRACKER** Google Sheet and the website's
stock, sales and customers in sync, in both directions. No Google Cloud project
or key is needed: a script inside the sheet does the talking.

| Direction | What moves |
|---|---|
| Sheet → website | Every Stock In / Stock Out row: stock counts, sales, giveaways, restocks. PROFIT-sheet discounts on new sales. New buyers become customers. |
| Website → sheet | Paid online orders (TYPE `ONLINE SALE`) and stock recorded in the admin panel are added to the bottom of Stock In / Stock Out. |

The sheet is the source of truth for stock: after each sync every size's stock
equals the sheet's balance (in − out).

## Setup (one time)

**1. Website secret.** In Vercel → Project → Settings → Environment Variables,
add `SHEETS_SYNC_SECRET` (Production) with a long random value, e.g. the output
of `openssl rand -hex 32`, then redeploy.

**2. Paste the script.** In the sheet: **Extensions → Apps Script**. Replace
everything in `Code.gs` with [Code.gs](Code.gs) and click **Save**.

**3. Script properties.** In the Apps Script editor: **Project Settings** (gear
icon) → **Script properties** → add:

| Property | Value |
|---|---|
| `SITE_URL` | `https://www.richgcollection.com` |
| `SYNC_SECRET` | the same value as `SHEETS_SYNC_SECRET` |

**4. First run.** Back in the editor, pick `syncNowFromMenu` in the function
dropdown and click **Run**. Google asks you to authorise the script (it needs
to edit this spreadsheet and call the website): choose your account →
*Advanced* → *Go to … (unsafe)* → *Allow*. This is your own script, so the
"unverified" warning is expected.

The first run links every row: a **SITE ID** column appears at the right of
Stock In and Stock Out and fills in.

**5. Automatic sync.** Reload the sheet. A **Rich G Sync** menu appears; choose
**Turn on automatic sync (every 10 min)**.

## Day to day

- Keep entering rows exactly as before. They reach the website within 10
  minutes, or straight away with **Rich G Sync → Sync now**.
- Editing a row (size, quantity, price, date, customer) updates the same entry
  on the website; it never creates a duplicate.
- **Don't type in, copy or paste SITE ID cells.** When copying a row to start a
  new one, clear its SITE ID.
- Deleting a row doesn't delete anything on the website; the entry is flagged
  under **Inventory → Needs review** and stock follows the sheet.
- The result of the last sync is shown on the admin **Inventory** page and in a
  note on cell A1 of **Stock Out**.

## Safety guard

If a sync would leave more than 10 website entries without a sheet row at once
(e.g. a block of rows deleted by accident), nothing is changed and the status
shows **On hold**. Restore the rows (File → Version history) and sync again. If
the deletion was intentional, run the sync once from the command line with
`--force` (see below).

## Known limits

- Products not on the website (currently Navy Blue Round Neck T-Shirt) are
  skipped. Add the product on the site, then remove it from `SKIP_PRODUCTS` in
  `src/lib/stock-tracker/mapping.ts`.
- If an online order is cancelled after it reached the sheet, delete its row in
  the sheet; the sync reports it until you do.
- Discounts on website sales are written to the sheet as a lower PRICE PER
  UNIT; the PROFIT sheet is not written to.

## Command line

For a one-off sync from a downloaded `.xlsx` (e.g. to preview changes):

```
npx tsx scripts/sync-stock-tracker.ts "C:\path\to\export.xlsx"            # preview
npx tsx scripts/sync-stock-tracker.ts "C:\path\to\export.xlsx" --apply    # write
```

Rows in an export carry their SITE IDs, so this follows the same rules as the
automatic sync.
