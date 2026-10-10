import Link from 'next/link'
import { formatKes } from '@/lib/money'
import {
  DEFAULT_RANGE,
  getAnalytics,
  RANGE_PRESETS,
  type Analytics,
  type Basket,
  type BuyerDetail,
  type Granularity,
  type Kpis,
  type OpenCart,
  type ProductVelocity,
  type RangeKey,
  type SkuRow,
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
import {
  Change,
  DetailGrid,
  DetailSection,
  Fig,
  FigGrid,
  MiniTable,
  Muted,
  ProductLink,
  ShareBar,
} from '@/components/admin/analytics/details'

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

const share = (v: number, total: number) => (total > 0 ? `${n1.format((v / total) * 100)}%` : '—')
const marginOf = (profit: number, revenue: number) => (revenue > 0 ? `${n1.format((profit / revenue) * 100)}%` : '—')
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' })
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
/** `YYYY-MM-DD` Kenya-day keys from the analytics module. */
const fmtDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

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

  // ---- drill-down data
  const d = a.details
  const sellingProducts = a.products.filter((p) => p.revenueKes > 0)
  const marginRanked = sellingProducts.filter((p) => p.marginPct !== null).sort((x, y) => (y.marginPct ?? 0) - (x.marginPct ?? 0))
  const marginLeaders = marginRanked.slice(0, 8)
  const marginLaggards = [...marginRanked].reverse().slice(0, 8)
  const underList = sellingProducts
    .filter((p) => p.avgPriceKes !== null && p.listPriceKes > 0 && p.avgPriceKes < p.listPriceKes * 0.98)
    .map((p) => ({ ...p, gapKes: (p.listPriceKes - (p.avgPriceKes ?? 0)) * p.unitsSold }))
    .sort((x, y) => y.gapKes - x.gapKes)
    .slice(0, 10)
  const listValueSold = sellingProducts.reduce((s, p) => s + p.listPriceKes * p.unitsSold, 0)
  const deadWithStock = a.products.filter((p) => p.velocityClass === 'dead' && p.stockQty > 0).sort((x, y) => y.stockCostKes - x.stockCostKes)
  const overstocked = a.products
    .filter((p) => p.stockQty > 0 && (p.daysOfCover === null || p.daysOfCover > 180))
    .sort((x, y) => y.stockCostKes - x.stockCostKes)
    .slice(0, 10)
  const bestPeriod = [...series].sort((x, y) => y.revenueKes - x.revenueKes)[0]
  const sellingPeriods = series.filter((b) => b.revenueKes > 0)
  const weakestPeriod = [...sellingPeriods].sort((x, y) => x.revenueKes - y.revenueKes)[0]
  const totalRevenue = kpis.revenueKes
  const milestones = [0.25, 0.5, 0.75, 1].map((p) => {
    const i = cumulative.findIndex((c) => totalRevenue > 0 && c >= totalRevenue * p - 0.5)
    return { p, label: i >= 0 ? series[i].label : '—' }
  })
  const last7 = a.daily.slice(-7)
  const last7Avg = last7.reduce((s, x) => s + x.revenueKes, 0) / Math.max(1, last7.length)
  const dailyAvg = totalRevenue / a.range.days
  const sellingDays = a.daily.filter((x) => x.units > 0).length
  let streak = 0
  let bestStreak = 0
  for (const day of a.daily) {
    streak = day.units > 0 ? streak + 1 : 0
    bestStreak = Math.max(bestStreak, streak)
  }
  const weekdayCount = [0, 0, 0, 0, 0, 0, 0]
  for (const day of a.daily) weekdayCount[(new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7]++
  const onlineChannel = d.channels.find((c) => c.name === 'Online sale')
  const manualChannel = d.channels.find((c) => c.name === 'Manual sale')
  const channelShare = [
    { name: 'Online', value: onlineChannel?.revenueKes ?? 0, color: FLOW_COLORS['Online sale'] },
    { name: 'Manual', value: manualChannel?.revenueKes ?? 0, color: FLOW_COLORS['Manual sale'] },
  ]
  const restockList = [...soldOutSelling, ...runningLow]
  const signedInCarts = d.carts.filter((c) => c.user).length
  const anonymousCarts = d.carts.filter((c) => !c.user && !c.email).length
  const paidOrders = a.orderTotals.paidCount

  const comparison = <ComparisonTable kpis={kpis} prev={prev} label={a.range.comparisonLabel} />
  const channelTable = <ChannelTable a={a} />
  const buyersTable = <BuyersTable rows={d.buyers} />
  const variantsTable = <VariantsTable rows={d.variants} />

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
              details: comparison,
            },
          topByRevenue[0] && {
            tone: 'info',
            text: `Best seller: ${topByRevenue[0].name}, with ${formatKes(topByRevenue[0].revenueKes)} from ${topByRevenue[0].unitsSold} units (${topByRevenue[0].unitsPerWeek.toFixed(1)} a week).`,
            details: (
              <FigGrid>
                <Fig label="Share of revenue" value={share(topByRevenue[0].revenueKes, totalRevenue)} />
                <Fig label="Gross margin" value={topByRevenue[0].marginPct === null ? '—' : `${n1.format(topByRevenue[0].marginPct)}%`} />
                <Fig label="In stock" value={n0.format(topByRevenue[0].stockQty)} sub={topByRevenue[0].daysOfCover === null ? undefined : `${n0.format(topByRevenue[0].daysOfCover)} days of cover`} />
                <Fig label="Avg sold at" value={formatKes(topByRevenue[0].avgPriceKes ?? 0)} sub={`List ${formatKes(topByRevenue[0].listPriceKes)}`} />
                <Fig label="Edit" value={<ProductLink id={topByRevenue[0].productId}>Open product</ProductLink>} />
              </FigGrid>
            ),
          },
          a.pareto.totalProductsSold > 0 && {
            tone: 'info',
            text: `${a.pareto.productsFor80Pct} of ${a.pareto.totalProductsSold} selling products bring in 80% of revenue.`,
            details: (
              <ProductTable
                rows={sellingProducts.slice(0, a.pareto.productsFor80Pct)}
                cols={['revenue', 'share', 'units']}
                total={totalRevenue}
              />
            ),
          },
          soldOutSelling.length > 0 && {
            tone: 'bad',
            text: `${soldOutSelling.length} product${soldOutSelling.length > 1 ? 's are' : ' is'} selling but fully out of stock: ${soldOutSelling.slice(0, 3).map((p) => p.name).join(', ')}${soldOutSelling.length > 3 ? '…' : ''}.`,
            details: <ProductTable rows={soldOutSelling} cols={['units', 'pace', 'lastSold']} />,
          },
          runningLow.length > 0 && {
            tone: 'warn',
            text: `${runningLow.length} product${runningLow.length > 1 ? 's' : ''} will run out within 3 weeks at the current pace: ${runningLow.slice(0, 3).map((p) => `${p.name} (${Math.round(p.daysOfCover ?? 0)} d)`).join(', ')}.`,
            details: <ProductTable rows={runningLow} cols={['stock', 'pace', 'cover', 'reorder']} />,
          },
          a.inventory.deadStockCostKes > 0 && {
            tone: 'warn',
            text: `${formatKes(a.inventory.deadStockCostKes)} of stock (at cost) sits in products that haven't sold in this period.`,
            details: <ProductTable rows={deadWithStock} cols={['stock', 'stockCost', 'lastSold']} />,
          },
          risers[0] &&
            (risers[0].trendPct ?? 0) > 0 && {
              tone: 'good',
              text: `Gaining pace: ${risers[0].name}, with ${Math.round(risers[0].trendPct ?? 0)}% more units sold in the second half of the period than the first.`,
              details: <ProductTable rows={risers.filter((p) => (p.trendPct ?? 0) > 0).slice(0, 8)} cols={['trend', 'units', 'pace', 'stock']} />,
            },
          kpis.giveawayUnits > 0 && {
            tone: 'info',
            text: `${kpis.giveawayUnits} units went to influencers, rewards or write-offs, costing ${formatKes(kpis.giveawayCostKes)} at cost price.`,
            details: <GiveawayDetails a={a} />,
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
          <div className="space-y-5">
            <FigGrid>
              <Fig label="Online store" value={formatKes(onlineChannel?.revenueKes ?? 0)} sub={share(onlineChannel?.revenueKes ?? 0, totalRevenue)} />
              <Fig label="Manual sales" value={formatKes(manualChannel?.revenueKes ?? 0)} sub={share(manualChannel?.revenueKes ?? 0, totalRevenue)} />
              <Fig label="Average sale" value={formatKes(kpis.avgSaleKes)} sub={`${n0.format(kpis.transactions)} sales`} />
              <Fig label="Per day" value={formatKes(dailyAvg)} sub={`Last 7 days: ${formatKes(last7Avg)} a day`} />
              <Fig
                label="Best day"
                value={d.topDays[0] ? formatKes(d.topDays[0].revenueKes) : '—'}
                sub={d.topDays[0] ? fmtDay(d.topDays[0].date) : undefined}
              />
              <Fig
                label="Discounts given"
                value={formatKes(d.discounts.totalKes)}
                sub={`${share(d.discounts.totalKes, totalRevenue + d.discounts.totalKes)} of gross`}
              />
            </FigGrid>
            <ShareBar items={channelShare} format={formatKes} />
            <DetailGrid>
              <DetailSection title="By channel">{channelTable}</DetailSection>
              <DetailSection title={a.range.comparisonLabel ? `Compared with ${a.range.comparisonLabel}` : 'Period comparison'}>
                {comparison}
              </DetailSection>
              <DetailSection title="Top products">
                <ProductTable rows={sellingProducts.slice(0, 8)} cols={['revenue', 'share', 'units']} total={totalRevenue} />
              </DetailSection>
              <DetailSection title="Top categories">
                <MiniTable
                  cols={[{ label: 'Category' }, { label: 'Revenue', num: true }, { label: 'Share', num: true }]}
                  rows={a.categories.slice(0, 8).map((c) => [c.name, formatKes(c.revenueKes), share(c.revenueKes, totalRevenue)])}
                />
              </DetailSection>
            </DetailGrid>
          </div>
        </StatTile>
        <StatTile
          label="Gross profit"
          value={formatKes(kpis.profitKes)}
          deltaPct={delta(kpis.profitKes, prev?.profitKes)}
          spark={series.map((b) => b.profitKes)}
          hint={`${n1.format(kpis.marginPct)}% margin`}
        >
          <div className="space-y-5">
            <FigGrid>
              <Fig label="Revenue" value={formatKes(kpis.revenueKes)} />
              <Fig label="Cost of goods sold" value={formatKes(kpis.revenueKes - kpis.profitKes)} />
              <Fig label="Gross profit" value={formatKes(kpis.profitKes)} />
              <Fig label="Margin" value={`${n1.format(kpis.marginPct)}%`} sub={prev ? `Was ${n1.format(prev.marginPct)}%` : undefined} />
              <Fig label="Discounts given" value={formatKes(d.discounts.totalKes)} sub="Already taken off revenue" />
              <Fig
                label="Lost selling below cost"
                value={formatKes(d.belowCost.reduce((s, x) => s + x.costKes - x.valueKes, 0))}
                sub={`${d.belowCost.length} product${d.belowCost.length === 1 ? '' : 's'}`}
                tone={d.belowCost.length ? 'var(--viz-bad)' : undefined}
              />
            </FigGrid>
            <DetailGrid>
              <DetailSection title="Margin leaders" note="Highest gross margin among products that sold">
                <ProductTable rows={marginLeaders} cols={['profit', 'margin', 'units']} />
              </DetailSection>
              <DetailSection title="Margin laggards" note="Lowest gross margin. Check cost prices and discounts">
                <ProductTable rows={marginLaggards} cols={['profit', 'margin', 'units']} />
              </DetailSection>
              <DetailSection title="Profit by category">
                <MiniTable
                  cols={[{ label: 'Category' }, { label: 'Profit', num: true }, { label: 'Margin', num: true }]}
                  rows={a.categories.map((c) => [c.name, formatKes(c.profitKes), marginOf(c.profitKes, c.revenueKes)])}
                />
              </DetailSection>
              <DetailSection title="Sold below cost" note="Sale lines where the price received was under cost">
                <MiniTable
                  cols={[
                    { label: 'Product' },
                    { label: 'Units', num: true },
                    { label: 'Received', num: true },
                    { label: 'Cost', num: true },
                    { label: 'Loss', num: true },
                  ]}
                  rows={d.belowCost.map((x) => [
                    <ProductLink key="p" id={x.productId}>
                      {x.name}
                    </ProductLink>,
                    n0.format(x.units),
                    formatKes(x.valueKes),
                    formatKes(x.costKes),
                    formatKes(x.costKes - x.valueKes),
                  ])}
                  empty="No sales below cost this period."
                />
              </DetailSection>
            </DetailGrid>
          </div>
        </StatTile>
        <StatTile
          label="Units sold"
          value={n0.format(kpis.unitsSold)}
          deltaPct={delta(kpis.unitsSold, prev?.unitsSold)}
          spark={series.map((b) => b.unitsSold)}
          hint={`${n1.format((kpis.unitsSold / a.range.days) * 7)} a week`}
        >
          <div className="space-y-5">
            <FigGrid>
              <Fig label="Per week" value={n1.format((kpis.unitsSold / a.range.days) * 7)} />
              <Fig label="Per sale" value={n1.format(kpis.transactions ? kpis.unitsSold / kpis.transactions : 0)} />
              <Fig label="Online" value={n0.format(onlineChannel?.unitsSold ?? 0)} sub={share(onlineChannel?.unitsSold ?? 0, kpis.unitsSold)} />
              <Fig label="Manual" value={n0.format(manualChannel?.unitsSold ?? 0)} sub={share(manualChannel?.unitsSold ?? 0, kpis.unitsSold)} />
              <Fig label="Given away / written off" value={n0.format(kpis.giveawayUnits)} />
            </FigGrid>
            <DetailGrid>
              <DetailSection title="Top products by units">
                <ProductTable rows={topByUnits} cols={['units', 'unitShare', 'pace']} total={kpis.unitsSold} />
              </DetailSection>
              <DetailSection title="Top sizes and variants">{variantsTable}</DetailSection>
            </DetailGrid>
          </div>
        </StatTile>
        <StatTile
          label="Sales (baskets)"
          value={n0.format(kpis.transactions)}
          deltaPct={delta(kpis.transactions, prev?.transactions)}
          spark={series.map((b) => b.transactions)}
          hint="One buyer on one day = one sale"
        >
          <div className="space-y-5">
            <FigGrid>
              <Fig label="Online sales" value={n0.format(onlineChannel?.transactions ?? 0)} />
              <Fig label="Manual sales" value={n0.format(manualChannel?.transactions ?? 0)} />
              <Fig
                label="Sales per selling day"
                value={n1.format(sellingDays ? kpis.transactions / sellingDays : 0)}
                sub={`${sellingDays} selling days`}
              />
              <Fig
                label="Largest sale"
                value={d.baskets.largest[0] ? formatKes(d.baskets.largest[0].valueKes) : '—'}
                sub={d.baskets.largest[0]?.buyer ?? undefined}
              />
            </FigGrid>
            <DetailGrid>
              <DetailSection title="Basket size">
                <BandMeters items={d.baskets.sizeBands} />
              </DetailSection>
              <DetailSection title="Most recent sales" wide>
                <BasketTable rows={d.baskets.recent} />
              </DetailSection>
            </DetailGrid>
          </div>
        </StatTile>
        <StatTile
          label="Average sale value"
          value={formatKes(kpis.avgSaleKes)}
          deltaPct={delta(kpis.avgSaleKes, prev?.avgSaleKes)}
          hint={`${n1.format(kpis.transactions ? kpis.unitsSold / kpis.transactions : 0)} units per sale`}
        >
          <div className="space-y-5">
            <FigGrid>
              <Fig label="This period" value={formatKes(kpis.avgSaleKes)} />
              <Fig
                label="Previous period"
                value={prev ? formatKes(prev.avgSaleKes) : '—'}
                sub={<Change pct={delta(kpis.avgSaleKes, prev?.avgSaleKes)} />}
              />
              <Fig
                label="Online sale avg"
                value={formatKes(onlineChannel?.transactions ? onlineChannel.revenueKes / onlineChannel.transactions : 0)}
              />
              <Fig
                label="Manual sale avg"
                value={formatKes(manualChannel?.transactions ? manualChannel.revenueKes / manualChannel.transactions : 0)}
              />
              <Fig label="Units per sale" value={n1.format(kpis.transactions ? kpis.unitsSold / kpis.transactions : 0)} />
              <Fig
                label="Paid online order avg"
                value={formatKes(paidOrders ? a.orderTotals.paidRevenueKes / paidOrders : 0)}
                sub="Includes shipping"
              />
            </FigGrid>
            <DetailGrid>
              <DetailSection title="Sales by value">
                <BandMeters items={d.baskets.valueBands} />
              </DetailSection>
              <DetailSection title="Largest sales">
                <BasketTable rows={d.baskets.largest} compact />
              </DetailSection>
            </DetailGrid>
          </div>
        </StatTile>
        <StatTile
          label="Average price per unit"
          value={formatKes(kpis.avgUnitPriceKes)}
          deltaPct={delta(kpis.avgUnitPriceKes, prev?.avgUnitPriceKes)}
        >
          <div className="space-y-5">
            <FigGrid>
              <Fig label="Sold at (avg)" value={formatKes(kpis.avgUnitPriceKes)} />
              <Fig label="List price (avg)" value={formatKes(kpis.unitsSold ? listValueSold / kpis.unitsSold : 0)} sub="Of the units that sold" />
              <Fig label="Price realised" value={share(kpis.revenueKes, listValueSold)} sub="Revenue ÷ list value" />
              <Fig label="Discounts" value={formatKes(d.discounts.totalKes)} sub={`${d.discounts.lines} sale lines`} />
            </FigGrid>
            <DetailGrid>
              <DetailSection title="Sold under list price" note="Average price received vs current list price">
                <MiniTable
                  cols={[
                    { label: 'Product' },
                    { label: 'List', num: true },
                    { label: 'Sold at', num: true },
                    { label: 'Gap', num: true },
                    { label: 'Units', num: true },
                  ]}
                  rows={underList.map((p) => [
                    <ProductLink key="p" id={p.productId}>
                      {p.name}
                    </ProductLink>,
                    formatKes(p.listPriceKes),
                    formatKes(p.avgPriceKes ?? 0),
                    `${n0.format(((p.listPriceKes - (p.avgPriceKes ?? 0)) / p.listPriceKes) * 100)}%`,
                    n0.format(p.unitsSold),
                  ])}
                  empty="Everything sold at or near list price."
                />
              </DetailSection>
              <DiscountSections a={a} />
            </DetailGrid>
          </div>
        </StatTile>
        <StatTile
          label="Buyers"
          value={n0.format(kpis.buyers)}
          deltaPct={delta(kpis.buyers, prev?.buyers)}
          spark={series.map((b) => b.buyers)}
          hint={`${a.buyerMix.newBuyers} new · ${a.buyerMix.returningBuyers} returning`}
        >
          <BuyerDetails a={a} buyersTable={buyersTable} />
        </StatTile>
        <StatTile
          label="Restock spend"
          value={formatKes(kpis.restockSpendKes)}
          deltaPct={delta(kpis.restockSpendKes, prev?.restockSpendKes)}
          upIsGood={false}
          spark={series.map((b) => b.restockSpendKes)}
          hint={`${n0.format(kpis.unitsIn)} units received`}
        >
          <RestockDetails a={a} />
        </StatTile>
        <StatTile
          label="Stock on hand (at cost)"
          value={formatKes(a.inventory.costValueKes)}
          hint={`${n0.format(a.inventory.units)} units · ${formatKes(a.inventory.retailValueKes)} at retail`}
        >
          <StockDetails a={a} deadWithStock={deadWithStock} />
        </StatTile>
        <StatTile
          label="Giveaways & write-offs"
          value={formatKes(kpis.giveawayCostKes)}
          deltaPct={delta(kpis.giveawayCostKes, prev?.giveawayCostKes)}
          upIsGood={false}
          hint={`${n0.format(kpis.giveawayUnits)} units at cost`}
        >
          <GiveawayDetails a={a} />
        </StatTile>

        <StatTile
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
            <CartList carts={d.carts} />
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
        details={
          <div className="space-y-5">
            <FigGrid>
              <Fig label={`Best ${periodWord}`} value={bestPeriod?.revenueKes ? formatKes(bestPeriod.revenueKes) : '—'} sub={bestPeriod?.revenueKes ? bestPeriod.label : undefined} />
              <Fig label={`Weakest selling ${periodWord}`} value={weakestPeriod ? formatKes(weakestPeriod.revenueKes) : '—'} sub={weakestPeriod?.label} />
              <Fig label={`Average per ${periodWord}`} value={formatKes(series.length ? totalRevenue / series.length : 0)} />
              <Fig label={`${periodWord[0].toUpperCase()}${periodWord.slice(1)}s with no sales`} value={n0.format(series.length - sellingPeriods.length)} sub={`of ${series.length}`} />
            </FigGrid>
            <DetailGrid>
              <DetailSection title={a.range.comparisonLabel ? `Compared with ${a.range.comparisonLabel}` : 'Period comparison'}>{comparison}</DetailSection>
              <DetailSection title={`Most profitable ${periodWord}s`}>
                <MiniTable
                  cols={[{ label: 'Period' }, { label: 'Profit', num: true }, { label: 'Margin', num: true }, { label: 'Revenue', num: true }]}
                  rows={[...series]
                    .filter((b) => b.revenueKes > 0)
                    .sort((x, y) => y.profitKes - x.profitKes)
                    .slice(0, 6)
                    .map((b) => [b.label, formatKes(b.profitKes), marginOf(b.profitKes, b.revenueKes), formatKes(b.revenueKes)])}
                />
              </DetailSection>
            </DetailGrid>
          </div>
        }
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
          details={
            <DetailGrid>
              <DetailSection title={`Busiest ${periodWord}s`}>
                <MiniTable
                  cols={[{ label: 'Period' }, { label: 'Units', num: true }, { label: 'Sales', num: true }, { label: 'Revenue', num: true }]}
                  rows={[...series]
                    .filter((b) => b.unitsSold > 0)
                    .sort((x, y) => y.unitsSold - x.unitsSold)
                    .slice(0, 6)
                    .map((b) => [b.label, n0.format(b.unitsSold), n0.format(b.transactions), formatKes(b.revenueKes)])}
                />
              </DetailSection>
              <DetailSection title="Top sizes and variants">{variantsTable}</DetailSection>
            </DetailGrid>
          }
        >
          <ColumnChart showTotals labels={labels} format="units" series={[{ key: 'u', label: 'Units sold', color: VIZ[0], values: series.map((b) => b.unitsSold) }]} />
        </ChartCard>
        <ChartCard
          title="Cumulative revenue"
          subtitle="Running total across the period. Steeper means faster selling."
          table={{ columns: ['Period', 'Running total'], rows: series.map((b, i) => [b.label, formatKes(cumulative[i])]) }}
          details={
            <div className="space-y-5">
              <FigGrid>
                <Fig label="Total" value={formatKes(totalRevenue)} />
                <Fig label="Average a day" value={formatKes(dailyAvg)} />
                <Fig
                  label="Last 7 days, a day"
                  value={formatKes(last7Avg)}
                  sub={<Change pct={dailyAvg > 0 ? ((last7Avg - dailyAvg) / dailyAvg) * 100 : null} />}
                />
                <Fig label="Next 30 days at last-7-day pace" value={formatKes(last7Avg * 30)} />
              </FigGrid>
              <DetailSection title="When the money came in" note="The period in which each share of the total was reached">
                <MiniTable
                  cols={[{ label: 'Share of total' }, { label: 'Reached in', num: true }, { label: 'Amount', num: true }]}
                  rows={milestones.map((m) => [`${m.p * 100}%`, m.label, formatKes(totalRevenue * m.p)])}
                />
              </DetailSection>
            </div>
          }
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
          details={
            <div className="space-y-5">
              <ShareBar items={channelShare} format={formatKes} />
              <DetailGrid>
                <DetailSection title="Channel summary" wide>
                  {channelTable}
                </DetailSection>
                {d.channels.map((c) => (
                  <DetailSection key={c.name} title={`Top products · ${c.name.toLowerCase()}`}>
                    <MiniTable
                      cols={[{ label: 'Product' }, { label: 'Revenue', num: true }, { label: 'Share', num: true }]}
                      rows={c.topProducts.map((p) => [p.name, formatKes(p.value), share(p.value, c.revenueKes)])}
                    />
                  </DetailSection>
                ))}
              </DetailGrid>
            </div>
          }
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
          details={
            <DetailGrid>
              <DetailSection title="Most recent sales" wide>
                <BasketTable rows={d.baskets.recent} />
              </DetailSection>
              <DetailSection title="Top buyers" wide>
                {buyersTable}
              </DetailSection>
            </DetailGrid>
          }
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
          details={
            <div className="space-y-5">
              <FigGrid>
                <Fig label="Units in" value={n0.format(kpis.unitsIn)} sub={formatKes(kpis.restockSpendKes)} />
                <Fig label="Units sold" value={n0.format(kpis.unitsSold)} />
                <Fig label="Units given away / written off" value={n0.format(kpis.giveawayUnits)} sub={formatKes(kpis.giveawayCostKes)} />
                <Fig
                  label="Net change"
                  value={`${kpis.unitsIn - kpis.unitsSold - kpis.giveawayUnits >= 0 ? '+' : '−'}${n0.format(Math.abs(kpis.unitsIn - kpis.unitsSold - kpis.giveawayUnits))}`}
                  sub="units in − units out"
                />
              </FigGrid>
              <RestockDetails a={a} compact />
            </div>
          }
        >
          <ColumnChart labels={labels} format="units" height={260} series={flowSeries} />
        </ChartCard>
        <ChartCard
          title="Where stock went"
          subtitle="Units leaving the warehouse, by reason"
          table={{ columns: ['Reason', 'Units'], rows: a.outByReason.map((r) => [r.name, r.value]) }}
          details={
            <div className="space-y-5">
              <DetailGrid>
                {a.outByReason.map((r) => (
                  <DetailSection key={r.name} title={`${r.name} · ${n0.format(r.value)} units`}>
                    <MiniTable
                      cols={[{ label: 'Product' }, { label: 'Units', num: true }, { label: 'Share', num: true }]}
                      rows={(d.outReasonProducts[r.name] ?? []).map((p) => [p.name, n0.format(p.value), share(p.value, r.value)])}
                    />
                  </DetailSection>
                ))}
              </DetailGrid>
              {d.giveaways.byRecipient.length > 0 && (
                <DetailSection title="Recipients of giveaways and write-offs">
                  <RecipientTable a={a} />
                </DetailSection>
              )}
            </div>
          }
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
          details={
            <div className="space-y-5">
              <ClassSummary products={a.products} />
              <DetailGrid>
                {velocityCounts.map((v) => (
                  <DetailSection key={v.key} title={`${CLASS_META[v.key].label} · ${v.value}`} note={CLASS_META[v.key].hint}>
                    <ProductTable
                      rows={a.products
                        .filter((p) => p.velocityClass === v.key)
                        .sort((x, y) => y.revenueKes - x.revenueKes || y.stockCostKes - x.stockCostKes)
                        .slice(0, 6)}
                      cols={v.key === 'dead' ? ['stock', 'stockCost'] : ['units', 'stock', 'cover']}
                    />
                  </DetailSection>
                ))}
              </DetailGrid>
            </div>
          }
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
          details={
            <DetailGrid>
              {COVER_BANDS.map((band) => {
                const rows = a.products.filter(band.test)
                if (rows.length === 0) return null
                return (
                  <DetailSection key={band.name} title={`${band.name} · ${rows.length}`}>
                    <ProductTable
                      rows={rows.sort((x, y) => y.stockCostKes - x.stockCostKes).slice(0, 8)}
                      cols={band.name === 'Out of stock' ? ['units', 'lastSold'] : ['stock', 'cover', 'stockCost']}
                    />
                  </DetailSection>
                )
              })}
            </DetailGrid>
          }
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
          details={
            <DetailGrid>
              <DetailSection title="Lowest sell-through" note="Stock that is barely moving relative to what is on hand">
                <ProductTable
                  rows={a.products
                    .filter((p) => p.stockQty > 0)
                    .sort((x, y) => x.sellThroughPct - y.sellThroughPct || y.stockCostKes - x.stockCostKes)
                    .slice(0, 8)}
                  cols={['sellThrough', 'units', 'stock']}
                />
              </DetailSection>
            </DetailGrid>
          }
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
        details={
          <DetailGrid>
            <DetailSection title="At risk of selling out" note="Selling, with under 3 weeks of cover or none left">
              <ProductTable rows={restockList.slice(0, 10)} cols={['pace', 'stock', 'cover']} />
            </DetailSection>
            <DetailSection title="Overstocked" note="Over 6 months of cover, or no sales this period">
              <ProductTable rows={overstocked} cols={['pace', 'stock', 'stockCost']} />
            </DetailSection>
          </DetailGrid>
        }
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
          details={
            <ProductTable rows={topByRevenue} cols={['revenue', 'share', 'units', 'margin', 'avgVsList']} total={totalRevenue} />
          }
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
          details={
            <DetailGrid>
              <DetailSection title="Products">
                <ProductTable rows={topByUnits} cols={['units', 'pace', 'stock', 'cover']} />
              </DetailSection>
              <DetailSection title="Sizes and variants">{variantsTable}</DetailSection>
            </DetailGrid>
          }
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
          details={
            <div className="space-y-4">
              <FigGrid>
                <Fig label="Tied up at cost" value={formatKes(stuck.reduce((s, p) => s + p.stockCostKes, 0))} sub={`Top ${stuck.length} products`} />
                <Fig label="At list price" value={formatKes(stuck.reduce((s, p) => s + p.stockQty * p.listPriceKes, 0))} />
              </FigGrid>
              <ProductTable rows={stuck} cols={['stock', 'stockCost', 'pace', 'lastSold']} />
            </div>
          }
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
        detailsLabel="Summary"
        details={<ClassSummary products={a.products} />}
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
          details={
            <div className="space-y-5">
              <MiniTable
                cols={[
                  { label: 'Category' },
                  { label: 'Revenue', num: true },
                  { label: 'Share', num: true },
                  { label: 'Margin', num: true },
                  { label: 'Units', num: true },
                  { label: 'Stock at cost', num: true },
                ]}
                rows={a.categories.map((c) => [
                  c.name,
                  formatKes(c.revenueKes),
                  share(c.revenueKes, totalRevenue),
                  marginOf(c.profitKes, c.revenueKes),
                  n0.format(c.unitsSold),
                  formatKes(d.stockByCategory.find((s) => s.name === c.name)?.costKes ?? 0),
                ])}
              />
              <DetailGrid>
                {a.categories.slice(0, 8).map((c) => (
                  <DetailSection key={c.name} title={`Top in ${c.name}`}>
                    <MiniTable
                      cols={[{ label: 'Product' }, { label: 'Revenue', num: true }, { label: 'Units', num: true }]}
                      rows={(d.categoryProducts[c.name] ?? []).map((p) => [
                        <ProductLink key="p" id={p.productId}>
                          {p.name}
                        </ProductLink>,
                        formatKes(p.valueKes),
                        n0.format(p.units),
                      ])}
                    />
                  </DetailSection>
                ))}
              </DetailGrid>
            </div>
          }
        >
          <HBarChart items={a.categories.map((c) => ({ name: c.name, value: c.revenueKes, secondary: c.profitKes }))} format="kes" secondaryFormat="kes" secondaryLabel="profit" />
        </ChartCard>
        <ChartCard
          title="Units sold by size"
          subtitle="Which sizes move, for smarter restock orders"
          table={{ columns: ['Size', 'Units'], rows: a.sizes.map((s) => [s.name, s.value]) }}
          details={
            <DetailSection title="Sold vs in stock" note="Weeks of cover per size at this period's pace">
              <MiniTable
                cols={[
                  { label: 'Size' },
                  { label: 'Sold', num: true },
                  { label: 'Share', num: true },
                  { label: 'Revenue', num: true },
                  { label: 'In stock', num: true },
                  { label: 'Weeks of cover', num: true },
                ]}
                rows={d.sizeTable.map((s) => {
                  const perWeek = (s.unitsSold / a.range.days) * 7
                  return [
                    s.name,
                    n0.format(s.unitsSold),
                    share(s.unitsSold, a.sizes.reduce((t, x) => t + x.value, 0)),
                    formatKes(s.revenueKes),
                    n0.format(s.inStock),
                    perWeek > 0 ? n1.format(s.inStock / perWeek) : s.inStock > 0 ? 'No sales' : '—',
                  ]
                })}
              />
            </DetailSection>
          }
        >
          <ColumnChart labels={a.sizes.map((s) => s.name)} format="units" series={[{ key: 's', label: 'Units', color: VIZ[0], values: a.sizes.map((s) => s.value) }]} />
        </ChartCard>
        <ChartCard
          title="Revenue by day of week"
          subtitle="Which days customers buy"
          table={{ columns: ['Day', 'Revenue', 'Units'], rows: a.weekday.map((x) => [x.name, formatKes(x.revenueKes), x.unitsSold]) }}
          details={
            <MiniTable
              cols={[
                { label: 'Day' },
                { label: 'Revenue', num: true },
                { label: 'Share', num: true },
                { label: 'Units', num: true },
                { label: 'Avg per day', num: true },
              ]}
              rows={a.weekday.map((x, i) => [
                x.name,
                formatKes(x.revenueKes),
                share(x.revenueKes, totalRevenue),
                n0.format(x.unitsSold),
                formatKes(weekdayCount[i] ? x.revenueKes / weekdayCount[i] : 0),
              ])}
            />
          }
        >
          <ColumnChart showTotals labels={a.weekday.map((x) => x.name)} format="kes" series={[{ key: 'w', label: 'Revenue', color: VIZ[0], values: a.weekday.map((x) => x.revenueKes) }]} />
        </ChartCard>
        <ChartCard
          title="Daily sales calendar"
          subtitle="Each square is a day; darker means more units sold"
          table={{ columns: ['Date', 'Units', 'Revenue'], rows: a.daily.filter((x) => x.units > 0).map((x) => [x.date, x.units, formatKes(x.revenueKes)]) }}
          details={
            <div className="space-y-5">
              <FigGrid>
                <Fig label="Days with sales" value={n0.format(sellingDays)} sub={`of ${a.daily.length}`} />
                <Fig label="Days without" value={n0.format(a.daily.length - sellingDays)} />
                <Fig label="Longest selling streak" value={`${n0.format(bestStreak)} days`} />
                <Fig label="Average on a selling day" value={formatKes(sellingDays ? totalRevenue / sellingDays : 0)} />
              </FigGrid>
              <DetailSection title="Best days">
                <MiniTable
                  cols={[{ label: 'Day' }, { label: 'Revenue', num: true }, { label: 'Units', num: true }, { label: 'Sales', num: true }]}
                  rows={d.topDays.map((x) => [fmtDay(x.date), formatKes(x.revenueKes), n0.format(x.units), n0.format(x.transactions)])}
                />
              </DetailSection>
            </div>
          }
        >
          <CalendarHeatmap days={a.daily} format="kes" />
        </ChartCard>
      </div>

      {/* ---------------------------------------------------------------- customers */}
      <SectionTitle title="Customers" subtitle="Who is buying" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Top buyers" subtitle="By spend this period · units in grey" className="lg:col-span-1" details={buyersTable}>
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
          details={<BuyerDetails a={a} buyersTable={null} />}
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
          details={
            <div className="space-y-5">
              <FigGrid>
                <Fig label="Customers in CRM" value={n0.format(a.customerSources.reduce((s, x) => s + x.value, 0))} />
                <Fig label="Added this period" value={n0.format(d.newCustomers.total)} />
              </FigGrid>
              <DetailGrid>
                <DetailSection title="Added this period, by source">
                  <MiniTable
                    cols={[{ label: 'Source' }, { label: 'New', num: true }, { label: 'All time', num: true }]}
                    rows={d.newCustomers.bySource.map((s) => [
                      s.name,
                      n0.format(s.value),
                      n0.format(a.customerSources.find((x) => x.name === s.name)?.value ?? 0),
                    ])}
                    empty="No customers added this period."
                  />
                </DetailSection>
                <DetailSection title="Latest customers">
                  <MiniTable
                    cols={[{ label: 'Customer' }, { label: 'Source' }, { label: 'Added', num: true }]}
                    rows={d.newCustomers.recent.map((c) => [
                      <span key="n">
                        {c.name}
                        {c.location && <Muted> · {c.location}</Muted>}
                      </span>,
                      c.source,
                      fmtDate(c.at),
                    ])}
                    empty="No customers added this period."
                  />
                </DetailSection>
              </DetailGrid>
            </div>
          }
        >
          <DonutChart items={a.customerSources.slice(0, 6)} format="num" centerLabel="customers" />
        </ChartCard>
        <ChartCard
          title="Customer locations"
          subtitle="Top 10 towns in the CRM"
          className="lg:col-span-2"
          details={
            <DetailSection
              title={`All ${d.allLocations.length} locations`}
              note={d.unknownLocations ? `${n0.format(d.unknownLocations)} customers have no location recorded.` : undefined}
            >
              <MiniTable
                cols={[{ label: 'Location' }, { label: 'Customers', num: true }, { label: 'Share', num: true }]}
                rows={d.allLocations.map((l) => [l.name, n0.format(l.value), share(l.value, d.allLocations.reduce((s, x) => s + x.value, 0))])}
                empty="No customer locations recorded yet."
              />
            </DetailSection>
          }
        >
          <HBarChart items={a.customerLocations} format="num" emptyText="No customer locations recorded yet." />
        </ChartCard>
        <ChartCard
          title="Online orders"
          subtitle={`${a.orderTotals.count} placed · ${a.orderTotals.paidCount} paid · ${formatKes(a.orderTotals.paidRevenueKes)}`}
          table={{ columns: ['Status', 'Orders'], rows: a.orderStatus.map((s) => [s.name, s.value]) }}
          details={<OrderDetails a={a} />}
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
          details={
            <DetailGrid>
              <DetailSection title={`Out of stock · ${d.skus.out.length}`}>
                <SkuTable rows={d.skus.out} />
              </DetailSection>
              <DetailSection title={`Low stock · ${d.skus.low.length}`} note="At or below the product's low-stock threshold">
                <SkuTable rows={d.skus.low} />
              </DetailSection>
            </DetailGrid>
          }
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
        <ChartCard title="Stock value" subtitle="What is on the shelves" details={<StockDetails a={a} deadWithStock={deadWithStock} skipSkus />}>
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
          details={
            <DetailSection title="Suggested reorder" note="Units needed to hold 60 days of stock at this period's pace">
              <ProductTable rows={restockList} cols={['pace', 'stock', 'cover', 'reorder']} />
            </DetailSection>
          }
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
          <li key={i.text} className={`min-w-0 ${i.details ? 'has-[[aria-expanded=true]]:col-span-full' : ''}`}>
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

// ---------------------------------------------------------------- drill-down building blocks

/** Same bands as the cover histogram in getAnalytics, so the counts match the chart. */
const COVER_BANDS: Array<{ name: string; test: (p: ProductVelocity) => boolean }> = [
  { name: 'Out of stock', test: (p) => p.stockQty === 0 },
  { name: 'Under 2 weeks', test: (p) => p.daysOfCover !== null && p.daysOfCover < 14 },
  { name: '2–4 weeks', test: (p) => p.daysOfCover !== null && p.daysOfCover >= 14 && p.daysOfCover < 30 },
  { name: '1–3 months', test: (p) => p.daysOfCover !== null && p.daysOfCover >= 30 && p.daysOfCover < 90 },
  { name: '3–6 months', test: (p) => p.daysOfCover !== null && p.daysOfCover >= 90 && p.daysOfCover < 180 },
  { name: '6 months +', test: (p) => p.daysOfCover !== null && p.daysOfCover >= 180 },
  { name: 'No sales', test: (p) => p.stockQty > 0 && p.daysOfCover === null },
]

type ProductCol =
  | 'revenue'
  | 'share'
  | 'units'
  | 'unitShare'
  | 'profit'
  | 'margin'
  | 'pace'
  | 'stock'
  | 'stockCost'
  | 'cover'
  | 'lastSold'
  | 'trend'
  | 'reorder'
  | 'sellThrough'
  | 'avgVsList'

const PRODUCT_COLS: Record<ProductCol, { label: string; cell: (p: ProductVelocity, total: number) => React.ReactNode }> = {
  revenue: { label: 'Revenue', cell: (p) => formatKes(p.revenueKes) },
  share: { label: 'Share', cell: (p, t) => share(p.revenueKes, t) },
  units: { label: 'Units sold', cell: (p) => n0.format(p.unitsSold) },
  unitShare: { label: 'Share', cell: (p, t) => share(p.unitsSold, t) },
  profit: { label: 'Profit', cell: (p) => formatKes(p.profitKes) },
  margin: { label: 'Margin', cell: (p) => (p.marginPct === null ? '—' : `${n1.format(p.marginPct)}%`) },
  pace: { label: 'Per week', cell: (p) => n1.format(p.unitsPerWeek) },
  stock: { label: 'In stock', cell: (p) => n0.format(p.stockQty) },
  stockCost: { label: 'At cost', cell: (p) => formatKes(p.stockCostKes) },
  cover: { label: 'Cover', cell: (p) => (p.daysOfCover === null ? '—' : `${n0.format(p.daysOfCover)} d`) },
  lastSold: {
    label: 'Last sold',
    cell: (p) => (p.lastSoldAt ? `${fmtDate(p.lastSoldAt)} (${n0.format(p.daysSinceLastSale ?? 0)} d ago)` : 'Never in period'),
  },
  trend: { label: 'Trend', cell: (p) => <Change pct={p.trendPct} /> },
  reorder: {
    label: 'Reorder',
    cell: (p) => n0.format(Math.max(0, Math.ceil((p.unitsPerWeek / 7) * 60 - p.stockQty))),
  },
  sellThrough: { label: 'Sell-through', cell: (p) => `${n0.format(p.sellThroughPct)}%` },
  avgVsList: {
    label: 'Sold at / list',
    cell: (p) => (p.avgPriceKes === null ? '—' : `${formatKes(p.avgPriceKes)} / ${formatKes(p.listPriceKes)}`),
  },
}

function ProductTable({ rows, cols, total = 0 }: { rows: ProductVelocity[]; cols: ProductCol[]; total?: number }) {
  return (
    <MiniTable
      cols={[{ label: 'Product' }, ...cols.map((c) => ({ label: PRODUCT_COLS[c].label, num: true }))]}
      rows={rows.map((p) => [
        <ProductLink key="p" id={p.productId}>
          {p.name}
        </ProductLink>,
        ...cols.map((c) => PRODUCT_COLS[c].cell(p, total)),
      ])}
    />
  )
}

function ComparisonTable({ kpis, prev, label }: { kpis: Kpis; prev: Kpis | null; label: string }) {
  if (!prev) return <p className="text-xs text-[var(--viz-muted)]">No earlier period to compare with for this range.</p>
  const rows: Array<[string, (k: Kpis) => number, 'kes' | 'num' | 'pct', boolean]> = [
    ['Revenue', (k) => k.revenueKes, 'kes', true],
    ['Gross profit', (k) => k.profitKes, 'kes', true],
    ['Margin', (k) => k.marginPct, 'pct', true],
    ['Units sold', (k) => k.unitsSold, 'num', true],
    ['Sales', (k) => k.transactions, 'num', true],
    ['Average sale', (k) => k.avgSaleKes, 'kes', true],
    ['Buyers', (k) => k.buyers, 'num', true],
    ['Restock spend', (k) => k.restockSpendKes, 'kes', false],
  ]
  const f = (v: number, kind: 'kes' | 'num' | 'pct') => (kind === 'kes' ? formatKes(v) : kind === 'pct' ? `${n1.format(v)}%` : n0.format(v))
  return (
    <MiniTable
      cols={[{ label: 'Metric' }, { label: 'This period', num: true }, { label: label ? 'Before' : 'Previous', num: true }, { label: 'Change', num: true }]}
      rows={rows.map(([name, get, kind, upIsGood]) => [
        name,
        f(get(kpis), kind),
        f(get(prev), kind),
        <Change key="c" pct={delta(get(kpis), get(prev))} upIsGood={upIsGood} />,
      ])}
    />
  )
}

function ChannelTable({ a }: { a: Analytics }) {
  const total = a.kpis.revenueKes
  return (
    <MiniTable
      cols={[
        { label: 'Channel' },
        { label: 'Revenue', num: true },
        { label: 'Share', num: true },
        { label: 'Margin', num: true },
        { label: 'Units', num: true },
        { label: 'Sales', num: true },
        { label: 'Avg sale', num: true },
        { label: 'Buyers', num: true },
        { label: 'Discounts', num: true },
      ]}
      rows={a.details.channels.map((c) => [
        c.name,
        formatKes(c.revenueKes),
        share(c.revenueKes, total),
        marginOf(c.profitKes, c.revenueKes),
        n0.format(c.unitsSold),
        n0.format(c.transactions),
        formatKes(c.transactions ? c.revenueKes / c.transactions : 0),
        n0.format(c.buyers),
        formatKes(c.discountKes),
      ])}
      empty="No sales in this period."
    />
  )
}

function BuyersTable({ rows }: { rows: BuyerDetail[] }) {
  return (
    <MiniTable
      cols={[
        { label: 'Buyer' },
        { label: 'Spend', num: true },
        { label: 'Units', num: true },
        { label: 'Sales', num: true },
        { label: 'Last bought', num: true },
        { label: 'Type', num: true },
      ]}
      rows={rows.map((b) => [
        <span key="b">
          {b.name}
          <Muted> · {b.channels.map((c) => c.replace(' sale', '')).join(' + ')}</Muted>
        </span>,
        formatKes(b.revenueKes),
        n0.format(b.units),
        n0.format(b.baskets),
        fmtDate(b.lastAt),
        b.returning ? 'Returning' : 'New',
      ])}
      empty="No named buyers in this period."
    />
  )
}

function VariantsTable({ rows }: { rows: Analytics['details']['variants'] }) {
  return (
    <MiniTable
      cols={[{ label: 'Product' }, { label: 'Variant' }, { label: 'Units', num: true }, { label: 'Revenue', num: true }, { label: 'In stock', num: true }]}
      rows={rows.map((v) => [
        <ProductLink key="p" id={v.productId}>
          {v.name}
        </ProductLink>,
        v.variant ?? <Muted>—</Muted>,
        n0.format(v.unitsSold),
        formatKes(v.revenueKes),
        v.stockQty === null ? <Muted>—</Muted> : n0.format(v.stockQty),
      ])}
    />
  )
}

function BasketTable({ rows, compact = false }: { rows: Basket[]; compact?: boolean }) {
  return (
    <MiniTable
      cols={[
        { label: 'Day', num: true },
        { label: 'Buyer' },
        ...(compact ? [] : [{ label: 'Channel' }]),
        { label: 'Units', num: true },
        { label: 'Value', num: true },
        ...(compact ? [] : [{ label: 'Order' }]),
      ]}
      rows={rows.map((b) => [
        fmtDay(b.date),
        b.buyer ?? <Muted>Unnamed</Muted>,
        ...(compact ? [] : [b.channels.join(' + ')]),
        n0.format(b.units),
        formatKes(b.valueKes),
        ...(compact
          ? []
          : [
              b.orders.length ? (
                <span key="o" className="flex flex-wrap gap-x-2">
                  {b.orders.map((o) => (
                    <Link key={o.id} href={`/admin/orders/${o.id}`} className="underline underline-offset-2 hover:opacity-70">
                      {o.orderNumber}
                    </Link>
                  ))}
                </span>
              ) : (
                <Muted key="o">Manual</Muted>
              ),
            ]),
      ])}
    />
  )
}

function BandMeters({ items }: { items: Array<{ name: string; value: number }> }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <Meter key={i.name} label={i.name} value={i.value} max={total} detail={`${n0.format(i.value)} · ${share(i.value, total)}`} />
      ))}
    </div>
  )
}

