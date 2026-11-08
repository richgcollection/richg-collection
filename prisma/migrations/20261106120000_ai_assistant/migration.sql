-- Admin AI assistant: provider, model and encrypted API key, edited from the dashboard.
CREATE TABLE "AssistantSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL DEFAULT 'claude-opus-5-5',
    "apiKeyEnc" TEXT,
    "baseUrl" TEXT,
    "allowActions" BOOLEAN NOT NULL DEFAULT true,
    "customInstructions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSettings_pkey" PRIMARY KEY ("id")
);
