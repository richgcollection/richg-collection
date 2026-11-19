-- Google Sheet stock tracker sync.
ALTER TABLE "StockMovement" ADD COLUMN "sheetExportedAt" TIMESTAMP(3);

-- Everything already on the site is either in the sheet or has been reviewed;
-- only entries made from now on are sent to the sheet.
UPDATE "StockMovement" SET "sheetExportedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "SheetSyncRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SheetSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SheetSyncRun_createdAt_idx" ON "SheetSyncRun"("createdAt");