function SkuTable({ rows }: { rows: SkuRow[] }) {
  return (
    <MiniTable
      cols={[{ label: 'Product' }, { label: 'Variant' }, { label: 'In stock', num: true }, { label: 'Threshold', num: true }]}
      rows={rows.slice(0, 25).map((s, i) => [
        <ProductLink key={`p${i}`} id={s.productId}>
          {s.name}
        </ProductLink>,
        s.variant ?? <Muted>—</Muted>,
        n0.format(s.stockQty),
        n0.format(s.threshold),
      ])}
      empty="None."
    />
  )
}

function ClassSummary({ products }: { products: ProductVelocity[] }) {
  const keys = Object.keys(CLASS_META) as Array<keyof typeof CLASS_META>
  return (
    <MiniTable
      cols={[
        { label: 'Speed' },
        { label: 'Products', num: true },
        { label: 'Units sold', num: true },
        { label: 'Revenue', num: true },
        { label: 'Stock units', num: true },
        { label: 'Stock at cost', num: true },
      ]}
      rows={keys
        .map((k) => ({ k, rows: products.filter((p) => p.velocityClass === k) }))
        .filter((x) => x.rows.length > 0)
        .map(({ k, rows }) => [
          <span key="k" className="flex items-center gap-1.5">
            <span aria-hidden style={{ color: CLASS_META[k].color }}>
              {CLASS_META[k].icon}
            </span>
            {CLASS_META[k].label}
          </span>,
          n0.format(rows.length),
          n0.format(rows.reduce((s, p) => s + p.unitsSold, 0)),
          formatKes(rows.reduce((s, p) => s + p.revenueKes, 0)),
          n0.format(rows.reduce((s, p) => s + p.stockQty, 0)),
          formatKes(rows.reduce((s, p) => s + p.stockCostKes, 0)),
        ])}
    />
  )
}

