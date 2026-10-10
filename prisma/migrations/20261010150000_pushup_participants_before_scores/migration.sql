-- Participants are registered before their round, so the score starts empty.
ALTER TABLE "PushupEntry" ALTER COLUMN "score" DROP NOT NULL,
ADD COLUMN "scoredAt" TIMESTAMP(3);

-- Existing entries were scored when they were created.
UPDATE "PushupEntry" SET "scoredAt" = "createdAt" WHERE "score" IS NOT NULL;
