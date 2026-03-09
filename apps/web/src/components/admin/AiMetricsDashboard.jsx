import React, { useEffect, useRef, useState } from "react";
import { apiGet, apiPatch } from "../../api";

const DEFAULT_CONFIG = {
  enabled: true,
  tracked_providers: ["cerebras"],
  tenant_daily_token_limit: 1000000,
  chat_daily_token_limit: 10000,
  output_weight: 0.35,
};

function fmtTokens(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${months[Number(m) - 1] || m} ${Number(d)}`;
}

function pct(used, limit) {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────
function TokenBarChart({ history, limitTokens }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const svgRef = useRef(null);

  const W = 680;
  const H = 220;
  const PADDING = { top: 20, right: 16, bottom: 44, left: 62 };
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  const yMax = limitTokens || 1_000_000;
  const data = history.length ? history : [];

  const barW = data.length ? Math.max(4, Math.floor((chartW / data.length) * 0.6)) : 12;
  const gap = data.length ? chartW / data.length : 24;

  // Y gridlines — 5 steps
  const ySteps = 5;
  const yLines = Array.from({ length: ySteps + 1 }, (_, i) => (yMax / ySteps) * i);

  function barX(i) {
    return PADDING.left + i * gap + gap / 2 - barW / 2;
  }

  function barY(val) {
    return PADDING.top + chartH - (val / yMax) * chartH;
  }

  function barH(val) {
    return (Math.max(0, val) / yMax) * chartH;
  }

  const tooltip = hoveredIdx != null ? data[hoveredIdx] : null;

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Y grid lines */}
        {yLines.map((v, i) => {
          const y = PADDING.top + chartH - (v / yMax) * chartH;
          return (
            <g key={i}>
              <line
                x1={PADDING.left}
                x2={PADDING.left + chartW}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth={i === 0 ? 1.5 : 0.75}
              />
              <text
                x={PADDING.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="var(--muted)"
              >
                {fmtTokens(v)}
              </text>
            </g>
          );
        })}

        {/* Limit line */}
        {limitTokens && (
          <line
            x1={PADDING.left}
            x2={PADDING.left + chartW}
            y1={PADDING.top}
            y2={PADDING.top}
            stroke="var(--danger)"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.6}
          />
        )}

        {/* Bars */}
        {data.map((d, i) => {
          const bh = barH(d.used_tokens);
          const bx = barX(i);
          const by = barY(d.used_tokens);
          const isHovered = hoveredIdx === i;
          return (
            <g key={d.day || i}>
              {/* Hover target (full height invisible) */}
              <rect
                x={PADDING.left + i * gap}
                y={PADDING.top}
                width={gap}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(i)}
              />
              {/* Bar */}
              {bh > 0 && (
                <rect
                  x={bx}
                  y={by}
                  width={barW}
                  height={bh}
                  rx={3}
                  fill={isHovered ? "url(#barGradHover)" : "url(#barGrad)"}
                  style={{ transition: "fill 0.1s" }}
                />
              )}
              {bh === 0 && (
                <rect
                  x={bx}
                  y={PADDING.top + chartH - 2}
                  width={barW}
                  height={2}
                  rx={1}
                  fill="var(--border)"
                />
              )}
              {/* X label — show every n-th to avoid crowding */}
              {(data.length <= 14 || i % Math.ceil(data.length / 14) === 0) && (
                <text
                  x={bx + barW / 2}
                  y={PADDING.top + chartH + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--muted)"
                >
                  {fmtDate(d.day)}
                </text>
              )}
            </g>
          );
        })}

        {/* Tooltip box */}
        {tooltip && (() => {
          const idx = hoveredIdx;
          const bx = barX(idx);
          const by = barY(tooltip.used_tokens);
          const tipW = 130;
          const tipH = 46;
          let tx = bx + barW / 2 - tipW / 2;
          if (tx < PADDING.left) tx = PADDING.left;
          if (tx + tipW > W - PADDING.right) tx = W - PADDING.right - tipW;
          const ty = Math.max(PADDING.top + 2, by - tipH - 8);
          return (
            <g>
              <rect x={tx} y={ty} width={tipW} height={tipH} rx={5} fill="var(--panel)" stroke="var(--border)" strokeWidth={1} filter="drop-shadow(0 2px 6px var(--shadow))" />
              <text x={tx + tipW / 2} y={ty + 16} textAnchor="middle" fontSize={10} fontWeight="600" fill="var(--ink)">{fmtDate(tooltip.day)} {tooltip.day?.slice(0, 4)}</text>
              <text x={tx + tipW / 2} y={ty + 32} textAnchor="middle" fontSize={11} fontWeight="700" fill="var(--accent)">{fmtTokens(tooltip.used_tokens)} tokens</text>
            </g>
          );
        })()}
      </svg>

      {!data.length && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Sin datos históricos aún</span>
        </div>
      )}
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = "var(--accent)" }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0;
  const dangerColor = p > 85 ? "var(--danger)" : color;
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${p}%`, background: dangerColor, borderRadius: 3, transition: "width 0.3s" }} />
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent = false }) {
  return (
    <div style={{
      background: accent ? "var(--accent)" : "var(--panel)",
      border: `1px solid ${accent ? "transparent" : "var(--border)"}`,
      borderRadius: 10,
      padding: "16px 20px",
      minWidth: 120,
      flex: 1,
    }}>
      <div style={{ fontSize: 11, color: accent ? "rgba(255,255,255,0.75)" : "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? "#fff" : "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: accent ? "rgba(255,255,255,0.65)" : "var(--muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AiMetricsDashboard({ canManage = false }) {
  const [history, setHistory] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [todaySnap, setTodaySnap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveOk, setSaveOk] = useState(false);

  // Config edit state
  const [editConfig, setEditConfig] = useState(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [histRes, todayRes] = await Promise.all([
        apiGet("/api/admin/bots/ai-history?days=30"),
        apiGet("/api/admin/bots/ai-quota"),
      ]);
      setHistory(histRes.history || []);
      const cfg = histRes.config || DEFAULT_CONFIG;
      setConfig(cfg);
      setEditConfig({
        enabled: cfg.enabled,
        tracked_providers: (cfg.tracked_providers || []).join(", "),
        tenant_daily_token_limit: cfg.tenant_daily_token_limit ?? 1000000,
        chat_daily_token_limit: cfg.chat_daily_token_limit ?? 10000,
        output_weight: cfg.output_weight ?? 0.35,
      });
      setTodaySnap(todayRes);
    } catch (err) {
      setError(err.message || "Error al cargar métricas");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    setSaveOk(false);
    try {
      const payload = {
        enabled: editConfig.enabled,
        tracked_providers: editConfig.tracked_providers
          .split(/[,\s;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        tenant_daily_token_limit: Number(editConfig.tenant_daily_token_limit) || null,
        chat_daily_token_limit: Number(editConfig.chat_daily_token_limit) || null,
        output_weight: parseFloat(editConfig.output_weight) || 0.35,
      };
      await apiPatch("/api/admin/bots/ai-quota", payload);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
      await loadAll();
    } catch (err) {
      setError(err.message || "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  }

  const todayUsed = todaySnap?.usage?.tenant?.used_tokens ?? 0;
  const todayLimit = config.tenant_daily_token_limit || 0;
  const todayRemaining = todayLimit ? Math.max(0, todayLimit - todayUsed) : null;
  const todayChats = todaySnap?.usage?.chats || [];
  const chatLimit = config.chat_daily_token_limit || 0;
  const todayPct = pct(todayUsed, todayLimit);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 820, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>IA Analytics</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
          Consumo diario de tokens · {todaySnap?.day || "—"}
        </p>
      </div>

      {error && (
        <div style={{ background: "rgba(226,85,85,0.1)", border: "1px solid var(--danger)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted)", fontSize: 14 }}>Cargando métricas…</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <KpiCard
              label="Usado hoy"
              value={fmtTokens(todayUsed)}
              sub={todayLimit ? `${todayPct}% del límite` : "sin límite"}
              accent
            />
            <KpiCard
              label="Disponible hoy"
              value={todayRemaining != null ? fmtTokens(todayRemaining) : "∞"}
              sub={todayLimit ? `Límite: ${fmtTokens(todayLimit)}` : "sin límite diario"}
            />
            <KpiCard
              label="Chats activos"
              value={todayChats.length}
              sub="con uso hoy"
            />
            <KpiCard
              label="Límite por chat"
              value={chatLimit ? fmtTokens(chatLimit) : "∞"}
              sub="tokens / día / contacto"
            />
          </div>

          {/* Usage bar (tenant) */}
          {todayLimit > 0 && (
            <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Cuota del tenant hoy</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtTokens(todayUsed)} / {fmtTokens(todayLimit)}</span>
              </div>
              <ProgressBar value={todayUsed} max={todayLimit} />
            </div>
          )}

          {/* Chart */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Historial de consumo</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Últimos 30 días · tokens usados por día</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "var(--muted)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--accent)", opacity: 0.8 }} />
                  Tokens usados
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ display: "inline-block", width: 16, height: 2, borderTop: "2px dashed var(--danger)", opacity: 0.6 }} />
                  Límite diario
                </span>
              </div>
            </div>
            <TokenBarChart history={history} limitTokens={todayLimit || 1_000_000} />
          </div>

          {/* Top Contacts */}
          {todayChats.length > 0 && (
            <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 16 }}>Top contactos · consumo hoy</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 160px", gap: "0 12px", padding: "0 0 8px", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
                  {["Contacto", "Usado", "Disponible", ""].map((h, i) => (
                    <div key={i} style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
                  ))}
                </div>
                {todayChats.map((chat, i) => {
                  const rem = chatLimit ? Math.max(0, chatLimit - chat.used_tokens) : null;
                  const p = pct(chat.used_tokens, chatLimit);
                  return (
                    <div
                      key={chat.wa_id || i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 80px 80px 160px",
                        gap: "0 12px",
                        padding: "9px 0",
                        borderBottom: "1px solid var(--border)",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 13, color: "var(--ink)", fontFamily: "monospace" }}>
                        {chat.wa_id_masked || chat.wa_id || "—"}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{fmtTokens(chat.used_tokens)}</div>
                      <div style={{ fontSize: 12, color: rem != null && rem < chatLimit * 0.1 ? "var(--danger)" : "var(--muted)" }}>
                        {rem != null ? fmtTokens(rem) : "∞"}
                      </div>
                      <div>
                        {chatLimit > 0 ? (
                          <div>
                            <ProgressBar value={chat.used_tokens} max={chatLimit} />
                            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>{p}%</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>sin límite</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Config Section */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Configuración de cuota</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>Ajusta los límites y proveedores rastreados para el consumo de IA.</div>

            {editConfig && (
              <form onSubmit={handleSaveConfig}>
                {/* Enabled toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Cuota diaria activa</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Habilita o deshabilita el control de límite de tokens</div>
                  </div>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => setEditConfig((p) => ({ ...p, enabled: !p.enabled }))}
                    style={{
                      position: "relative",
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: "none",
                      background: editConfig.enabled ? "var(--accent)" : "var(--border)",
                      cursor: canManage ? "pointer" : "not-allowed",
                      transition: "background 0.2s",
                      outline: "none",
                      flexShrink: 0,
                    }}
                    aria-label="Toggle quota"
                  >
                    <span style={{
                      position: "absolute",
                      top: 3,
                      left: editConfig.enabled ? 22 : 3,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    }} />
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginTop: 16 }}>
                  {/* Tenant limit */}
                  <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Límite tokens/día (tenant)</span>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      disabled={!canManage}
                      value={editConfig.tenant_daily_token_limit}
                      onChange={(e) => setEditConfig((p) => ({ ...p, tenant_daily_token_limit: e.target.value }))}
                      style={inputStyle}
                      placeholder="1000000"
                    />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>0 = sin límite</span>
                  </label>

                  {/* Chat limit */}
                  <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Límite tokens/día (por contacto)</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      disabled={!canManage}
                      value={editConfig.chat_daily_token_limit}
                      onChange={(e) => setEditConfig((p) => ({ ...p, chat_daily_token_limit: e.target.value }))}
                      style={inputStyle}
                      placeholder="10000"
                    />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>0 = sin límite</span>
                  </label>

                  {/* Providers */}
                  <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Proveedores rastreados</span>
                    <input
                      type="text"
                      disabled={!canManage}
                      value={editConfig.tracked_providers}
                      onChange={(e) => setEditConfig((p) => ({ ...p, tracked_providers: e.target.value }))}
                      style={inputStyle}
                      placeholder="cerebras, openai"
                    />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Separados por coma</span>
                  </label>

                  {/* Output weight */}
                  <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Peso de tokens de salida</span>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={!canManage}
                      value={editConfig.output_weight}
                      onChange={(e) => setEditConfig((p) => ({ ...p, output_weight: e.target.value }))}
                      style={inputStyle}
                      placeholder="0.35"
                    />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Multiplica tokens de salida estimados (0.0 – 1.0)</span>
                  </label>
                </div>

                <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="submit"
                    disabled={!canManage || saving}
                    style={{
                      padding: "9px 22px",
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: canManage && !saving ? "pointer" : "not-allowed",
                      opacity: canManage ? 1 : 0.5,
                    }}
                  >
                    {saving ? "Guardando…" : "Guardar configuración"}
                  </button>
                  {saveOk && (
                    <span style={{ fontSize: 13, color: "var(--success)", fontWeight: 600 }}>✓ Guardado</span>
                  )}
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "8px 11px",
  border: "1px solid var(--border)",
  borderRadius: 7,
  fontSize: 13,
  background: "var(--bg-soft)",
  color: "var(--ink)",
  outline: "none",
  width: "100%",
};
