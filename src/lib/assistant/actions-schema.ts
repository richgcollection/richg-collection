import { z } from 'zod'

/**
 * Inputs for the changes the assistant can propose. Shared by the tool
 * definitions (what the model may ask for) and the confirm server action
 * (which re-validates whatever the browser sends back).
 */

const NON_SALE_OUT = ['MANUAL_SALE', 'DAMAGE', 'REWARD', 'INFLUENCER', 'ADJUSTMENT'] as const
const FULFILLMENT = ['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'FAILED'] as const

export const ACTION_SCHEMAS = {
  restock: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1).optional(),
    quantity: z.number().int().min(1),
    unitCostKes: z.number().int().min(0).optional().describe('Cost per unit paid to the supplier.'),
    supplier: z.string().max(200).optional(),
    note: z.string().max(500).optional(),
  }),
  stock_out: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          variantId: z.string().min(1).optional(),
          quantity: z.number().int().min(1),
          unitPriceKes: z.number().int().min(0).optional().describe('Selling price per unit (manual sales).'),
          discountKes: z.number().int().min(0).optional().describe('Total discount on the line, not per unit.'),
        }),
      )
      .min(1)
      .max(20),
    reason: z.enum(NON_SALE_OUT),
    counterparty: z.string().max(200).optional().describe('Buyer, influencer or recipient name.'),
    note: z.string().max(500).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('YYYY-MM-DD (Kenya time) the stock left. Default today.'),
  }),
  order_status: z.object({
    orderNumber: z.string().min(1),
    status: z.enum(FULFILLMENT),
  }),
  mark_paid: z.object({
    orderNumber: z.string().min(1),
  }),
} as const

export type ActionName = keyof typeof ACTION_SCHEMAS

export type AssistantAction = {
  [K in ActionName]: { action: K; input: z.infer<(typeof ACTION_SCHEMAS)[K]> }
}[ActionName]

export const assistantActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('restock'), input: ACTION_SCHEMAS.restock }),
  z.object({ action: z.literal('stock_out'), input: ACTION_SCHEMAS.stock_out }),
  z.object({ action: z.literal('order_status'), input: ACTION_SCHEMAS.order_status }),
  z.object({ action: z.literal('mark_paid'), input: ACTION_SCHEMAS.mark_paid }),
])
