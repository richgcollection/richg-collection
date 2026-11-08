import 'server-only'
import type { Prisma } from '@prisma/client'
import { CONTACT_EMAIL, PHONE_DISPLAY } from '@/lib/contact'
import { normalizePhone } from '@/lib/customers'
import { formatKes } from '@/lib/money'
import { markOrderPaid } from '@/lib/orders'
import { isPaystackConfigured, verifyTransaction } from '@/lib/paystack'
import { prisma } from '@/lib/prisma'
import { getBotProduct, listCategories, listProducts, matchTowns, reservationMinutes } from './catalog'
import { type BotCartLine, createBotOrder, priceLines } from './checkout'
import { type WaMessage, buttons, image, linkButton, list, text } from './whatsapp'

/**
 * The WhatsApp sales conversation. n8n posts every inbound message to
 * /api/bot/message; this works out the reply from the customer's saved
 * session and returns the WhatsApp messages for n8n to send.
 *
 * Reply ids (buttons and list rows) are the bot's commands:
 *   menu · cat:<slug>:<page> · search:<page> · prod:<id> · var:<id> · qty:<n>
 *   cart · shop · clear · checkout · saved_yes · saved_no · use_name
 *   town:<name> · town_custom · email_skip · pay · status · agent
 */

type Step = 'menu' | 'variant' | 'qty' | 'name' | 'town' | 'address' | 'email' | 'confirm' | 'payment' | 'paused'

type CheckoutDetails = { fullName?: string; town?: string; townCandidate?: string; line2?: string; email?: string }

export type BotState = {
  step: Step
  cart: BotCartLine[]
  productId?: string
  variantId?: string | null
  browse?: { categorySlug?: string; categoryName?: string; query?: string; page: number }
  checkout?: CheckoutDetails
  /** Details from the last completed checkout, offered again next time. */
  saved?: Required<Pick<CheckoutDetails, 'fullName' | 'town' | 'email'>> & { line2?: string }
  orderNumber?: string
  pausedUntil?: string
}

export type InboundMessage = {
  /** The customer's WhatsApp number, e.g. 254712345678. */
  from: string
  /** WhatsApp profile name, when Meta sends it. */
  profileName?: string | null
  /** Typed text, or the title of the tapped button/row. */
  text?: string | null
  /** Id of the tapped button or list row. */
  replyId?: string | null
}

const EMPTY_STATE: BotState = { step: 'menu', cart: [] }
const MAX_QTY_PER_LINE = 20
const GREETINGS = /^(hi|hey|hello|hallo|habari|niaje|sasa|start|menu|shop|0|main menu|home)\b/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const kes = (n: number) => formatKes(n)
const lineName = (l: { name: string; variantLabel: string | null }) => (l.variantLabel ? `${l.name} (${l.variantLabel})` : l.name)
const cartUnits = (cart: BotCartLine[]) => cart.reduce((sum, l) => sum + l.quantity, 0)

export type BotReply = {
  messages: WaMessage[]
  /** True when the customer has just asked for a person, so n8n can alert staff. */
  handover: boolean
}

export async function handleInbound(msg: InboundMessage): Promise<BotReply> {
  const phone = normalizePhone(msg.from)
  if (!phone) return { messages: [], handover: false }

  const session = await prisma.botSession.findUnique({ where: { phone } })
  const state: BotState = { ...EMPTY_STATE, ...((session?.state as BotState | null) ?? {}) }
  const ctx = { phone, profileName: msg.profileName?.trim() || session?.name || null }
  const wasPaused = state.step === 'paused'

  const replies = await route(state, ctx, msg)

  await prisma.botSession.upsert({
    where: { phone },
    create: { phone, name: ctx.profileName, state: state as unknown as Prisma.InputJsonValue },
    update: { name: ctx.profileName ?? undefined, state: state as unknown as Prisma.InputJsonValue },
  })
  return { messages: replies, handover: !wasPaused && state.step === 'paused' }
}

type Ctx = { phone: string; profileName: string | null }

