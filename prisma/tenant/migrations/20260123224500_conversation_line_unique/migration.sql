DROP INDEX IF EXISTS "Conversation_wa_id_key";

CREATE UNIQUE INDEX "Conversation_wa_id_phone_number_id_key"
ON "Conversation" ("wa_id", "phone_number_id");
