-- CreateIndex
CREATE INDEX IF NOT EXISTS "message_conversation_id_created_at_desc_idx" ON "Message"("conversation_id", "created_at" DESC);