function DiscountSections({ a }: { a: Analytics }) {
  const disc = a.details.discounts
  return (
    <>
      <DetailSection title="Discounts by product" note={`${formatKes(disc.totalKes)} off ${formatKes(disc.grossKes)} of discounted sales`}>
        <MiniTable
          cols={[{ label: 'Product' }, { label: 'Discount', num: true }, { label: 'Lines', num: true }, { label: 'Units', num: true }]}
          rows={disc.byProduct.map((p) => [
            <ProductLink key="p" id={p.productId}>
              {p.name}
            </ProductLink>,
            formatKes(p.valueKes),
            n0.format(p.count ?? 0),
            n0.format(p.units),
          ])}
          empty="No discounts recorded this period."
        />
      </DetailSection>
      <DetailSection title="Discounts by buyer">
        <MiniTable
          cols={[{ label: 'Buyer' }, { label: 'Discount', num: true }, { label: 'Lines', num: true }]}
          rows={disc.byBuyer.map((b) => [b.name, formatKes(b.value), n0.format(b.secondary ?? 0)])}
          empty="No discounts recorded this period."
        />
      </DetailSection>
    </>
  )
}

function BuyerDetails({ a, buyersTable }: { a: Analytics; buyersTable: React.ReactNode }) {
  const d = a.details
  const named = d.buyers
  return (
    <div className="space-y-5">
      <FigGrid>
        <Fig label="New buyers" value={n0.format(a.buyerMix.newBuyers)} sub={formatKes(d.buyerRevenueSplit.newKes)} />
        <Fig label="Returning buyers" value={n0.format(a.buyerMix.returningBuyers)} sub={formatKes(d.buyerRevenueSplit.returningKes)} />
        <Fig label="Bought on 2+ days" value={n0.format(a.buyerMix.repeatWithinRange)} />
        <Fig label="Spend per buyer" value={formatKes(a.kpis.buyers ? (a.kpis.revenueKes - d.buyerRevenueSplit.anonymousKes) / a.kpis.buyers : 0)} />
        <Fig label="Unnamed sales" value={formatKes(d.buyerRevenueSplit.anonymousKes)} sub="No buyer name or email recorded" />
      </FigGrid>
      <ShareBar
        format={formatKes}
        items={[
          { name: 'New', value: d.buyerRevenueSplit.newKes, color: VIZ[0] },
          { name: 'Returning', value: d.buyerRevenueSplit.returningKes, color: VIZ[1] },
          { name: 'Unnamed', value: d.buyerRevenueSplit.anonymousKes, color: 'var(--viz-muted)' },
        ]}
      />
      {buyersTable ? (
        <DetailSection title="Top buyers this period">{buyersTable}</DetailSection>
      ) : (
        <DetailGrid>
          <DetailSection title="Top returning buyers">
            <BuyersTable rows={named.filter((b) => b.returning).slice(0, 10)} />
          </DetailSection>
          <DetailSection title="Top new buyers">
            <BuyersTable rows={named.filter((b) => !b.returning).slice(0, 10)} />
          </DetailSection>
        </DetailGrid>
      )}
    </div>
  )
}

