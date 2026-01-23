-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDatabase" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "db_url_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'whatsapp',
    "phone_number_id" TEXT NOT NULL,
    "verify_token" TEXT NOT NULL,
    "wa_token_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserControl" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branding" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "colors" JSONB,
    "timezone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogControl" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "data_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TenantDatabase_tenant_id_key" ON "TenantDatabase"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_phone_number_id_key" ON "Channel"("phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserControl_email_key" ON "UserControl"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Branding_tenant_id_key" ON "Branding"("tenant_id");

-- CreateIndex
CREATE INDEX "Channel_tenant_id_idx" ON "Channel"("tenant_id");

-- CreateIndex
CREATE INDEX "Channel_provider_idx" ON "Channel"("provider");

-- CreateIndex
CREATE INDEX "UserControl_tenant_id_idx" ON "UserControl"("tenant_id");

-- CreateIndex
CREATE INDEX "AuditLogControl_tenant_id_idx" ON "AuditLogControl"("tenant_id");

-- CreateIndex
CREATE INDEX "AuditLogControl_user_id_idx" ON "AuditLogControl"("user_id");

-- CreateIndex
CREATE INDEX "AuditLogControl_action_idx" ON "AuditLogControl"("action");

-- AddForeignKey
ALTER TABLE "TenantDatabase" ADD CONSTRAINT "TenantDatabase_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserControl" ADD CONSTRAINT "UserControl_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branding" ADD CONSTRAINT "Branding_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogControl" ADD CONSTRAINT "AuditLogControl_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogControl" ADD CONSTRAINT "AuditLogControl_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserControl"("id") ON DELETE SET NULL ON UPDATE CASCADE;
