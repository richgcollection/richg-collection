-- Rename "county" to "town" on ShippingRate and Address (delivery pricing
-- moves from county-level to town-level granularity).
ALTER TABLE "ShippingRate" RENAME COLUMN "county" TO "town";
ALTER INDEX "ShippingRate_county_key" RENAME TO "ShippingRate_town_key";

ALTER TABLE "Address" RENAME COLUMN "county" TO "town";

-- Payment provider settings, editable from the admin dashboard instead of
-- only via hosting-provider environment variables.
CREATE TABLE "PaymentSettings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publicKey" TEXT,
    "secretKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentSettings_provider_key" ON "PaymentSettings"("provider");
