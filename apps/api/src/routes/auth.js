/**
 * Rutas de autenticación
 */
const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

const { authLimiter } = require("../middleware/rateLimit");
const { requireAuth } = require("../middleware/auth");
const { signUser } = require("../lib/auth");
const logger = require("../lib/logger");
const { getControlClient } = require("../control/controlClient");
const { resolveTenantContextById } = require("../tenancy/tenantResolver");

// POST /api/auth/login
router.post("/login", authLimiter, async (req, res) => {
    const email = (req.body?.email || "").toLowerCase().trim();
    const password = req.body?.password || "";

    if (!email || !password) {
        return res.status(400).json({ error: "missing_credentials" });
    }

    let controlUser = null;
    if (process.env.CONTROL_DB_URL) {
        try {
            const control = getControlClient();
            controlUser = await control.userControl.findUnique({ where: { email } });
        } catch (error) {
            logger.error("control.login_error", { message: error.message || error });
        }
    }

    if (controlUser) {
        if (!controlUser.is_active) {
            return res.status(401).json({ error: "invalid_credentials" });
        }
        const match = await bcrypt.compare(password, controlUser.password_hash);
        if (!match) {
            return res.status(401).json({ error: "invalid_credentials" });
        }

        // Usuario superadmin sin tenant
        if (!controlUser.tenant_id) {
            const token = signUser({
                id: controlUser.id,
                email: controlUser.email,
                name: controlUser.email,
                role: controlUser.role,
                tenant_id: null,
            });
            return res.json({
                token,
                user: {
                    id: controlUser.id,
                    name: controlUser.email,
                    email: controlUser.email,
                    role: controlUser.role,
                },
            });
        }

        // Usuario con tenant
        const tenantContext = await resolveTenantContextById(controlUser.tenant_id);
        if (!tenantContext) {
            return res.status(403).json({ error: "tenant_not_ready" });
        }
        const tenantUser = await tenantContext.prisma.user.findUnique({
            where: { email },
        });
        if (!tenantUser || !tenantUser.is_active) {
            return res.status(401).json({ error: "invalid_credentials" });
        }

        const token = signUser({
            id: tenantUser.id,
            email: tenantUser.email,
            name: tenantUser.name,
            role: tenantUser.role,
            tenant_id: controlUser.tenant_id,
        });
        return res.json({
            token,
            user: {
                id: tenantUser.id,
                name: tenantUser.name,
                email: tenantUser.email,
                role: tenantUser.role,
            },
        });
    }

    return res.status(401).json({ error: "invalid_credentials" });
});

// GET /api/auth/me - alias (la ruta principal está en /api/me)
router.get("/me", requireAuth, (req, res) => {
    return res.json({ user: req.user });
});

module.exports = router;
