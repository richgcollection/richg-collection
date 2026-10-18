import Link from 'next/link'
import { formatKes } from '@/lib/money'
import {
  DEFAULT_RANGE,
  getAnalytics,
  RANGE_PRESETS,
  type Granularity,
  type OpenCart,
  type RangeKey,
} from '@/lib/analytics'
import {
  CalendarHeatmap,
  ChartCard,
  ColumnChart,
  DonutChart,
  HBarChart,
  LineChart,
  Meter,
  ScatterChart,
  StatTile,
} from '@/components/admin/analytics/charts'
import { VelocityTable } from '@/components/admin/analytics/VelocityTable'
import { PeriodSelect } from '@/components/admin/analytics/PeriodSelect'
import { CLASS_META, VIZ } from '@/components/admin/analytics/tokens'
import { DisclosureRow } from '@/components/admin/analytics/Disclosure'
import { Explain, Fig, FigGrid, MiniTable, Muted } from '@/components/admin/analytics/details'
import { buildExplanations } from '@/components/admin/analytics/explanations'

export const dynamic = 'force-dynamic'

const GRANULARITIES: Array<{ value: Granularity; label: string }> = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

/**
 * Colors follow the entity across every chart on the page, so "Influencer"
 * is the same hue in the stock-flow bars and in the donut.
 */
const FLOW_COLORS: Record<string, string> = {
  Restock: VIZ[0],
  'Online sale': VIZ[1],
  'Manual sale': VIZ[2],
  Influencer: VIZ[3],
  Reward: VIZ[4],
  Damage: VIZ[5],
  Adjustment: VIZ[6],
}

const n0 = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 })
const n1 = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 })

