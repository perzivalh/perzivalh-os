-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'video';

-- CreateIndex
CREATE INDEX "message_conversation_id_created_at_desc_idx" ON "Message"("conversation_id", "created_at" DESC);