async function route(state: BotState, ctx: Ctx, msg: InboundMessage): Promise<WaMessage[]> {
  const id = msg.replyId?.trim() || ''
  const typed = id ? '' : (msg.text ?? '').trim()

  // Handed over to a person: stay quiet until the pause ends or they ask for the menu.
  if (state.step === 'paused') {
    if (state.pausedUntil && new Date(state.pausedUntil) > new Date() && !/^(menu|shop)$/i.test(typed) && id !== 'menu') return []
    state.step = 'menu'
  }

  if (id) return handleReply(state, ctx, id)

  if (!typed) {
    return [text('Sorry, I can only read text messages and button taps here. Type *menu* to start shopping.')]
  }
  if (GREETINGS.test(typed)) return mainMenu(state, ctx, true)
  if (/^cart$/i.test(typed)) return showCart(state)
  if (/^(cancel|stop)$/i.test(typed)) {
    state.step = 'menu'
    state.checkout = undefined
    return mainMenu(state, ctx, false, 'No problem, checkout cancelled. Your cart is still saved.')
  }
  if (/^(help|agent|human|support|talk to (a )?person)$/i.test(typed)) return handOver(state)

  switch (state.step) {
    case 'qty':
      return addQuantity(state, Number.parseInt(typed, 10))
    case 'name':
      if (typed.length < 2) return [text('Please type your full name.')]
      state.checkout = { ...state.checkout, fullName: typed.slice(0, 80) }
      return askTown(state)
    case 'town':
      return chooseTown(state, typed)
    case 'address':
      state.checkout = { ...state.checkout, line2: typed.slice(0, 200) }
      return askEmail(state)
    case 'email':
      if (!EMAIL.test(typed)) {
        return [buttons('That email doesn’t look right. Type it again, or skip.', [{ id: 'email_skip', title: 'Skip' }])]
      }
      state.checkout = { ...state.checkout, email: typed.toLowerCase() }
      return confirmOrder(state)
    default:
      // Anything else typed is treated as a product search.
      return showProducts(state, { query: typed.slice(0, 60), page: 0 })
  }
}

async function handleReply(state: BotState, ctx: Ctx, id: string): Promise<WaMessage[]> {
  const [cmd, ...rest] = id.split(':')
  const arg = rest.join(':')

  switch (cmd) {
    case 'menu':
      return mainMenu(state, ctx, false)
    case 'cat': {
      const [slug, page] = arg.split(':')
      const categories = await listCategories()
      const category = categories.find((c) => c.slug === slug)
      return showProducts(state, { categorySlug: slug, categoryName: category?.name, page: Number(page) || 0 })
    }
    case 'search':
      return showProducts(state, { ...state.browse, page: Number(arg) || 0 })
    case 'prod':
      return showProduct(state, arg)
    case 'var':
      return pickVariant(state, arg)
    case 'qty':
      return addQuantity(state, Number(arg))
    case 'shop':
      return state.browse ? showProducts(state, state.browse) : mainMenu(state, ctx, false)
    case 'cart':
      return showCart(state)
    case 'clear':
      state.cart = []
      state.step = 'menu'
      return mainMenu(state, ctx, false, 'Cart cleared.')
    case 'checkout':
      return startCheckout(state, ctx)
    case 'saved_yes':
      state.checkout = { ...state.saved }
      return confirmOrder(state)
    case 'saved_no':
      state.checkout = {}
      return askName(state, ctx)
    case 'use_name':
      if (!ctx.profileName) return askName(state, ctx)
      state.checkout = { ...state.checkout, fullName: ctx.profileName }
      return askTown(state)
    case 'town': {
      const rate = await prisma.shippingRate.findUnique({ where: { town: arg } })
      if (!rate) return askTown(state)
      state.checkout = { ...state.checkout, town: rate.town }
      return askAddress(state)
    }
    case 'town_custom':
      if (!state.checkout?.townCandidate) return askTown(state)
      state.checkout = { ...state.checkout, town: state.checkout.townCandidate }
      return askAddress(state)
    case 'email_skip':
      // Paystack needs an email; this one just stands in when the customer has none.
      state.checkout = { ...state.checkout, email: `wa${ctx.phone}@richgcollection.com` }
      return confirmOrder(state)
    case 'pay':
      return placeOrder(state, ctx)
    case 'status':
      return paymentStatus(state)
    case 'agent':
      return handOver(state)
    default:
      return mainMenu(state, ctx, false)
  }
}

// ---------------------------------------------------------------- browsing

