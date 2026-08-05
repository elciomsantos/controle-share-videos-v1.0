-- CreateIndex
CREATE INDEX "File_shareId_idx" ON "File"("shareId");

-- CreateIndex
CREATE INDEX "Share_expiration_idx" ON "Share"("expiration");

-- CreateIndex
CREATE INDEX "Share_creatorId_uploadLocked_expiration_idx" ON "Share"("creatorId", "uploadLocked", "expiration");

-- CreateIndex
CREATE INDEX "ShareRecipient_shareId_idx" ON "ShareRecipient"("shareId");

-- CreateIndex
CREATE INDEX "User_isActivated_createdAt_idx" ON "User"("isActivated", "createdAt");
