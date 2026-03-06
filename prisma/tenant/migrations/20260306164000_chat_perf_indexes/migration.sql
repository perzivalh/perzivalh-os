CREATE INDEX IF NOT EXISTS "conversation_list_order_idx"
ON "Conversation" ("last_message_at" DESC, "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "conversation_status_order_idx"
ON "Conversation" ("status", "last_message_at" DESC, "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "Conversation_phone_e164_idx"
ON "Conversation" ("phone_e164");

CREATE INDEX IF NOT EXISTS "ConversationTag_tag_id_idx"
ON "ConversationTag" ("tag_id");