async function mainMenu(state: BotState, ctx: Ctx, greet: boolean, note?: string): Promise<WaMessage[]> {
  state.step = 'menu'
  state.browse = undefined
  const categories = await listCategories()
  const units = cartUnits(state.cart)
  const hello = greet
    ? `Hi${ctx.profileName ? ` ${ctx.profileName.split(' ')[0]}` : ''}! Welcome to *Rich G Collection*.`
    : note ?? 'What would you like to look at?'

  const rows = categories.slice(0, units > 0 ? 8 : 9).map((c) => ({
    id: `cat:${c.slug}:0`,
    title: c.name,
    description: `${c.count} item${c.count === 1 ? '' : 's'} in stock`,
  }))
  const extra = [
    ...(units > 0 ? [{ id: 'cart', title: `View cart (${units})`, description: 'Review items and check out' }] : []),
    { id: 'agent', title: 'Talk to us', description: 'Questions about sizes, delivery or an order' },
  ]

  return [
    list(
      `${greet && note ? `${note}\n\n` : ''}${hello}\n\nPick a category below, or just type what you’re looking for (e.g. _black shirt_).`,
      'Shop now',
      [
        { title: 'Categories', rows },
        { title: 'More', rows: extra },
      ],
    ),
  ]
}

async function showProducts(state: BotState, browse: NonNullable<BotState['browse']>): Promise<WaMessage[]> {
  state.step = 'menu'
  state.browse = browse
  const result = await listProducts(browse)

  if (result.total === 0) {
    return [
      buttons(
        browse.query
          ? `I couldn’t find anything in stock for “${browse.query}”. Try another word, or browse the categories.`
          : 'Nothing in stock here right now.',
        [{ id: 'menu', title: 'Categories' }, ...(state.cart.length ? [{ id: 'cart', title: 'View cart' }] : [])],
      ),
    ]
  }

  const rows = result.items.map((p) => ({
    id: `prod:${p.id}`,
    title: p.name,
    description: `${p.priceVaries ? 'From ' : ''}${kes(p.priceKes)}${p.variants.length > 1 ? ` · ${p.variants.filter((v) => v.available > 0).length} options` : ''}`,
  }))
  const nav = [
    ...(result.hasMore
      ? [{ id: browse.query ? `search:${result.page + 1}` : `cat:${browse.categorySlug}:${result.page + 1}`, title: 'More items ›', description: `Page ${result.page + 2}` }]
      : []),
    { id: 'menu', title: '‹ Categories' },
  ]
  const heading = browse.query ? `Results for “${browse.query}”` : browse.categoryName ?? 'Products'
  const pages = Math.ceil(result.total / 8)

  return [
    list(
      `*${heading}*${pages > 1 ? ` (page ${result.page + 1} of ${pages})` : ''}\nTap *View items* and pick one to see photos and sizes.`,
      'View items',
      [
        { title: 'Items', rows },
        { title: 'Navigate', rows: nav },
      ],
    ),
  ]
}

async function showProduct(state: BotState, productId: string): Promise<WaMessage[]> {
  const product = await getBotProduct(productId)
  if (!product || product.available <= 0) {
    return [buttons('Sorry, that item just sold out.', [{ id: 'shop', title: 'Keep shopping' }])]
  }
  state.productId = product.id
  state.variantId = null

  const caption = [
    `*${product.name}*`,
    `${product.priceVaries ? 'From ' : ''}${kes(product.priceKes)}`,
    product.shortDescription?.replace(/<[^>]*>/g, '').trim(),
  ]
    .filter(Boolean)
    .join('\n')
  const out: WaMessage[] = product.imageUrl ? [image(product.imageUrl, caption)] : [text(caption)]

  const options = product.variants.filter((v) => v.available > 0)
  if (product.variants.length === 0) {
    state.step = 'qty'
    out.push(qtyPrompt(product.available))
    return out
  }

  state.step = 'variant'
  out.push(
    list(
      'Choose your option:',
      'Choose',
      [
        {
          title: 'Options',
          rows: options.slice(0, 9).map((v) => ({
            id: `var:${v.id}`,
            title: v.label,
            description: `${kes(v.priceKes)}${v.available <= 3 ? ` · only ${v.available} left` : ''}`,
          })),
        },
        { rows: [{ id: 'shop', title: '‹ Back to items' }] },
      ],
    ),
  )
  return out
}

