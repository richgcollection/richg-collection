-- AlterTable
ALTER TABLE "Order" ADD COLUMN "customerId" TEXT;

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_occurredAt_idx" ON "OrderStatusEvent"("orderId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: link existing website orders to customers using the same phone
-- normalization as normalizePhone() in src/lib/customers.ts. (A correlated
-- subquery, because an UPDATE's FROM-clause LATERAL can't reference "o".)
UPDATE "Order" o
SET "customerId" = c."id"
FROM "Customer" c
WHERE c."phone" = (
  SELECT CASE
      WHEN p.d LIKE '254%' THEN p.d
      WHEN p.d LIKE '0%' THEN '254' || substr(p.d, 2)
      WHEN length(p.d) = 9 THEN '254' || p.d
      ELSE p.d
    END
  FROM (SELECT regexp_replace(COALESCE(o."guestPhone", ''), '\D', '', 'g') AS d) p
  WHERE p.d <> ''
);
