-- CreateIndex
CREATE UNIQUE INDEX "ShareRecipient_shareId_email_key" ON "ShareRecipient"("shareId", "email");
