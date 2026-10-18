import type { Analytics } from '@/lib/analytics'
import { formatKes } from '@/lib/money'
import { DEFAULT_LOW_STOCK_THRESHOLD } from '@/lib/inventory'

/*
 * Plain-language copy for every "Details" panel on Admin > Analytics (except
 * Open carts, which shows the shoppers themselves). Each entry has two parts:
 *   meaning — what the figure tells the owner about the business
 *   how     — exactly how it is worked out (keep in step with src/lib/analytics.ts)
 * Edit the wording here; the page just looks entries up by key.
 */

export type Explanation = { meaning: string; how: string }

const n0 = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 })
const n1 = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 })

// Shared phrases, so the rules read the same everywhere.
const SALES = 'Only stock-ledger lines marked "Online sale" (paid website orders) or "Manual sale" (sales you record by hand or import) count as sales.'
const LINE_VALUE = 'Each sale line is worth price × quantity minus any discount on that line; delivery fees are not included.'
const COST = "Cost uses the cost price saved on each line when it was recorded, or the product's current cost price if none was saved (blank counts as zero)."
const BUYER = 'A buyer is the name recorded on the sale, or the email on the online order; sales with neither are left out.'
const COVER = 'Days of cover = stock on hand now ÷ (units sold in the period ÷ days in the period).'
const STOCK_NOW = 'Stock is counted as it is right now, across every size and variant, not as it was during the period.'
const GIVEAWAY = 'Stock taken out as Influencer, Reward, Damage or Adjustment, valued at cost.'

