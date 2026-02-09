import React from "react";

const PERIOD_OPTIONS = [
  { value: "24h", label: "Últimas 24h" },
  { value: "7d", label: "Última semana" },
  { value: "30d", label: "Último mes" },
];

function formatChartLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "--";
  }
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${months[date.getMonth()].toUpperCase()}`;
}

function buildPath(points) {
  if (!points.length) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
}

function formatChange(value, suffix = "%") {
  if (value === null || value === undefined) {
    return null;
  }
  const formatted = value > 0 ? `+${value}${suffix}` : `${value}${suffix}`;
  return formatted;
}

function DashboardView({
  metrics,
  channels,
  selectedPeriod,
  selectedChannel,
  onPeriodChange,
  onChannelChange,
  onRefresh,
  onGenerateReport,
  brandName,
}) {
  const brandLabel = (brandName || "Empresa").trim();
  const kicker = brandLabel ? `${brandLabel} Enterprise` : "Enterprise";

  // Parse metrics with fallbacks
  const activeConversations = metrics?.active_conversations?.value ?? 0;
  const activeChange = metrics?.active_conversations?.change ?? null;

  const responseMinutes = metrics?.avg_response_time?.value;
  const responseValue = responseMinutes ? `${responseMinutes.toFixed(1)}m` : "-";
  const responseChange = metrics?.avg_response_time?.change;

  const uniqueContacts = metrics?.unique_contacts?.value ?? 0;
  const uniqueContactsChange = metrics?.unique_contacts?.change ?? null;

  const conversionRate = metrics?.conversion_rate?.value ?? 0;
  const conversionValue = `${conversionRate.toFixed(1)}%`;
  const conversionChange = metrics?.conversion_rate?.change ?? null;

  const volume = metrics?.message_volume?.length > 0
    ? metrics.message_volume.slice(-14)
    : [];

  const maxValue = Math.max(
    ...volume.map((item) => item.in_count + item.out_count),
    1
  );
  const chartWidth = Math.max(volume.length * 42 + 30, 200);
  const chartHeight = 220;
  const plotHeight = 150;
  const baseline = 180;
  const bars = volume.map((item, index) => {
    const total = item.in_count + item.out_count;
    const totalHeight = (total / maxValue) * plotHeight;
    const inHeight = (item.in_count / maxValue) * plotHeight;
    const outHeight = (item.out_count / maxValue) * plotHeight;
    const x = 22 + index * 42;
    return {
      x,
      totalHeight,
      inHeight,
      outHeight,
    };
  });
  const inLine = buildPath(
    bars.map((bar, index) => ({
      x: bar.x + 10,
      y: baseline - bar.inHeight,
    }))
  );
  const outLine = buildPath(
    bars.map((bar) => ({
      x: bar.x + 10,
      y: baseline - bar.outHeight,
    }))
  );
  const labelIndexes = volume.length > 0
    ? Array.from(
      new Set([0, Math.floor(volume.length / 3), Math.floor((2 * volume.length) / 3), volume.length - 1])
    )
    : [];

  // Operators
  const operators = metrics?.operators ?? [];
  const efficiencyValue = Math.round(metrics?.team_efficiency ?? 0);
  const dailyGoal = metrics?.daily_goal ?? 500;
  const resolvedToday = metrics?.resolved_today ?? 0;

  return (
    <section className="dashboard-layout">
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <div className="dashboard-kicker">{kicker}</div>
            <h2 className="dashboard-title">Dashboard</h2>
            <div className="dashboard-subtitle">
              Marketing Analytics & WhatsApp CRM Overview
            </div>
          </div>
          <div className="dashboard-actions">
            <select
              className="dash-filter"
              value={selectedChannel || ""}
              onChange={(e) => onChannelChange(e.target.value || null)}
            >
              <option value="">Todas las líneas</option>
              {(channels || []).map((ch) => (
                <option key={ch.phone_number_id} value={ch.phone_number_id}>
                  {ch.display_name || ch.phone_number_id}
                </option>
              ))}
            </select>
            <select
              className="dash-filter"
              value={selectedPeriod || "30d"}
              onChange={(e) => onPeriodChange(e.target.value)}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button className="primary" type="button" onClick={onGenerateReport}>
              Generar Reporte
            </button>
          </div>
        </header>

        <div className="dashboard-kpis">
          <div className="dash-kpi">
            <div className="dash-kpi-top">
              <div>
                <div className="dash-kpi-label">Conversaciones activas</div>
                <div className="dash-kpi-value">
                  {activeConversations.toLocaleString()}
                </div>
              </div>
              <div className="dash-kpi-icon">C</div>
            </div>
            {activeChange !== null && (
              <div className={`dash-kpi-change ${activeChange >= 0 ? "up" : "down"}`}>
                {formatChange(activeChange)}
              </div>
            )}
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-top">
              <div>
                <div className="dash-kpi-label">Tiempo de respuesta</div>
                <div className="dash-kpi-value">{responseValue}</div>
              </div>
              <div className="dash-kpi-icon">T</div>
            </div>
            {responseChange !== null && (
              <div className={`dash-kpi-change ${responseChange <= 0 ? "up" : "down"}`}>
                {formatChange(responseChange, "m")}
              </div>
            )}
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-top">
              <div>
                <div className="dash-kpi-label">Contactos únicos</div>
                <div className="dash-kpi-value">{uniqueContacts.toLocaleString()}</div>
              </div>
              <div className="dash-kpi-icon">#</div>
            </div>
            {uniqueContactsChange !== null && (
              <div className={`dash-kpi-change ${uniqueContactsChange >= 0 ? "up" : "down"}`}>
                {formatChange(uniqueContactsChange)}
              </div>
            )}
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-top">
              <div>
                <div className="dash-kpi-label">Tasa de conversión</div>
                <div className="dash-kpi-value">{conversionValue}</div>
              </div>
              <div className="dash-kpi-icon">%</div>
            </div>
            {conversionChange !== null && (
              <div className={`dash-kpi-change ${conversionChange >= 0 ? "up" : "down"}`}>
                {formatChange(conversionChange)}
              </div>
            )}
          </div>
        </div>

        <div className="dash-card dash-chart-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Flujo de Mensajes</div>
              <div className="dash-card-subtitle">Volumen diario</div>
            </div>
            <div className="dash-legend">
              <span className="dash-legend-item">
                <span className="dash-legend-dot in" /> Entrantes
              </span>
              <span className="dash-legend-item">
                <span className="dash-legend-dot out" /> Salientes
              </span>
            </div>
          </div>
          {volume.length > 0 ? (
            <>
              <div className="dash-chart">
                <svg
                  className="dash-chart-svg"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="none"
                >
                  <line className="dash-chart-grid" x1="0" y1="60" x2={chartWidth} y2="60" />
                  <line className="dash-chart-grid" x1="0" y1="120" x2={chartWidth} y2="120" />
                  {bars.map((bar, index) => (
                    <g key={`bar-${index}`}>
                      <rect
                        className="dash-bar in"
                        x={bar.x}
                        y={baseline - bar.inHeight}
                        width="20"
                        height={bar.inHeight}
                        rx="6"
                      />
                      <rect
                        className="dash-bar out"
                        x={bar.x}
                        y={baseline - bar.inHeight - bar.outHeight}
                        width="20"
                        height={bar.outHeight}
                        rx="6"
                      />
                    </g>
                  ))}
                  <path className="dash-line in" d={inLine} />
                  <path className="dash-line out" d={outLine} />
                </svg>
              </div>
              <div className="dash-chart-labels">
                {labelIndexes.map((index) => (
                  <span key={`label-${index}`}>
                    {formatChartLabel(volume[index]?.day)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">Sin datos para el periodo seleccionado</div>
          )}
        </div>
      </div>

      <aside className="dashboard-side">
        <div className="dash-card">
          <div className="dash-card-title">Performance de Operadores</div>
          <div className="dash-card-subtitle">Top 10 - {PERIOD_OPTIONS.find(p => p.value === selectedPeriod)?.label || "Último mes"}</div>
          <div className="dash-operator-list">
            {operators.length > 0 ? (
              operators.map((item, idx) => (
                <div className="dash-operator" key={item.id || `op-${idx}`}>
                  <div className="dash-operator-avatar">{item.name?.[0] || "?"}</div>
                  <div className="dash-operator-meta">
                    <div className="dash-operator-name">{item.name}</div>
                    <div className="dash-operator-role">{item.role}</div>
                    <div className="dash-operator-stats">
                      <div>
                        <div className="dash-stat-label">Resueltos</div>
                        <div className="dash-stat-value">{item.resolved}</div>
                      </div>
                      <div>
                        <div className="dash-stat-label">Pendientes</div>
                        <div className="dash-stat-value danger">{item.pending}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">Sin operadores activos</div>
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-title">Eficiencia de Equipo</div>
          <div className="dash-efficiency">
            <div className="dash-efficiency-value">{efficiencyValue}%</div>
            <div className="dash-progress">
              <div
                className="dash-progress-fill"
                style={{ width: `${efficiencyValue}%` }}
              />
            </div>
            <div className="dash-muted">
              {resolvedToday} resueltas - Objetivo: {dailyGoal}
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
}

export default DashboardView;
