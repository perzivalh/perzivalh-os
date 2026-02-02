-- AlterTable
ALTER TABLE "AudienceSegment" ADD COLUMN     "last_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "primary_tag_id" TEXT;

-- AlterTable
ALTER TABLE "ConversationTag" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AudienceAutomationSetting" (
    "id" TEXT NOT NULL,
    "phone_number_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceAutomationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceTag" (
    "id" TEXT NOT NULL,
    "tag_id" TEXT,
    "segment_id" TEXT NOT NULL,
    "phone_number_id" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedContact" (
    "id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "name" TEXT,
    "city" TEXT,
    "tags_json" JSONB,
    "source" TEXT NOT NULL DEFAULT 'excel',
    "source_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AudienceAutomationSetting_phone_number_id_idx" ON "AudienceAutomationSetting"("phone_number_id");

-- CreateIndex
CREATE INDEX "AudienceTag_tag_id_idx" ON "AudienceTag"("tag_id");

-- CreateIndex
CREATE INDEX "AudienceTag_segment_id_idx" ON "AudienceTag"("segment_id");

-- CreateIndex
CREATE INDEX "AudienceTag_phone_number_id_idx" ON "AudienceTag"("phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceTag_tag_id_phone_number_id_key" ON "AudienceTag"("tag_id", "phone_number_id");

-- CreateIndex
CREATE INDEX "ImportedContact_phone_e164_idx" ON "ImportedContact"("phone_e164");

-- CreateIndex
CREATE INDEX "ImportedContact_source_idx" ON "ImportedContact"("source");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_primary_tag_id_fkey" FOREIGN KEY ("primary_tag_id") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceTag" ADD CONSTRAINT "AudienceTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceTag" ADD CONSTRAINT "AudienceTag_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "AudienceSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

