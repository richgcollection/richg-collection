-- CreateTable
CREATE TABLE "PushupChallengeState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "timerStartedAt" TIMESTAMP(3),
    "timerPausedElapsedMs" INTEGER,
    "winnerName" TEXT,
    "winnerScore" INTEGER,
    "winnerAnnouncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushupChallengeState_pkey" PRIMARY KEY ("id")
);
