-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'text',
    "rawContent" TEXT NOT NULL,
    "url" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "domain" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "mentionCount" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GraphEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NodeSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "metadata" JSONB,
    CONSTRAINT "NodeSource_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NodeSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MergeReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Source_createdAt_idx" ON "Source"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNode_name_key" ON "GraphNode"("name");

-- CreateIndex
CREATE INDEX "GraphNode_domain_idx" ON "GraphNode"("domain");

-- CreateIndex
CREATE INDEX "GraphEdge_fromNodeId_idx" ON "GraphEdge"("fromNodeId");

-- CreateIndex
CREATE INDEX "GraphEdge_toNodeId_idx" ON "GraphEdge"("toNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphEdge_fromNodeId_toNodeId_relation_key" ON "GraphEdge"("fromNodeId", "toNodeId", "relation");

-- CreateIndex
CREATE INDEX "NodeSource_sourceId_idx" ON "NodeSource"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeSource_nodeId_sourceId_key" ON "NodeSource"("nodeId", "sourceId");

-- CreateIndex
CREATE INDEX "MergeReview_status_type_idx" ON "MergeReview"("status", "type");

