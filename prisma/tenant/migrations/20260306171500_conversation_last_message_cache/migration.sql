ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "last_message_text" TEXT,
  ADD COLUMN IF NOT EXISTS "last_message_type" TEXT,
  ADD COLUMN IF NOT EXISTS "last_message_direction" TEXT;

UPDATE "Conversation" c
SET
  "last_message_text" = m."text",
  "last_message_type" = m."type",
  "last_message_direction" = m."direction"
FROM (
  SELECT DISTINCT ON ("conversation_id")
    "conversation_id",
    "text",
    "type"::text AS "type",
    "direction"::text AS "direction"
  FROM "Message"
  ORDER BY "conversation_id", "created_at" DESC
) m
WHERE m."conversation_id" = c."id";
