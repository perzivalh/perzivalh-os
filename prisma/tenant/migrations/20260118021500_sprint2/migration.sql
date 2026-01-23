-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('phone', 'ci', 'manual');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "CampaignMessageStatus" AS ENUM ('queued', 'sent', 'failed');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "partner_id" INTEGER,
ADD COLUMN     "patient_id" INTEGER,
ADD COLUMN     "verification_method" "VerificationMethod",
ADD COLUMN     "verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "hours_text" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT NOT NULL,
    "price_bob" INTEGER NOT NULL,
    "duration_min" INTEGER,
    "image_url" TEXT,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBranch" (
    "service_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceBranch_pkey" PRIMARY KEY ("service_id","branch_id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT,
    "body_preview" TEXT NOT NULL,
    "variables_schema" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "audience_filter" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "created_by_user_id" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMessage" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "wa_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "status" "CampaignMessageStatus" NOT NULL DEFAULT 'queued',
    "error_json" JSONB,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "CampaignMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "wa_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "display_name" TEXT,
    "ci_digits" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");

-- CreateIndex
CREATE INDEX "Service_is_featured_idx" ON "Service"("is_featured");

-- CreateIndex
CREATE UNIQUE INDEX "Template_name_key" ON "Template"("name");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "CampaignMessage_campaign_id_idx" ON "CampaignMessage"("campaign_id");

-- CreateIndex
CREATE INDEX "CampaignMessage_status_idx" ON "CampaignMessage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_wa_id_key" ON "Prospect"("wa_id");

-- CreateIndex
CREATE INDEX "Prospect_created_at_idx" ON "Prospect"("created_at");

-- CreateIndex
CREATE INDEX "Conversation_partner_id_idx" ON "Conversation"("partner_id");

-- AddForeignKey
ALTER TABLE "ServiceBranch" ADD CONSTRAINT "ServiceBranch_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBranch" ADD CONSTRAINT "ServiceBranch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