function RestockDetails({ a, compact = false }: { a: Analytics; compact?: boolean }) {
  const r = a.details.restocks
  return (
    <div className="space-y-5">
      {!compact && (
        <FigGrid>
          <Fig label="Spend" value={formatKes(a.kpis.restockSpendKes)} />
          <Fig label="Units received" value={n0.format(a.kpis.unitsIn)} />
          <Fig label="Avg cost per unit" value={formatKes(a.kpis.unitsIn ? a.kpis.restockSpendKes / a.kpis.unitsIn : 0)} />
          <Fig label="Suppliers" value={n0.format(r.bySupplier.filter((s) => s.name !== 'Not recorded').length)} />
        </FigGrid>
      )}
      <DetailGrid>
        <DetailSection title="Restocked products">
          <MiniTable
            cols={[{ label: 'Product' }, { label: 'Units', num: true }, { label: 'Spend', num: true }, { label: 'Deliveries', num: true }]}
            rows={r.byProduct.map((p) => [
              <ProductLink key="p" id={p.productId}>
                {p.name}
              </ProductLink>,
              n0.format(p.units),
              formatKes(p.valueKes),
              n0.format(p.count ?? 0),
            ])}
            empty="No restocks this period."
          />
        </DetailSection>
        <DetailSection title="By supplier">
          <MiniTable
            cols={[{ label: 'Supplier' }, { label: 'Spend', num: true }, { label: 'Units', num: true }]}
            rows={r.bySupplier.map((s) => [s.name, formatKes(s.value), n0.format(s.secondary ?? 0)])}
            empty="No restocks this period."
          />
        </DetailSection>
        <DetailSection title="Latest deliveries" wide>
          <MiniTable
            cols={[
              { label: 'Date', num: true },
              { label: 'Product' },
              { label: 'Variant' },
              { label: 'Units', num: true },
              { label: 'Unit cost', num: true },
              { label: 'Supplier' },
            ]}
            rows={r.recent.map((x, i) => [
              fmtDate(x.at),
              <ProductLink key={`p${i}`} id={x.productId}>
                {x.name}
              </ProductLink>,
              x.variant ?? <Muted>—</Muted>,
              n0.format(x.units),
              x.unitCostKes === null ? <Muted>—</Muted> : formatKes(x.unitCostKes),
              x.supplier ?? <Muted>—</Muted>,
            ])}
            empty="No restocks this period."
          />
        </DetailSection>
      </DetailGrid>
    </div>
  )
}

