-- Admin AI assistant: long-term memory shared across conversations.
CREATE TABLE "AssistantMemory" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantMemory_createdAt_idx" ON "AssistantMemory"("createdAt");
