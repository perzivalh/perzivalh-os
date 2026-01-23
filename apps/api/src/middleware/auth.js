const { verifyToken } = require("../lib/auth");
const prisma = require("../db");
const { resolveTenantContextById } = require("../tenancy/tenantResolver");

function extractToken(req) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "missing_token" });
    }
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      tenant_id: payload.tenant_id || null,
    };
    if (req.user.role === "superadmin") {
      return next();
    }
    if (!req.user.tenant_id) {
      return res.status(401).json({ error: "missing_tenant" });
    }
    const context = await resolveTenantContextById(req.user.tenant_id);
    if (!context) {
      return res.status(403).json({ error: "tenant_not_ready" });
    }
    return prisma.runWithPrisma(
      context.prisma,
      () => next(),
      { tenantId: context.tenantId, channel: context.channel }
    );
  } catch (error) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