async function pickVariant(state: BotState, variantId: string): Promise<WaMessage[]> {
  const product = state.productId ? await getBotProduct(state.productId) : null
  const variant = product?.variants.find((v) => v.id === variantId)
  if (!product || !variant) return [buttons('Please pick the item again.', [{ id: 'shop', title: 'Keep shopping' }])]
  if (variant.available <= 0) {
    return [buttons(`Sorry, ${variant.label} just sold out.`, [{ id: `prod:${product.id}`, title: 'Other options' }])]
  }
  state.variantId = variant.id
  state.step = 'qty'
  return [qtyPrompt(variant.available - inCart(state, product.id, variant.id), `${product.name} – ${variant.label}`)]
}

function inCart(state: BotState, productId: string, variantId: string | null) {
  return state.cart.find((l) => l.productId === productId && l.variantId === variantId)?.quantity ?? 0
}

function qtyPrompt(available: number, label?: string): WaMessage {
  const max = Math.min(available, MAX_QTY_PER_LINE)
  const choices = [1, 2, 3].filter((n) => n <= max)
  if (choices.length === 0) {
    return buttons('You already have all the available stock of this in your cart.', [
      { id: 'cart', title: 'View cart' },
      { id: 'shop', title: 'Keep shopping' },
    ])
  }
  return buttons(
    `${label ? `*${label}*\n` : ''}How many would you like? Tap below or type a number${Number.isFinite(max) ? ` (up to ${max})` : ''}.`,
    choices.map((n) => ({ id: `qty:${n}`, title: String(n) })),
  )
}

async function addQuantity(state: BotState, qty: number): Promise<WaMessage[]> {
  if (!state.productId) return [buttons('Please pick an item first.', [{ id: 'shop', title: 'Browse' }])]
  if (!Number.isInteger(qty) || qty < 1) return [text('Please type a number, e.g. *2*.')]

  const product = await getBotProduct(state.productId)
  const variantId = state.variantId ?? null
  const variant = variantId ? product?.variants.find((v) => v.id === variantId) : null
  if (!product || (variantId && !variant)) return [buttons('That item is no longer available.', [{ id: 'shop', title: 'Keep shopping' }])]

  const available = (variant ? variant.available : product.available) - inCart(state, product.id, variantId)
  const max = Math.min(available, MAX_QTY_PER_LINE)
  if (max <= 0) return [qtyPrompt(0)]
  if (qty > max) return [text(`Only ${max} available. Please type a number up to ${max}.`)]

  const existing = state.cart.find((l) => l.productId === product.id && l.variantId === variantId)
  if (existing) existing.quantity += qty
  else state.cart.push({ productId: product.id, variantId, quantity: qty })
  state.step = 'menu'
  state.productId = undefined
  state.variantId = undefined

  const priced = await priceLines(state.cart)
  return [
    buttons(
      `Added ${qty} × ${product.name}${variant ? ` (${variant.label})` : ''} ✅\n\nCart: ${cartUnits(state.cart)} item(s) · ${kes(priced.subtotalKes)}`,
      [
        { id: 'checkout', title: 'Checkout' },
        { id: 'shop', title: 'Keep shopping' },
        { id: 'cart', title: 'View cart' },
      ],
    ),
  ]
}

// ---------------------------------------------------------------- cart & checkout

async function showCart(state: BotState): Promise<WaMessage[]> {
  if (state.cart.length === 0) {
    return [buttons('Your cart is empty.', [{ id: 'menu', title: 'Start shopping' }])]
  }
  const priced = await priceLines(state.cart)
  // Drop lines whose product disappeared since they were added.
  state.cart = priced.lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }))

  const lines = priced.lines.map(
    (l, i) =>
      `${i + 1}. ${lineName(l)} × ${l.quantity} – ${kes(l.lineTotalKes)}${l.quantity > l.available ? `\n   ⚠️ only ${l.available} available` : ''}`,
  )
  return [
    buttons(`*Your cart*\n${lines.join('\n')}\n\nSubtotal: *${kes(priced.subtotalKes)}*\nDelivery is added at checkout.`, [
      { id: 'checkout', title: 'Checkout' },
      { id: 'shop', title: 'Keep shopping' },
      { id: 'clear', title: 'Clear cart' },
    ]),
  ]
}

