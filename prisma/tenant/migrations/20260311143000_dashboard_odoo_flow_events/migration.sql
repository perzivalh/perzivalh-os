CREATE TYPE "AsistioSource" AS ENUM ('manual', 'odoo_auto');

ALTER TYPE "VerificationMethod" ADD VALUE IF NOT EXISTS 'odoo_sync_auto';

ALTER TABLE "Conversation"
  ADD COLUMN "phone_canonical" TEXT,
  ADD COLUMN "asistio_source" "AsistioSource",
  ADD COLUMN "asistio_updated_at" TIMESTAMP(3);

ALTER TABLE "OdooContact"
  ADD COLUMN "phone_canonical" TEXT,
  ADD COLUMN "partner_created_at" TIMESTAMP(3),
  ADD COLUMN "partner_write_at" TIMESTAMP(3),
  ADD COLUMN "patient_created_at" TIMESTAMP(3),
  ADD COLUMN "patient_write_at" TIMESTAMP(3),
  ADD COLUMN "first_seen_as_patient_at" TIMESTAMP(3);

CREATE TABLE "FlowEvent" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "wa_id" TEXT,
  "phone_number_id" TEXT,
  "flow_id" TEXT,
  "node_id" TEXT,
  "event_type" TEXT NOT NULL,
  "source" TEXT,
  "actor_user_id" TEXT,
  "payload_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlowEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FlowEvent"
  ADD CONSTRAINT "FlowEvent_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Conversation_patient_id_idx" ON "Conversation"("patient_id");
CREATE INDEX "Conversation_phone_canonical_idx" ON "Conversation"("phone_canonical");
CREATE INDEX "OdooContact_phone_canonical_idx" ON "OdooContact"("phone_canonical");
CREATE INDEX "FlowEvent_conversation_id_created_at_idx" ON "FlowEvent"("conversation_id", "created_at");
CREATE INDEX "FlowEvent_flow_id_event_type_created_at_idx" ON "FlowEvent"("flow_id", "event_type", "created_at");
CREATE INDEX "FlowEvent_phone_number_id_created_at_idx" ON "FlowEvent"("phone_number_id", "created_at");
CREATE INDEX "FlowEvent_event_type_created_at_idx" ON "FlowEvent"("event_type", "created_at");
