-- CreateTable
CREATE TABLE "PushupEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushupEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushupEntry_score_idx" ON "PushupEntry"("score");
