ALTER TABLE "OdooConfig"
  ADD COLUMN "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sync_interval_minutes" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "next_due_at" TIMESTAMP(3),
  ADD COLUMN "last_partner_write_at" TIMESTAMP(3),
  ADD COLUMN "last_patient_write_at" TIMESTAMP(3),
  ADD COLUMN "last_success_at" TIMESTAMP(3),
  ADD COLUMN "last_error_at" TIMESTAMP(3),
  ADD COLUMN "last_error_message" TEXT,
  ADD COLUMN "locked_at" TIMESTAMP(3),
  ADD COLUMN "locked_by" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
