-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "inviteClaimedAt" TIMESTAMP(3),
ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteSentAt" TIMESTAMP(3),
ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "inviteTokenHash" TEXT;

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_scope_ipHash_createdAt_idx" ON "LoginAttempt"("scope", "ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_scope_emailHash_ipHash_createdAt_idx" ON "LoginAttempt"("scope", "emailHash", "ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_inviteTokenHash_key" ON "Affiliate"("inviteTokenHash");