function StockDetails({ a, deadWithStock, skipSkus = false }: { a: Analytics; deadWithStock: ProductVelocity[]; skipSkus?: boolean }) {
  const d = a.details
  const inv = a.inventory
  return (
    <div className="space-y-5">
      <FigGrid>
        <Fig label="At cost" value={formatKes(inv.costValueKes)} />
        <Fig label="At retail" value={formatKes(inv.retailValueKes)} />
        <Fig label="Potential profit" value={formatKes(inv.retailValueKes - inv.costValueKes)} sub={marginOf(inv.retailValueKes - inv.costValueKes, inv.retailValueKes)} />
        <Fig label="Units" value={n0.format(inv.units)} sub={`${n0.format(inv.skus)} SKUs`} />
        <Fig label="Not selling (at cost)" value={formatKes(inv.deadStockCostKes)} tone={inv.deadStockCostKes ? 'var(--viz-warn)' : undefined} />
      </FigGrid>
      <DetailGrid>
        <DetailSection title="By category">
          <MiniTable
            cols={[{ label: 'Category' }, { label: 'Units', num: true }, { label: 'At cost', num: true }, { label: 'At retail', num: true }]}
            rows={d.stockByCategory.map((c) => [c.name, n0.format(c.units), formatKes(c.costKes), formatKes(c.retailKes)])}
          />
        </DetailSection>
        <DetailSection title="Most cash tied up">
          <MiniTable
            cols={[{ label: 'Product' }, { label: 'Units', num: true }, { label: 'At cost', num: true }, { label: 'At retail', num: true }]}
            rows={d.topStock.map((p) => [
              <ProductLink key="p" id={p.productId}>
                {p.name}
              </ProductLink>,
              n0.format(p.units),
              formatKes(p.costKes),
              formatKes(p.retailKes),
            ])}
          />
        </DetailSection>
        <DetailSection title="Dead stock" note="In stock with no sales this period">
          <ProductTable rows={deadWithStock.slice(0, 10)} cols={['stock', 'stockCost', 'lastSold']} />
        </DetailSection>
        {!skipSkus && (
          <DetailSection title={`Low and out of stock · ${d.skus.low.length + d.skus.out.length} SKUs`}>
            <SkuTable rows={[...d.skus.out, ...d.skus.low]} />
          </DetailSection>
        )}
      </DetailGrid>
    </div>
  )
}

