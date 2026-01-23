ALTER TABLE "Conversation" ADD COLUMN "phone_number_id" TEXT;

ALTER TABLE "CampaignMessage" ADD COLUMN "phone_number_id" TEXT;

CREATE INDEX "Conversation_phone_number_id_idx" ON "Conversation" ("phone_number_id");
CREATE INDEX "CampaignMessage_phone_number_id_idx" ON "CampaignMessage" ("phone_number_id");
