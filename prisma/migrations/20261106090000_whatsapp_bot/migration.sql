-- WhatsApp sales bot: order channel, conversation sessions, and an index for stock reservations.
ALTER TABLE "Order" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'WEBSITE';

CREATE INDEX "Order_status_paymentStatus_createdAt_idx" ON "Order"("status", "paymentStatus", "createdAt");

CREATE TABLE "BotSession" (
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("phone")
);