function RecipientTable({ a }: { a: Analytics }) {
  return (
    <MiniTable
      cols={[{ label: 'Recipient' }, { label: 'Reason' }, { label: 'Units', num: true }, { label: 'At cost', num: true }]}
      rows={a.details.giveaways.byRecipient.map((r) => [r.name, r.reason, n0.format(r.units), formatKes(r.costKes)])}
      empty="Nothing given away or written off this period."
    />
  )
}

function GiveawayDetails({ a }: { a: Analytics }) {
  const g = a.details.giveaways
  return (
    <DetailGrid>
      <DetailSection title="By reason">
        <MiniTable
          cols={[{ label: 'Reason' }, { label: 'Units', num: true }, { label: 'At cost', num: true }, { label: 'Share', num: true }]}
          rows={g.byReason.map((r) => [r.name, n0.format(r.units), formatKes(r.costKes), share(r.costKes, a.kpis.giveawayCostKes)])}
          empty="Nothing given away or written off this period."
        />
      </DetailSection>
      <DetailSection title="By product">
        <MiniTable
          cols={[{ label: 'Product' }, { label: 'Units', num: true }, { label: 'At cost', num: true }]}
          rows={g.byProduct.map((p) => [
            <ProductLink key="p" id={p.productId}>
              {p.name}
            </ProductLink>,
            n0.format(p.units),
            formatKes(p.valueKes),
          ])}
          empty="Nothing given away or written off this period."
        />
      </DetailSection>
      <DetailSection title="Recipients">
        <RecipientTable a={a} />
      </DetailSection>
    </DetailGrid>
  )
}