async function startCheckout(state: BotState, ctx: Ctx): Promise<WaMessage[]> {
  if (state.cart.length === 0) return showCart(state)
  const priced = await priceLines(state.cart)
  if (priced.lines.some((l) => l.quantity > l.available)) return fixShortages(state, priced.lines)

  if (state.saved) {
    const s = state.saved
    return [
      buttons(
        `Deliver to the same details as last time?\n\n${s.fullName}\n${s.town}${s.line2 ? `, ${s.line2}` : ''}\n${s.email.endsWith('@richgcollection.com') ? '' : s.email}`.trim(),
        [
          { id: 'saved_yes', title: 'Yes, same details' },
          { id: 'saved_no', title: 'New details' },
        ],
      ),
    ]
  }
  state.checkout = {}
  return askName(state, ctx)
}

function askName(state: BotState, ctx: Ctx): WaMessage[] {
  state.step = 'name'
  if (ctx.profileName) {
    return [buttons('What name should we put on the order? Tap below or type your full name.', [{ id: 'use_name', title: ctx.profileName }])]
  }
  return [text('What name should we put on the order? Please type your full name.')]
}

function askTown(state: BotState): WaMessage[] {
  state.step = 'town'
  return [text('Which town or area should we deliver to? Type it, e.g. *Westlands* or *Nakuru*.')]
}

async function chooseTown(state: BotState, typed: string): Promise<WaMessage[]> {
  const matches = await matchTowns(typed)
  const exact = matches.find((m) => m.town.toLowerCase() === typed.toLowerCase())
  if (exact) {
    state.checkout = { ...state.checkout, town: exact.town }
    return askAddress(state)
  }
  state.checkout = { ...state.checkout, townCandidate: typed.slice(0, 60) }
  if (matches.length === 0) {
    return [
      buttons(`I don’t have a delivery rate for “${typed}” yet. Use it anyway (standard delivery fee applies), or type a nearby town.`, [
        { id: 'town_custom', title: 'Use this town' },
      ]),
    ]
  }
  return [
    list('Pick your delivery area:', 'Choose area', [
      { title: 'Delivery areas', rows: matches.map((m) => ({ id: `town:${m.town}`, title: m.town, description: `Delivery ${kes(m.rateKes)}` })) },
      { rows: [{ id: 'town_custom', title: 'Other (as typed)', description: 'Standard delivery fee' }] },
    ]),
  ]
}

function askAddress(state: BotState): WaMessage[] {
  state.step = 'address'
  return [text(`Delivering to *${state.checkout?.town}*. Please type the street, building or a landmark so the rider can find you.`)]
}

function askEmail(state: BotState): WaMessage[] {
  state.step = 'email'
  return [buttons('Last step: type your email for the payment receipt, or skip.', [{ id: 'email_skip', title: 'Skip' }])]
}

async function confirmOrder(state: BotState): Promise<WaMessage[]> {
  const c = state.checkout
  if (!c?.fullName || !c.town || !c.email) return askTown(state)
  const priced = await priceLines(state.cart)
  if (priced.lines.length === 0) return showCart(state)
  const rate =
    (await prisma.shippingRate.findUnique({ where: { town: c.town } })) ??
    (await prisma.shippingRate.findUnique({ where: { town: 'DEFAULT' } }))
  const shipping = rate?.rateKes ?? 0

  state.step = 'confirm'
  const lines = priced.lines.map((l) => `• ${lineName(l)} × ${l.quantity} – ${kes(l.lineTotalKes)}`)
  return [
    buttons(
      [
        '*Order summary*',
        ...lines,
        '',
        `Subtotal: ${kes(priced.subtotalKes)}`,
        `Delivery (${c.town}): ${kes(shipping)}`,
        `*Total: ${kes(priced.subtotalKes + shipping)}*`,
        '',
        `${c.fullName}\n${c.town}${c.line2 ? `, ${c.line2}` : ''}`,
      ].join('\n'),
      [
        { id: 'pay', title: 'Pay now' },
        { id: 'cart', title: 'Edit cart' },
        { id: 'saved_no', title: 'Change details' },
      ],
    ),
  ]
}