export function buildExplanations(a: Analytics) {
  const k = a.kpis
  const inv = a.inventory
  const cal = a.range.calendar
  const period = cal ? `in ${a.range.label}` : a.range.key === 'all' ? 'since your first stock record' : `in the last ${a.range.label}`
  const periodRule = cal
    ? `The period is ${a.range.label} (Kenya time), up to today if it is still running.`
    : a.range.key === 'all'
      ? 'The period runs from your first stock record to the end of today (Kenya time).'
      : `The period is the last ${a.range.days} days up to the end of today (Kenya time).`
  const compare = a.range.comparisonLabel ? ` The ▲/▼ change compares it with ${a.range.comparisonLabel}.` : ''
  const grouping = { day: 'day', week: 'week (Monday to Sunday)', month: 'calendar month' }[a.granularity]
  const best = a.products.find((p) => p.revenueKes > 0)
  const onlineKes = a.series.reduce((s, b) => s + b.onlineRevenueKes, 0)
  const crm = a.customerSources.reduce((s, x) => s + x.value, 0)

  return {
    // ---------------------------------------------------------------- KPI tiles
    revenue: {
      meaning: `You took in ${formatKes(k.revenueKes)} from sales ${period}, about ${formatKes(k.revenueKes / a.range.days)} a day.`,
      how: `${SALES} ${LINE_VALUE} Revenue is the total of those lines. ${periodRule}${compare}`,
    },
    profit: {
      meaning: `After paying for the stock you sold, ${formatKes(k.profitKes)} was left over ${period}, so you keep about ${n0.format(k.marginPct)} shillings of every 100 you sell.`,
      how: `Gross profit = revenue − cost of the units sold. ${COST} Margin = profit ÷ revenue. Rent, delivery and other running costs are not taken off.`,
    },
    unitsSold: {
      meaning: `You sold ${n0.format(k.unitsSold)} items ${period}, around ${n1.format((k.unitsSold / a.range.days) * 7)} a week.`,
      how: `The quantities on every online and manual sale line, added up. Giveaways and write-offs are not counted. Per week = units ÷ days in the period × 7.`,
    },
    transactions: {
      meaning: `You made ${n0.format(k.transactions)} separate sales ${period}. Several items bought by one person on one day count as one sale.`,
      how: 'Sale lines are grouped by buyer (the name on the sale, or the online order email) and by Kenya calendar day; each group is one sale. A line with no buyer recorded counts as a sale on its own.',
    },
    avgSale: {
      meaning: `The typical customer spends about ${formatKes(k.avgSaleKes)} each time they buy.`,
      how: 'Average sale value = revenue ÷ number of sales (baskets), using the same rules as the Revenue and Sales tiles, so discounts are already taken off.',
    },
    avgUnitPrice: {
      meaning: `On average each item went for ${formatKes(k.avgUnitPriceKes)}. If this drops, you are discounting more or selling cheaper items.`,
      how: 'Average price per unit = revenue ÷ units sold. Because revenue is after line discounts, this is the price actually received, not the list price.',
    },
    buyers: {
      meaning: `${n0.format(k.buyers)} different people bought from you ${period}: ${n0.format(a.buyerMix.newBuyers)} for the first time and ${n0.format(a.buyerMix.returningBuyers)} who had bought before.`,
      how: `Counts each distinct buyer once (names and emails matched ignoring capitals). ${BUYER} "Returning" means they also have a sale recorded before this period started.`,
    },
    restockSpend: {
      meaning: `You spent ${formatKes(k.restockSpendKes)} buying in ${n0.format(k.unitsIn)} units of new stock ${period}.`,
      how: 'Every stock-in (restock) line in the period: units received × the unit cost entered on that restock. Restocks entered without a unit cost add units but no spend.',
    },
    stockValue: {
      meaning: `The stock on your shelves right now cost you ${formatKes(inv.costValueKes)}, and would bring in about ${formatKes(inv.retailValueKes)} if it all sold at today's prices.`,
      how: `${STOCK_NOW} At cost = units × the product's cost price. At retail = units × the variant's sale or normal price, falling back to the product's price. Negative stock counts as zero.`,
    },
    giveaways: {
      meaning: `${n0.format(k.giveawayUnits)} items left your stock without being sold ${period}, which cost you ${formatKes(k.giveawayCostKes)} to buy.`,
      how: `${GIVEAWAY} ${COST}`,
    },

    // ---------------------------------------------------------------- sales over time
    revenueProfitChart: {
      meaning: 'Shows whether sales and profit are growing, flat or falling over time. A widening gap between the two lines means you are keeping more of each sale.',
      how: `Revenue and gross profit (as in the tiles above) added up for each ${grouping}, Kenya time. ${SALES}`,
    },
    unitsChart: {
      meaning: `How many items you sold each ${a.granularity}, so you can spot busy and quiet spells.`,
      how: `Quantities on online and manual sale lines, added up per ${grouping}. The busiest bar is labelled.`,
    },
    cumulativeChart: {
      meaning: `Your sales total building up through the period, ending at ${formatKes(k.revenueKes)}. Steep parts are when money came in fastest.`,
      how: `Each point is the revenue of that ${a.granularity} plus all earlier ones in the period.`,
    },
    channelChart: {
      meaning: `How much of your money comes from the website versus sales you record yourself. ${k.revenueKes > 0 ? `Online made up ${n0.format((onlineKes / k.revenueKes) * 100)}% of revenue ${period}.` : ''}`.trim(),
      how: `"Online sale" lines are written automatically when a website order is paid; "Manual sale" lines are ones you enter or import. ${LINE_VALUE}`,
    },
    salesBuyersChart: {
      meaning: 'Whether you are getting more sales from the same people or reaching more people. When the lines are close, most customers buy once per period.',
      how: `For each ${a.granularity}: sales = buyer-and-day groups (as in the Sales tile); buyers = distinct named buyers. ${BUYER}`,
    },

    // ---------------------------------------------------------------- stock flow
    flowChart: {
      meaning: 'Whether you are bringing in more stock than goes out. Bars above the line are deliveries; bars below are stock leaving, coloured by why it left.',
      how: `Above: units on stock-in (restock) lines. Below: units on every stock-out line, split by reason (sale, influencer, reward, damage, adjustment), per ${grouping}.`,
    },
    whereStockWent: {
      meaning: 'Of everything that left your stock this period, how much was sold and how much was given away or written off.',
      how: 'All stock-out lines in the period, with their units added up by the reason they were recorded under.',
    },

    // ---------------------------------------------------------------- velocity
    speed: {
      meaning: 'Sorts your products by how quickly they sell compared with how much you hold, so you know what to reorder and what to push.',
      how: `${COVER} Fast = up to 30 days, Steady = 30–90 days, Slow = over 90 days. "Sold out" sold this period but has no stock; "Not moving" had no sales this period.`,
    },
    cover: {
      meaning: 'How long your current stock of each product would last if it keeps selling at this period\'s pace.',
      how: `${COVER} Products are counted into bands; "No sales" means stock on hand but nothing sold this period. ${STOCK_NOW}`,
    },
    sellThrough: {
      meaning: 'The share of each product you managed to sell out of what you had available. High means it sells well; low means stock is sitting.',
      how: 'Sell-through = units sold in the period ÷ (units sold + units in stock now). The chart shows the 7 highest.',
    },
    scatter: {
      meaning: 'Each dot is a product. High and to the left = lots of stock that barely sells; low and to the right = selling fast with little left.',
      how: `Across: units sold ÷ days in the period × 7 (units per week). Up: units in stock now. The two guide lines mark the middle (median) product on each axis.`,
    },
    topRevenue: {
      meaning: best ? `The products bringing in the most money. ${best.name} leads with ${formatKes(best.revenueKes)}.` : 'The products bringing in the most money.',
      how: `The 10 products with the highest revenue in the period (after line discounts). The grey number is units sold.`,
    },
    topUnits: {
      meaning: 'The products customers pick up most often, whatever their price.',
      how: 'The 10 products with the most units sold in the period. The grey number is units per week (units ÷ days × 7).',
    },
    stuck: {
      meaning: 'Money tied up in products that are selling slowly or not at all. Consider promoting, bundling or discounting these.',
      how: 'Products classed Slow (over 90 days of cover) or Not moving that still have stock, ranked by units in stock × cost price. Top 10 shown.',
    },
    velocityTable: {
      meaning: 'Every product in one list, with how fast it sells, how much is left and how long that will last.',
      how: `${COVER} Per week = units sold ÷ days × 7. Trend compares units sold in the second half of the period with the first half. Sell-through = sold ÷ (sold + in stock).`,
    },

    // ---------------------------------------------------------------- mix
    category: {
      meaning: 'Which kinds of products earn you the most, and which are the most profitable.',
      how: "Each product's revenue and gross profit go to one category: its first sub-category, otherwise its first category, otherwise Uncategorized. So nothing is counted twice.",
    },
    size: {
      meaning: 'Which sizes sell most, so you can order the right size mix next time.',
      how: 'Units sold, added up by the value of the variant option whose name contains "size". Sales of products without a size option are left out.',
    },
    weekday: {
      meaning: 'Which days of the week customers tend to buy, useful for timing posts, promotions and staff.',
      how: 'Revenue from online and manual sales, added up by the Kenya-time day of the week it was recorded, across the whole period.',
    },
    calendar: {
      meaning: 'A day-by-day picture of when you sold. Gaps show days with no sales; darker squares are your busiest days.',
      how: 'Units sold each Kenya-time day. Shades split selling days into four equal groups from quietest to busiest. Hover a square for its revenue.',
    },

    // ---------------------------------------------------------------- customers
    topBuyers: {
      meaning: 'Your most valuable customers this period. Worth thanking or rewarding.',
      how: `Revenue added up per buyer, top 10 shown; the grey number is units bought. ${BUYER}`,
    },
    buyerMix: {
      meaning: `Whether you are winning new customers or relying on people who already know you. ${n0.format(a.buyerMix.repeatWithinRange)} bought on more than one day ${period}.`,
      how: `${BUYER} "Returning" = they also have a sale recorded before this period began; everyone else is "new".`,
    },
    sources: {
      meaning: `Where your ${n0.format(crm)} customers came from, so you know which channels bring people in.`,
      how: 'Every customer in your customer list (all time, not just this period), counted by the source saved on their record.',
    },
    locations: {
      meaning: 'Where your customers are based, which helps plan delivery and local promotions.',
      how: 'Every customer in your customer list (all time), counted by the location saved on their record. Blank locations are left out; the top 10 are shown.',
    },
    orders: {
      meaning: `Website orders placed ${period} and how far along they are. ${n0.format(a.orderTotals.paidCount)} of ${n0.format(a.orderTotals.count)} were paid, worth ${formatKes(a.orderTotals.paidRevenueKes)}.`,
      how: 'Orders created in the period, counted by their status. Paid value is the order totals (including delivery) of orders marked paid, so it can differ from online revenue.',
    },

    // ---------------------------------------------------------------- inventory health
    stockStatus: {
      meaning: `Of your ${n0.format(inv.skus)} product sizes and variants, ${n0.format(inv.outOfStockSkus)} are sold out and ${n0.format(inv.lowStockSkus)} are running low.`,
      how: `Each variant (or product with no variants) is one SKU. Out = 0 in stock. Low = at or below the product's low-stock level (${DEFAULT_LOW_STOCK_THRESHOLD} if not set). ${STOCK_NOW}`,
    },
    stockValueCard: {
      meaning: `What your current stock is worth: ${formatKes(inv.costValueKes)} to buy, ${formatKes(inv.retailValueKes)} to sell, leaving about ${formatKes(inv.retailValueKes - inv.costValueKes)} profit if it all sells at today's prices.`,
      how: `At cost = units × product cost price. At retail = units × the variant's sale or normal price (falling back to the product's). Potential profit = retail − cost. ${STOCK_NOW}`,
    },
    restockSoon: {
      meaning: 'Products to reorder now before you lose sales.',
      how: `Products that sold this period but have no stock left, plus products with under 21 days of cover. ${COVER}`,
    },

    // ---------------------------------------------------------------- insights
    insightRevenue: {
      meaning: 'Tells you whether this period is going better or worse than the one before it.',
      how: `Change = (this period's revenue − earlier revenue) ÷ earlier revenue, where the earlier period is ${a.range.comparisonLabel || 'the stretch just before this one'}. Revenue follows the same rules as the Revenue tile.`,
    },
    insightBestSeller: {
      meaning: 'Your single biggest earner this period. Keep it in stock.',
      how: 'The product with the highest revenue in the period (after line discounts). "A week" = units sold ÷ days in the period × 7.',
    },
    insightPareto: {
      meaning: 'A small group of products usually brings in most of your money. These are the ones to never run out of.',
      how: 'Products that sold are ranked by revenue and counted from the top until their combined revenue reaches 80% of the total.',
    },
    insightSoldOut: {
      meaning: 'These sold this period but you have none left, so you may be missing sales right now.',
      how: 'Products with at least one sale in the period and 0 units in stock now (across all variants).',
    },
    insightRunningLow: {
      meaning: 'These will sell out within about three weeks if they keep selling at the same speed.',
      how: `Products with stock on hand and under 21 days of cover. ${COVER}`,
    },
    insightDeadStock: {
      meaning: 'Cash sitting on the shelf in products nobody bought this period.',
      how: "Products with no sales in the period: units in stock now × the product's cost price, added up.",
    },
    insightGaining: {
      meaning: 'This product is picking up speed. Make sure you have enough stock.',
      how: 'For products with at least 3 units sold: units sold in the second half of the period compared with the first half. If the first half had none, it shows as +100%.',
    },
    insightGiveaways: {
      meaning: 'What it cost you in stock to give items away or write them off.',
      how: `${GIVEAWAY} ${COST}`,
    },
  } satisfies Record<string, Explanation>
}

export type ExplanationKey = keyof ReturnType<typeof buildExplanations>
