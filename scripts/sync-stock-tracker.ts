/**
 * Syncs the site with an exported copy of the "RICH G COLLECTION - STOCK
 * TRACKER" workbook. The Google Sheet normally syncs itself through its Apps
 * Script (integrations/google-sheets); use this for a one-off from an .xlsx.
 *
 *   npx tsx scripts/sync-stock-tracker.ts "<export>.xlsx" [--apply] [--force]
 *
 * Dry run by default. --force applies even when the safety guard holds the
 * sync (many site entries missing from the sheet). The rules live in
 * src/lib/stock-tracker/sync.ts.
 */
import 'dotenv/config'
import ExcelJS from 'exceljs'
import { prisma } from '../src/lib/prisma'
import { SHEET_NAMES } from '../src/lib/stock-tracker/mapping'
import { formatReport, planSync, runSheetSync, type SheetData, type SheetRow } from '../src/lib/stock-tracker/sync'

const [xlsxPath, ...flags] = process.argv.slice(2)
const APPLY = flags.includes('--apply')
const FORCE = flags.includes('--force')
if (!xlsxPath) throw new Error('Usage: sync-stock-tracker.ts <export.xlsx> [--apply] [--force]')

function cellValue(v: ExcelJS.CellValue): string | number | boolean | null {
  if (v == null) return null
  // Excel dates are stored as local calendar dates at UTC midnight.
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue)
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String(v.text)
    if ('error' in v) return null
  }
  return v as string | number | boolean
}

async function readSheets(path: string): Promise<SheetData> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const out: SheetData = {}
  for (const name of Object.values(SHEET_NAMES)) {
    const ws = wb.getWorksheet(name)
    if (!ws) throw new Error(`Sheet "${name}" not found in ${path}`)
    let header: string[] | null = null
    const rows: SheetRow[] = []
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue)
      if (!header) {
        if (values.filter((c) => c != null && String(c).trim()).length >= 3) header = values.map((c) => (c == null ? '' : String(c).trim()))
        return
      }
      const r = { _row: rowNumber } as SheetRow
      header.forEach((k, i) => { if (k) r[k] = values[i] ?? null })
      rows.push(r)
    })
    out[name] = rows
  }
  return out
}

async function main() {
  const sheets = await readSheets(xlsxPath)
  if (!APPLY) {
    const plan = await planSync(sheets)
    console.log(`\n=== STOCK TRACKER SYNC (dry run)\n${formatReport(plan)}`)
    return
  }
  const result = await runSheetSync(sheets, { source: 'cli', force: FORCE })
  console.log(`\n=== STOCK TRACKER SYNC (apply)\n${formatReport(result.plan)}\n\n${result.status}: ${result.message}`)
}

main().finally(() => prisma.$disconnect())