function OrderDetails({ a }: { a: Analytics }) {
  const o = a.details.orders
  const t = a.orderTotals
  return (
    <div className="space-y-5">
      <FigGrid>
        <Fig label="Placed" value={n0.format(t.count)} />
        <Fig label="Paid" value={n0.format(t.paidCount)} sub={`${share(t.paidCount, t.count)} of placed`} />
        <Fig label="Paid value" value={formatKes(t.paidRevenueKes)} />
        <Fig label="Average paid order" value={formatKes(t.paidCount ? t.paidRevenueKes / t.paidCount : 0)} />
      </FigGrid>
      <DetailGrid>
        <DetailSection title="By status">
          <MiniTable
            cols={[{ label: 'Status' }, { label: 'Orders', num: true }, { label: 'Value', num: true }]}
            rows={o.byStatus.map((s) => [s.name, n0.format(s.count), formatKes(s.valueKes)])}
            empty="No orders this period."
          />
        </DetailSection>
        <DetailSection title="By payment">
          <MiniTable
            cols={[{ label: 'Payment' }, { label: 'Orders', num: true }, { label: 'Value', num: true }]}
            rows={o.byPayment.map((s) => [s.name, n0.format(s.count), formatKes(s.valueKes)])}
            empty="No orders this period."
          />
        </DetailSection>
        <DetailSection title="Latest orders" wide>
          <MiniTable
            cols={[
              { label: 'Order' },
              { label: 'Placed', num: true },
              { label: 'Customer' },
              { label: 'Items', num: true },
              { label: 'Total', num: true },
              { label: 'Status' },
            ]}
            rows={o.recent.map((r) => [
              <Link key="o" href={`/admin/orders/${r.id}`} className="font-medium underline underline-offset-2 hover:opacity-70">
                {r.orderNumber}
              </Link>,
              fmtDateTime(r.at),
              r.who,
              n0.format(r.items),
              formatKes(r.totalKes),
              <span key="s">
                {r.status}
                <Muted> · {r.paymentStatus}</Muted>
              </span>,
            ])}
            empty="No orders this period."
          />
          <p className="mt-2 text-xs">
            <Link href="/admin/orders" className="underline underline-offset-2 hover:opacity-70">
              All orders →
            </Link>
          </p>
        </DetailSection>
      </DetailGrid>
    </div>
  )
}

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
