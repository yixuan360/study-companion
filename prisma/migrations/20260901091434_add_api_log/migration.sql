-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMsg" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ApiLog_createdAt_idx" ON "ApiLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_provider_model_idx" ON "ApiLog"("provider", "model");