async function placeOrder(state: BotState, ctx: Ctx): Promise<WaMessage[]> {
  // A second tap on an old "Pay now" button: report on the order already placed.
  if (state.step === 'payment' && state.orderNumber) return paymentStatus(state)
  const c = state.checkout
  if (state.step !== 'confirm' || !c?.fullName || !c.town || !c.email) {
    return [buttons('Let\u2019s start checkout again.', [{ id: 'checkout', title: 'Checkout' }])]
  }
  if (state.cart.length === 0) return showCart(state)

  const result = await createBotOrder({
    phone: ctx.phone,
    fullName: c.fullName,
    email: c.email,
    town: c.town,
    line2: c.line2,
    lines: state.cart,
  })

  if (!result.ok) {
    if (result.reason === 'empty') {
      state.cart = []
      return showCart(state)
    }
    return fixShortages(state, (await priceLines(state.cart)).lines)
  }

  state.saved = { fullName: c.fullName, town: c.town, email: c.email, line2: c.line2 }
  state.cart = []
  state.checkout = undefined
  state.orderNumber = result.orderNumber
  state.step = 'payment'

  if (!result.paymentUrl) {
    return [
      text(
        `Thank you! Order *${result.orderNumber}* (${kes(result.totalKes)}) is placed. Online payment isn\u2019t available right now, so our team will contact you to complete payment.`,
      ),
    ]
  }
  return [
    linkButton(
      `Order *${result.orderNumber}*\nTotal: *${kes(result.totalKes)}* (incl. ${kes(result.shippingKes)} delivery)\n\nTap below to pay securely with M-Pesa or card via Paystack. Your items are held for ${reservationMinutes()} minutes.`,
      `Pay ${kes(result.totalKes)}`,
      result.paymentUrl,
    ),
    buttons('You\u2019ll get a confirmation here as soon as payment goes through.', [
      { id: 'status', title: 'I\u2019ve paid' },
      { id: 'agent', title: 'Need help' },
    ]),
  ]
}

async function fixShortages(
  state: BotState,
  lines: { productId: string; variantId: string | null; quantity: number; available: number; name: string; variantLabel: string | null }[],
): Promise<WaMessage[]> {
  const notes: string[] = []
  state.cart = lines
    .map((l) => {
      if (l.quantity <= l.available) return l
      notes.push(l.available > 0 ? `• ${lineName(l)}: only ${l.available} left, quantity reduced` : `• ${lineName(l)}: sold out, removed`)
      return { ...l, quantity: l.available }
    })
    .filter((l) => l.quantity > 0)
    .map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }))
  state.step = 'menu'
  return [text(`Sorry, stock changed while you were shopping:\n${notes.join('\n')}`), ...(await showCart(state))]
}

async function paymentStatus(state: BotState): Promise<WaMessage[]> {
  if (!state.orderNumber) return [buttons('You don’t have an open order.', [{ id: 'menu', title: 'Start shopping' }])]
  const order = await prisma.order.findUnique({ where: { orderNumber: state.orderNumber } })
  if (!order) return [buttons('I couldn’t find that order.', [{ id: 'agent', title: 'Talk to us' }])]
  if (order.paymentStatus === 'PAID') {
    return [buttons(`Order *${order.orderNumber}* is paid ✅ We’re preparing it for delivery.`, [{ id: 'menu', title: 'Shop more' }])]
  }

  // Same check as the website's success page, for when the Paystack webhook is late.
  if (await isPaystackConfigured()) {
    try {
      const v = await verifyTransaction(order.orderNumber)
      if (v.data.status === 'success' && v.data.amount === Math.round(order.totalKes * 100)) {
        // markOrderPaid triggers the "payment received" WhatsApp message, so nothing to add here.
        if (await markOrderPaid(order.id)) return []
      }
    } catch {
      // Not paid yet, or Paystack unreachable: fall through.
    }
  }
  return [
    buttons(`I haven’t received payment for *${order.orderNumber}* yet. If you’ve just paid, give it a minute and check again.`, [
      { id: 'status', title: 'Check again' },
      { id: 'agent', title: 'Talk to us' },
    ]),
  ]
}

function handOver(state: BotState): WaMessage[] {
  state.step = 'paused'
  state.pausedUntil = new Date(Date.now() + 2 * 60 * 60_000).toISOString()
  const contact = process.env.BOT_SUPPORT_TEXT || `Call us on ${PHONE_DISPLAY} or email ${CONTACT_EMAIL}.`
  return [text(`Sure, a member of our team will get back to you. ${contact}\n\nType *menu* any time to continue shopping.`)]
}