function delta(cur: number, prev: number | undefined): number | null {
  if (prev === undefined || prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' })
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; g?: string; year?: string; month?: string }>
}) {
  const { range, g, year, month } = await searchParams
  const rangeKey: RangeKey = range && range in RANGE_PRESETS ? (range as RangeKey) : DEFAULT_RANGE
  const granularity = GRANULARITIES.some((x) => x.value === g) ? (g as Granularity) : undefined
  const yearNum = /^\d{4}$/.test(year ?? '') ? Number(year) : undefined
  const monthNum = yearNum && /^(0?[1-9]|1[0-2])$/.test(month ?? '') ? Number(month) : undefined

  const a = await getAnalytics({ range: rangeKey, granularity, year: yearNum, month: monthNum })
  const { kpis, prevKpis: prev, series } = a
  const labels = series.map((b) => b.label)
  const cal = a.range.calendar
  /** Picking a rolling range clears the year/month (set by PeriodSelect); otherwise they are kept. */
  const href = (next: { range?: string; g?: string }) => {
    const p = new URLSearchParams()
    if (!next.range && cal) {
      p.set('year', String(cal.year))
      if (cal.month) p.set('month', String(cal.month))
    } else {
      const r = next.range ?? rangeKey
      if (r !== DEFAULT_RANGE) p.set('range', r)
    }
    const gg = 'g' in next ? next.g : granularity
    if (gg) p.set('g', gg)
    const s = p.toString()
    return `/admin/analytics${s ? `?${s}` : ''}`
  }


  const lastSaleDay = [...a.daily].reverse().find((d) => d.units > 0)?.date
  const periodWord = { day: 'day', week: 'week', month: 'month' }[a.granularity]

  // ---- derived series
  const cumulative: number[] = []
  for (const b of series) cumulative.push((cumulative.at(-1) ?? 0) + b.revenueKes)
  const flowSeries = [
    { key: 'in', label: 'Restock', color: FLOW_COLORS.Restock, values: series.map((b) => b.unitsIn) },
    ...a.reasonKeys.map((r) => ({
      key: r,
      label: r,
      color: FLOW_COLORS[r] ?? VIZ[7],
      values: series.map((b) => -(b.unitsOutByReason[r] ?? 0)),
    })),
  ]
  const velocityCounts = (Object.keys(CLASS_META) as Array<keyof typeof CLASS_META>)
    .map((k) => ({ key: k, name: CLASS_META[k].label, value: a.products.filter((p) => p.velocityClass === k).length }))
    .filter((x) => x.value > 0)
  const topByRevenue = a.products.filter((p) => p.revenueKes > 0).slice(0, 10)
  const topByUnits = [...a.products].filter((p) => p.unitsSold > 0).sort((x, y) => y.unitsSold - x.unitsSold).slice(0, 10)
  const stuck = a.products
    .filter((p) => (p.velocityClass === 'dead' || p.velocityClass === 'slow') && p.stockQty > 0)
    .sort((x, y) => y.stockCostKes - x.stockCostKes)
    .slice(0, 10)
  const risers = a.products.filter((p) => p.trendPct !== null && p.unitsSold >= 3).sort((x, y) => (y.trendPct ?? 0) - (x.trendPct ?? 0))
  const soldOutSelling = a.products.filter((p) => p.velocityClass === 'stockout')
  const runningLow = a.products
    .filter((p) => p.daysOfCover !== null && p.daysOfCover < 21 && p.stockQty > 0)
    .sort((x, y) => (x.daysOfCover ?? 0) - (y.daysOfCover ?? 0))

  const restockList = [...soldOutSelling, ...runningLow]
  const carts = a.openCarts.carts
  const signedInCarts = carts.filter((c) => c.user).length
  const anonymousCarts = carts.filter((c) => !c.user && !c.email).length

  // ---- plain-language "Details" panels (copy lives in explanations.ts)
  const ex = buildExplanations(a)
  const explain = (key: keyof typeof ex) => <Explain e={ex[key]} />

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------------- header + filters */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics &amp; Insights</h1>
            <p className="mt-1 text-sm text-[var(--viz-ink-2)]">
              {cal && <span className="font-medium text-foreground">{a.range.label} · </span>}
              {new Date(a.range.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} –{' '}
              {new Date(new Date(a.range.to).getTime() - 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}
              {a.range.days} days
              {lastSaleDay && (
                <>
                  {' · '}last sale recorded{' '}
                  {new Date(`${lastSaleDay}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(Object.entries(RANGE_PRESETS) as Array<[RangeKey, (typeof RANGE_PRESETS)[RangeKey]]>).map(([key, p]) => (
            <Pill key={key} href={href({ range: key })} active={!cal && rangeKey === key}>
              {p.label}
            </Pill>
          ))}
          <span className="mx-2 h-5 w-px bg-black/10 dark:bg-white/10" aria-hidden />
          <PeriodSelect
            years={a.availableYears}
            year={cal?.year ?? null}
            month={cal?.month ?? null}
            months={cal?.months ?? []}
          />
          <span className="mx-2 h-5 w-px bg-black/10 dark:bg-white/10" aria-hidden />
          <Pill href={href({ g: undefined })} active={!granularity}>
            Auto
          </Pill>
          {GRANULARITIES.map((x) => (
            <Pill key={x.value} href={href({ g: x.value })} active={granularity === x.value}>
              {x.label}
            </Pill>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- insights */}
      <Insights
        items={[
          kpis.revenueKes > 0 &&
            prev &&
            prev.revenueKes > 0 && {
              tone: kpis.revenueKes >= prev.revenueKes ? 'good' : 'bad',
              text: `Revenue is ${kpis.revenueKes >= prev.revenueKes ? 'up' : 'down'} ${Math.abs(delta(kpis.revenueKes, prev.revenueKes) ?? 0).toFixed(0)}% on ${a.range.comparisonLabel} (${formatKes(prev.revenueKes)} → ${formatKes(kpis.revenueKes)}).`,
              details: explain('insightRevenue'),
            },
          topByRevenue[0] && {
            tone: 'info',
            text: `Best seller: ${topByRevenue[0].name}, with ${formatKes(topByRevenue[0].revenueKes)} from ${topByRevenue[0].unitsSold} units (${topByRevenue[0].unitsPerWeek.toFixed(1)} a week).`,
            details: explain('insightBestSeller'),
          },
          a.pareto.totalProductsSold > 0 && {
            tone: 'info',
            text: `${a.pareto.productsFor80Pct} of ${a.pareto.totalProductsSold} selling products bring in 80% of revenue.`,
            details: explain('insightPareto'),
          },
          soldOutSelling.length > 0 && {
            tone: 'bad',
            text: `${soldOutSelling.length} product${soldOutSelling.length > 1 ? 's are' : ' is'} selling but fully out of stock: ${soldOutSelling.slice(0, 3).map((p) => p.name).join(', ')}${soldOutSelling.length > 3 ? '…' : ''}.`,
            details: explain('insightSoldOut'),
          },
          runningLow.length > 0 && {
            tone: 'warn',
            text: `${runningLow.length} product${runningLow.length > 1 ? 's' : ''} will run out within 3 weeks at the current pace: ${runningLow.slice(0, 3).map((p) => `${p.name} (${Math.round(p.daysOfCover ?? 0)} d)`).join(', ')}.`,
            details: explain('insightRunningLow'),
          },
          a.inventory.deadStockCostKes > 0 && {
            tone: 'warn',
            text: `${formatKes(a.inventory.deadStockCostKes)} of stock (at cost) sits in products that haven't sold in this period.`,
            details: explain('insightDeadStock'),
          },
          risers[0] &&
            (risers[0].trendPct ?? 0) > 0 && {
              tone: 'good',
              text: `Gaining pace: ${risers[0].name}, with ${Math.round(risers[0].trendPct ?? 0)}% more units sold in the second half of the period than the first.`,
              details: explain('insightGaining'),
            },
          kpis.giveawayUnits > 0 && {
            tone: 'info',
            text: `${kpis.giveawayUnits} units went to influencers, rewards or write-offs, costing ${formatKes(kpis.giveawayCostKes)} at cost price.`,
            details: explain('insightGiveaways'),
          },
        ]}
      />

      {/* ---------------------------------------------------------------- KPI tiles */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-4">
        <StatTile
          hero
          label="Revenue"
          value={formatKes(kpis.revenueKes)}
          deltaPct={delta(kpis.revenueKes, prev?.revenueKes)}
          spark={series.map((b) => b.revenueKes)}
          hint={`Online + manual sales · ${formatKes(kpis.revenueKes / a.range.days)} a day on average`}
        >
          {explain('revenue')}
        </StatTile>
        <StatTile
          label="Gross profit"
          value={formatKes(kpis.profitKes)}
          deltaPct={delta(kpis.profitKes, prev?.profitKes)}
          spark={series.map((b) => b.profitKes)}
          hint={`${n1.format(kpis.marginPct)}% margin`}
        >
          {explain('profit')}
        </StatTile>
        <StatTile
          label="Units sold"
          value={n0.format(kpis.unitsSold)}
          deltaPct={delta(kpis.unitsSold, prev?.unitsSold)}
          spark={series.map((b) => b.unitsSold)}
          hint={`${n1.format((kpis.unitsSold / a.range.days) * 7)} a week`}
        >
          {explain('unitsSold')}
        </StatTile>
        <StatTile
          label="Sales (baskets)"
          value={n0.format(kpis.transactions)}
          deltaPct={delta(kpis.transactions, prev?.transactions)}
          spark={series.map((b) => b.transactions)}
          hint="One buyer on one day = one sale"
        >
          {explain('transactions')}
        </StatTile>
        <StatTile
          label="Average sale value"
          value={formatKes(kpis.avgSaleKes)}
          deltaPct={delta(kpis.avgSaleKes, prev?.avgSaleKes)}
          hint={`${n1.format(kpis.transactions ? kpis.unitsSold / kpis.transactions : 0)} units per sale`}
        >
          {explain('avgSale')}
        </StatTile>
        <StatTile
          label="Average price per unit"
          value={formatKes(kpis.avgUnitPriceKes)}
          deltaPct={delta(kpis.avgUnitPriceKes, prev?.avgUnitPriceKes)}
        >
          {explain('avgUnitPrice')}
        </StatTile>
        <StatTile
          label="Buyers"
          value={n0.format(kpis.buyers)}
          deltaPct={delta(kpis.buyers, prev?.buyers)}
          spark={series.map((b) => b.buyers)}
          hint={`${a.buyerMix.newBuyers} new · ${a.buyerMix.returningBuyers} returning`}
        >
          {explain('buyers')}
        </StatTile>
        <StatTile
          label="Restock spend"
          value={formatKes(kpis.restockSpendKes)}
          deltaPct={delta(kpis.restockSpendKes, prev?.restockSpendKes)}
          upIsGood={false}
          spark={series.map((b) => b.restockSpendKes)}
          hint={`${n0.format(kpis.unitsIn)} units received`}
        >
          {explain('restockSpend')}
        </StatTile>
        <StatTile
          label="Stock on hand (at cost)"
          value={formatKes(a.inventory.costValueKes)}
          hint={`${n0.format(a.inventory.units)} units · ${formatKes(a.inventory.retailValueKes)} at retail`}
        >
          {explain('stockValue')}
        </StatTile>
        <StatTile
          label="Giveaways & write-offs"
          value={formatKes(kpis.giveawayCostKes)}
          deltaPct={delta(kpis.giveawayCostKes, prev?.giveawayCostKes)}
          upIsGood={false}
          hint={`${n0.format(kpis.giveawayUnits)} units at cost`}
        >
          {explain('giveaways')}
        </StatTile>

        <StatTile
          wideDetails
          label="Open carts"
          value={formatKes(a.openCarts.valueKes)}
          hint={`${a.openCarts.count} carts · ${a.openCarts.units} units not yet checked out`}
        >
          <div className="space-y-5">
            <FigGrid>
              <Fig label="Open carts" value={n0.format(a.openCarts.count)} />
              <Fig label="Units waiting" value={n0.format(a.openCarts.units)} />
              <Fig label="Average cart" value={formatKes(a.openCarts.count ? a.openCarts.valueKes / a.openCarts.count : 0)} />
              <Fig label="Signed-in shoppers" value={n0.format(signedInCarts)} />
              <Fig label="Guests with email" value={n0.format(a.openCarts.count - signedInCarts - anonymousCarts)} />
              <Fig label="Anonymous guests" value={n0.format(anonymousCarts)} />
            </FigGrid>
            <CartList carts={carts} />
          </div>
        </StatTile>
      </div>

      {/* ---------------------------------------------------------------- money over time */}
      <SectionTitle title="Sales over time" subtitle={`Grouped by ${periodWord}`} />
      <ChartCard
        title="Revenue and gross profit"
        subtitle={`Per ${periodWord}. Hover for exact values.`}
        legend={[
          { label: 'Revenue', color: VIZ[0], shape: 'line' },
          { label: 'Gross profit', color: VIZ[1], shape: 'line' },
        ]}
        table={{
          columns: ['Period', 'Revenue', 'Cost', 'Profit', 'Margin', 'Units', 'Sales'],
          rows: series.map((b) => [
            b.label,
            formatKes(b.revenueKes),
            formatKes(b.costKes),
            formatKes(b.profitKes),
            b.revenueKes ? `${n1.format((b.profitKes / b.revenueKes) * 100)}%` : '—',
            b.unitsSold,
            b.transactions,
          ]),
        }}
        details={explain('revenueProfitChart')}
      >
        <LineChart
          area
          labels={labels}
          format="kes"
          height={260}
          series={[
            { key: 'rev', label: 'Revenue', color: VIZ[0], values: series.map((b) => b.revenueKes) },
            { key: 'profit', label: 'Gross profit', color: VIZ[1], values: series.map((b) => b.profitKes) },
          ]}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Units sold"
          subtitle={`Per ${periodWord} · busiest ${periodWord} labeled`}
          table={{ columns: ['Period', 'Units'], rows: series.map((b) => [b.label, b.unitsSold]) }}
          details={explain('unitsChart')}
        >
          <ColumnChart showTotals labels={labels} format="units" series={[{ key: 'u', label: 'Units sold', color: VIZ[0], values: series.map((b) => b.unitsSold) }]} />
        </ChartCard>
        <ChartCard
          title="Cumulative revenue"
          subtitle="Running total across the period. Steeper means faster selling."
          table={{ columns: ['Period', 'Running total'], rows: series.map((b, i) => [b.label, formatKes(cumulative[i])]) }}
          details={explain('cumulativeChart')}
        >
          <LineChart area labels={labels} format="kes" series={[{ key: 'cum', label: 'Running total', color: VIZ[0], values: cumulative }]} />
        </ChartCard>
        <ChartCard
          title="Revenue by channel"
          subtitle="Online store checkouts vs sales recorded manually"
          legend={[
            { label: 'Online sale', color: FLOW_COLORS['Online sale'] },
            { label: 'Manual sale', color: FLOW_COLORS['Manual sale'] },
          ]}
          table={{
            columns: ['Period', 'Online', 'Manual'],
            rows: series.map((b) => [b.label, formatKes(b.onlineRevenueKes), formatKes(b.manualRevenueKes)]),
          }}
          details={explain('channelChart')}
        >
          <ColumnChart
            labels={labels}
            format="kes"
            series={[
              { key: 'm', label: 'Manual sale', color: FLOW_COLORS['Manual sale'], values: series.map((b) => b.manualRevenueKes) },
              { key: 'o', label: 'Online sale', color: FLOW_COLORS['Online sale'], values: series.map((b) => b.onlineRevenueKes) },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Sales and buyers"
          subtitle={`Number of sales (baskets) and distinct buyers per ${periodWord}`}
          legend={[
            { label: 'Sales', color: VIZ[0], shape: 'line' },
            { label: 'Buyers', color: VIZ[1], shape: 'line' },
          ]}
          table={{ columns: ['Period', 'Sales', 'Buyers'], rows: series.map((b) => [b.label, b.transactions, b.buyers]) }}
          details={explain('salesBuyersChart')}
        >
          <LineChart
            labels={labels}
            format="num"
            series={[
              { key: 't', label: 'Sales', color: VIZ[0], values: series.map((b) => b.transactions) },
              { key: 'b', label: 'Buyers', color: VIZ[1], values: series.map((b) => b.buyers) },
            ]}
          />
        </ChartCard>
      </div>

      {/* ---------------------------------------------------------------- stock flow */}
      <SectionTitle title="Stock flow" subtitle="What came in and where it went" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Units in vs units out"
          subtitle="Restocks above the line, stock leaving below it, split by reason"
          legend={flowSeries.map((s) => ({ label: s.label, color: s.color }))}
          table={{
            columns: ['Period', ...flowSeries.map((s) => s.label)],
            rows: series.map((b, i) => [b.label, ...flowSeries.map((s) => Math.abs(s.values[i]))]),
          }}
          details={explain('flowChart')}
        >
          <ColumnChart labels={labels} format="units" height={260} series={flowSeries} />
        </ChartCard>
        <ChartCard
          title="Where stock went"
          subtitle="Units leaving the warehouse, by reason"
          table={{ columns: ['Reason', 'Units'], rows: a.outByReason.map((r) => [r.name, r.value]) }}
          details={explain('whereStockWent')}
        >
          <DonutChart
            items={a.outByReason}
            format="units"
            centerLabel="units out"
            colors={a.outByReason.map((r) => FLOW_COLORS[r.name] ?? VIZ[7])}
          />
        </ChartCard>
      </div>

      {/* ---------------------------------------------------------------- velocity */}
      <SectionTitle
        title="How fast products are moving"
        subtitle="Pace = units sold ÷ days in period. Cover = how many days current stock lasts at that pace."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Products by speed"
          subtitle="Grouped by days of stock cover"
          table={{
            columns: ['Speed', 'Products', 'Meaning'],
            rows: velocityCounts.map((v) => [v.name, v.value, CLASS_META[v.key].hint]),
          }}
          details={explain('speed')}
        >
          <DonutChart
            items={velocityCounts}
            format="num"
            centerLabel="products"
            colors={velocityCounts.map((v) => CLASS_META[v.key].color)}
          />
          <p className="mt-3 text-[11px] text-[var(--viz-muted)]">
            Fast ≤ 30 days of cover · Steady 1–3 months · Slow 3+ months · Not moving = no sales this period.
          </p>
        </ChartCard>
        <ChartCard
          title="Days of stock cover"
          subtitle="Number of products in each band"
          table={{ columns: ['Cover', 'Products'], rows: a.inventory.coverHistogram.map((b) => [b.name, b.value]) }}
          details={explain('cover')}
        >
          <ColumnChart
            labels={a.inventory.coverHistogram.map((b) => b.name)}
            format="num"
            series={[{ key: 'c', label: 'Products', color: VIZ[0], values: a.inventory.coverHistogram.map((b) => b.value) }]}
          />
        </ChartCard>
        <ChartCard
          title="Sell-through"
          subtitle="Share of available units that sold (sold ÷ sold + in stock)"
          table={{
            columns: ['Product', 'Sell-through', 'Sold', 'In stock'],
            rows: a.products
              .filter((p) => p.unitsSold + p.stockQty > 0)
              .sort((x, y) => y.sellThroughPct - x.sellThroughPct)
              .map((p) => [p.name, `${p.sellThroughPct.toFixed(0)}%`, p.unitsSold, p.stockQty]),
          }}
          details={explain('sellThrough')}
        >
          <div className="space-y-3">
            {a.products
              .filter((p) => p.unitsSold + p.stockQty > 0)
              .sort((x, y) => y.sellThroughPct - x.sellThroughPct)
              .slice(0, 7)
              .map((p) => (
                <Meter key={p.productId} label={p.name} value={p.sellThroughPct} max={100} detail={`${p.sellThroughPct.toFixed(0)}%`} />
              ))}
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Selling pace vs stock on hand"
        subtitle="Each dot is a product. Lines mark the median. Top-left is stock that isn't moving; bottom-right is at risk of selling out."
        table={{
          columns: ['Product', 'Units / week', 'In stock', 'Cover (days)'],
          rows: a.products.map((p) => [
            p.name,
            n1.format(p.unitsPerWeek),
            p.stockQty,
            p.daysOfCover === null ? '—' : n0.format(p.daysOfCover),
          ]),
        }}
        details={explain('scatter')}
      >
        <ScatterChart
          height={320}
          xLabel="Units sold per week"
          yLabel="Units in stock"
          xFormat="num"
          yFormat="units"
          points={a.products.map((p) => ({
            x: p.unitsPerWeek,
            y: p.stockQty,
            label: p.name,
            detail:
              p.daysOfCover === null ? 'No sales this period' : `${Math.round(p.daysOfCover)} days of cover · ${CLASS_META[p.velocityClass].label}`,
          }))}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Top sellers by revenue"
          subtitle="Units sold shown in grey"
          details={explain('topRevenue')}
        >
          <HBarChart
            items={topByRevenue.map((p) => ({ name: p.name, value: p.revenueKes, secondary: p.unitsSold }))}
            format="kes"
            secondaryFormat="units"
            secondaryLabel="units"
          />
        </ChartCard>
        <ChartCard
          title="Top sellers by units"
          subtitle="Units sold per week shown in grey"
          details={explain('topUnits')}
        >
          <HBarChart
            items={topByUnits.map((p) => ({ name: p.name, value: p.unitsSold, secondary: p.unitsPerWeek }))}
            format="units"
            secondaryFormat="num"
            secondaryLabel="/wk"
          />
        </ChartCard>
        <ChartCard
          title="Slow and stuck stock"
          subtitle="Cash tied up at cost in slow or unsold products"
          details={explain('stuck')}
        >
          <HBarChart
            items={stuck.map((p) => ({ name: p.name, value: p.stockCostKes, secondary: p.stockQty }))}
            format="kes"
            secondaryFormat="units"
            secondaryLabel="units"
            color="var(--viz-4)"
            emptyText="Nothing stuck. Every product with stock is selling."
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Product velocity"
        subtitle="Sort any column, filter by speed, or search. Click a product to edit it."
        details={explain('velocityTable')}
      >
        <VelocityTable rows={a.products} />
      </ChartCard>

      {/* ---------------------------------------------------------------- mix */}
      <SectionTitle title="What sells" subtitle="Categories, sizes and timing" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Revenue by category"
          subtitle="Gross profit shown in grey"
          table={{
            columns: ['Category', 'Revenue', 'Profit', 'Margin', 'Units'],
            rows: a.categories.map((c) => [
              c.name,
              formatKes(c.revenueKes),
              formatKes(c.profitKes),
              c.revenueKes ? `${n1.format((c.profitKes / c.revenueKes) * 100)}%` : '—',
              c.unitsSold,
            ]),
          }}
          details={explain('category')}
        >
          <HBarChart items={a.categories.map((c) => ({ name: c.name, value: c.revenueKes, secondary: c.profitKes }))} format="kes" secondaryFormat="kes" secondaryLabel="profit" />
        </ChartCard>
        <ChartCard
          title="Units sold by size"
          subtitle="Which sizes move, for smarter restock orders"
          table={{ columns: ['Size', 'Units'], rows: a.sizes.map((s) => [s.name, s.value]) }}
          details={explain('size')}
        >
          <ColumnChart labels={a.sizes.map((s) => s.name)} format="units" series={[{ key: 's', label: 'Units', color: VIZ[0], values: a.sizes.map((s) => s.value) }]} />
        </ChartCard>
        <ChartCard
          title="Revenue by day of week"
          subtitle="Which days customers buy"
          table={{ columns: ['Day', 'Revenue', 'Units'], rows: a.weekday.map((x) => [x.name, formatKes(x.revenueKes), x.unitsSold]) }}
          details={explain('weekday')}
        >
          <ColumnChart showTotals labels={a.weekday.map((x) => x.name)} format="kes" series={[{ key: 'w', label: 'Revenue', color: VIZ[0], values: a.weekday.map((x) => x.revenueKes) }]} />
        </ChartCard>
        <ChartCard
          title="Daily sales calendar"
          subtitle="Each square is a day; darker means more units sold"
          table={{ columns: ['Date', 'Units', 'Revenue'], rows: a.daily.filter((x) => x.units > 0).map((x) => [x.date, x.units, formatKes(x.revenueKes)]) }}
          details={explain('calendar')}
        >
          <CalendarHeatmap days={a.daily} format="kes" />
        </ChartCard>
      </div>

      {/* ---------------------------------------------------------------- customers */}
      <SectionTitle title="Customers" subtitle="Who is buying" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Top buyers" subtitle="By spend this period · units in grey" className="lg:col-span-1" details={explain('topBuyers')}>
          <HBarChart items={a.topBuyers} format="kes" secondaryFormat="units" secondaryLabel="units" />
        </ChartCard>
        <ChartCard
          title="New vs returning buyers"
          subtitle="Returning = bought before this period"
          table={{
            columns: ['Group', 'Buyers'],
            rows: [
              ['New', a.buyerMix.newBuyers],
              ['Returning', a.buyerMix.returningBuyers],
              ['Bought on 2+ days this period', a.buyerMix.repeatWithinRange],
            ],
          }}
          details={explain('buyerMix')}
        >
          <DonutChart
            items={[
              { name: 'New buyers', value: a.buyerMix.newBuyers },
              { name: 'Returning buyers', value: a.buyerMix.returningBuyers },
            ]}
            format="num"
            centerLabel="buyers"
          />
          <p className="mt-3 text-xs text-[var(--viz-ink-2)]">
            {a.buyerMix.repeatWithinRange} buyer{a.buyerMix.repeatWithinRange === 1 ? '' : 's'} bought on more than one day this period.
          </p>
        </ChartCard>
        <ChartCard
          title="Customer sources"
          subtitle="All customers in the CRM"
          table={{ columns: ['Source', 'Customers'], rows: a.customerSources.map((s) => [s.name, s.value]) }}
          details={explain('sources')}
        >
          <DonutChart items={a.customerSources.slice(0, 6)} format="num" centerLabel="customers" />
        </ChartCard>
        <ChartCard
          title="Customer locations"
          subtitle="Top 10 towns in the CRM"
          className="lg:col-span-2"
          details={explain('locations')}
        >
          <HBarChart items={a.customerLocations} format="num" emptyText="No customer locations recorded yet." />
        </ChartCard>
        <ChartCard
          title="Online orders"
          subtitle={`${a.orderTotals.count} placed · ${a.orderTotals.paidCount} paid · ${formatKes(a.orderTotals.paidRevenueKes)}`}
          table={{ columns: ['Status', 'Orders'], rows: a.orderStatus.map((s) => [s.name, s.value]) }}
          details={explain('orders')}
        >
          <DonutChart items={a.orderStatus.map((s) => ({ name: s.name.charAt(0) + s.name.slice(1).toLowerCase(), value: s.value }))} format="num" centerLabel="orders" />
          <p className="mt-3 text-xs text-[var(--viz-ink-2)]">
            {a.openCarts.count} open cart{a.openCarts.count === 1 ? '' : 's'} holding {a.openCarts.units} units worth {formatKes(a.openCarts.valueKes)}.
          </p>
        </ChartCard>
      </div>

      {/* ---------------------------------------------------------------- inventory health */}
      <SectionTitle title="Inventory health" subtitle="Right now, across every size and variant" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Stock status"
          subtitle={`${a.inventory.skus} SKUs (product sizes and variants)`}
          details={explain('stockStatus')}
        >
          <div className="space-y-4">
            <Meter
              label="In stock, healthy"
              value={a.inventory.skus - a.inventory.outOfStockSkus - a.inventory.lowStockSkus}
              max={a.inventory.skus}
              detail={`${a.inventory.skus - a.inventory.outOfStockSkus - a.inventory.lowStockSkus} SKUs`}
              tone="var(--viz-good)"
            />
            <Meter label="Low stock ⚠" value={a.inventory.lowStockSkus} max={a.inventory.skus} detail={`${a.inventory.lowStockSkus} SKUs`} tone="var(--viz-warn)" />
            <Meter label="Out of stock ✕" value={a.inventory.outOfStockSkus} max={a.inventory.skus} detail={`${a.inventory.outOfStockSkus} SKUs`} tone="var(--viz-bad)" />
          </div>
        </ChartCard>
        <ChartCard title="Stock value" subtitle="What is on the shelves" details={explain('stockValueCard')}>
          <FigGrid>
            <Fig label="At cost" value={formatKes(a.inventory.costValueKes)} />
            <Fig label="At retail" value={formatKes(a.inventory.retailValueKes)} />
            <Fig label="Potential profit" value={formatKes(a.inventory.retailValueKes - a.inventory.costValueKes)} />
            <Fig label="Units" value={n0.format(a.inventory.units)} />
          </FigGrid>
        </ChartCard>
        <ChartCard
          title="Restock soon"
          subtitle="Sold out or under 3 weeks of cover"
          details={explain('restockSoon')}
        >
          {restockList.length === 0 ? (
            <p className="py-10 text-center text-xs text-[var(--viz-muted)]">Nothing urgent.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {restockList.slice(0, 8).map((p) => (
                <li key={p.productId} className="flex items-start justify-between gap-3">
                  <Link href={`/admin/products/${p.productId}/edit`} className="min-w-0 break-words hover:opacity-70">
                    {p.name}
                  </Link>
                  <span className="shrink-0 tabular-nums" style={{ color: p.stockQty === 0 ? 'var(--viz-bad)' : 'var(--viz-warn)' }}>
                    {p.stockQty === 0 ? '✕ sold out' : `⚠ ${Math.round(p.daysOfCover ?? 0)} d left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-foreground font-medium' : 'border-black/10 opacity-80 hover:opacity-100 dark:border-white/10'}`}
    >
      {children}
    </Link>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-t border-black/10 pt-6 dark:border-white/10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs text-[var(--viz-ink-2)]">{subtitle}</p>}
    </div>
  )
}

type Insight = { tone: 'good' | 'bad' | 'warn' | 'info'; text: string; details?: React.ReactNode }

function Insights({ items }: { items: Array<Insight | false | undefined | null | 0> }) {
  const list = items.filter(Boolean) as Insight[]
  if (list.length === 0) return null
  const icon = { good: '▲', bad: '✕', warn: '⚠', info: '●' }
  const color = { good: 'var(--viz-good)', bad: 'var(--viz-bad)', warn: 'var(--viz-warn)', info: 'var(--viz-1)' }
  return (
    <section className="rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10">
      <h2 className="text-sm font-semibold">Key insights</h2>
      <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
        {list.map((i) => (
          <li key={i.text} className="min-w-0">
            <DisclosureRow
              subject={i.text.split(/[:.,]/)[0]}
              summary={
                <span className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-xs" style={{ color: color[i.tone] }}>
                    {icon[i.tone]}
                  </span>
                  <span className="min-w-0 break-words">{i.text}</span>
                </span>
              }
            >
              {i.details}
            </DisclosureRow>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- open carts

function CartList({ carts }: { carts: OpenCart[] }) {
  if (carts.length === 0) return <p className="text-xs text-[var(--viz-muted)]">No open carts right now.</p>
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
      {carts.map((c) => {
        const person = c.user?.name || c.customer?.name || c.user?.email || c.email
        return (
          <li key={c.id} className="min-w-0 rounded-md border border-black/10 bg-background p-4 dark:border-white/10">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="text-sm font-semibold break-words">{person ?? 'Anonymous guest'}</p>
                <p className="text-xs text-[var(--viz-muted)]">
                  {c.user ? 'Signed-in account' : c.email ? 'Guest with email' : 'Guest, no contact details'} · updated {fmtDateTime(c.updatedAt)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">{formatKes(c.valueKes)}</p>
            </div>

            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              {c.user && (
                <>
                  <dt className="text-[var(--viz-ink-2)]">Account</dt>
                  <dd className="min-w-0 [overflow-wrap:anywhere]">
                    {c.user.name ?? <Muted>No name</Muted>} · {c.user.email}
                    {c.user.phone && ` · ${c.user.phone}`}
                    <Muted> · joined {fmtDate(c.user.createdAt)}</Muted>
                  </dd>
                </>
              )}
              {c.email && c.email !== c.user?.email && (
                <>
                  <dt className="text-[var(--viz-ink-2)]">Cart email</dt>
                  <dd className="min-w-0 [overflow-wrap:anywhere]">{c.email}</dd>
                </>
              )}
              <dt className="text-[var(--viz-ink-2)]">Customer</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">
                {c.customer ? (
                  <>
                    {c.customer.name}
                    {c.customer.phone && ` · ${c.customer.phone}`}
                    {c.customer.location && ` · ${c.customer.location}`}
                    <Muted>
                      {' '}
                      · {c.customer.source} · since {fmtDate(c.customer.createdAt)}
                    </Muted>
                  </>
                ) : (
                  <Muted>No matching customer record</Muted>
                )}
              </dd>
              <dt className="text-[var(--viz-ink-2)]">History</dt>
              <dd className="min-w-0 tabular-nums">
                {c.history.orders === 0 && !c.customer?.ledgerSales ? (
                  <Muted>No past orders</Muted>
                ) : (
                  <>
                    {n0.format(c.history.orders)} online order{c.history.orders === 1 ? '' : 's'} ({n0.format(c.history.paidOrders)} paid,{' '}
                    {formatKes(c.history.paidSpendKes)})
                    {c.history.lastOrderAt && <Muted> · last {fmtDate(c.history.lastOrderAt)}</Muted>}
                    {c.customer && c.customer.ledgerSales > 0 && (
                      <>
                        <br />
                        Lifetime spend {formatKes(c.customer.ledgerSpendKes)} over {n0.format(c.customer.ledgerSales)} sale line
                        {c.customer.ledgerSales === 1 ? '' : 's'}
                        <Muted> (online + manual)</Muted>
                      </>
                    )}
                  </>
                )}
              </dd>
              {!c.user && !c.email && c.sessionId && (
                <>
                  <dt className="text-[var(--viz-ink-2)]">Session</dt>
                  <dd className="min-w-0 font-mono [overflow-wrap:anywhere]">{c.sessionId}</dd>
                </>
              )}
            </dl>

            <div className="mt-3">
              <MiniTable
                cols={[{ label: 'Item' }, { label: 'Qty', num: true }, { label: 'Price', num: true }, { label: 'Line', num: true }]}
                rows={c.items.map((it, i) => [
                  <span key={`i${i}`}>
                    <Link href={`/product/${it.slug}`} className="underline decoration-black/20 underline-offset-2 hover:decoration-current dark:decoration-white/25">
                      {it.name}
                    </Link>
                    {it.variant && <Muted> · {it.variant}</Muted>}{' '}
                    <Link href={`/admin/products/${it.productId}/edit`} className="text-[var(--viz-muted)] hover:text-foreground">
                      (edit)
                    </Link>
                  </span>,
                  n0.format(it.quantity),
                  formatKes(it.unitPriceKes),
                  formatKes(it.lineKes),
                ])}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
