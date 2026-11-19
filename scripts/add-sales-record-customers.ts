/**
 * Adds a customer profile for every buyer on manual sales who has no customer
 * record (see src/lib/stock-tracker/customers.ts). The sheet sync runs this
 * automatically; this script is for running it by hand.
 *
 *   npx tsx scripts/add-sales-record-customers.ts [--apply]
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { addSalesRecordCustomers } from '../src/lib/stock-tracker/customers'
import { fmtDate } from '../src/lib/stock-tracker/mapping'

const APPLY = process.argv.includes('--apply')

async function main() {
  const plan = await addSalesRecordCustomers({ apply: APPLY })
  console.log(`${plan.length} buyers on sales records have no customer profile${APPLY ? '' : ' (dry run — pass --apply to write)'}:\n`)
  for (const b of plan)
    console.log(`  ${b.name.padEnd(28)} KES ${String(b.spendKes).padStart(7)}  ${b.units} units, ${b.visits} visit(s), last ${fmtDate(b.last)}`)
  if (APPLY && plan.length) console.log(`\nAdded ${plan.length} customers.`)
}

main().finally(() => prisma.$disconnect())
