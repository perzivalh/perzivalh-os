import React, { useState } from "react";

const PERIOD_OPTIONS = [
  { value: "24h", label: "Últimas 24h" },
  { value: "7d", label: "Última semana" },
  { value: "30d", label: "Último mes" },
];

function formatChartLabel(value) {
  if (!value) return "--";
  // Parse date string as local date
  const parts = value.split("-");
  if (parts.length !== 3) return "--";
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return "--";

  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${months[date.getMonth()]}`;
}

function formatFullDate(value) {
  if (!value) return "--";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return value;

  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}

function buildPath(points) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

function formatChange(value, suffix = "%") {
  if (value === null || value === undefined) return null;
  return value > 0 ? `+${value}${suffix}` : `${value}${suffix}`;
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
}) {
  const [hoveredBar, setHoveredBar] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Parse metrics with fallbacks
  const activeConversations = metrics?.active_conversations?.value ?? 0;
  const activeChange = metrics?.active_conversations?.change ?? null;

  const responseMinutes = metrics?.avg_response_time?.value;
  const responseValue = responseMinutes != null ? `${responseMinutes.toFixed(1)}m` : "-";
  const responseChange = metrics?.avg_response_time?.change;

  const uniqueContacts = metrics?.unique_contacts?.value ?? 0;
  const uniqueContactsChange = metrics?.unique_contacts?.change ?? null;

  const conversionRate = metrics?.conversion_rate?.value ?? 0;
  const conversionValue = `${conversionRate.toFixed(1)}%`;
  const conversionChange = metrics?.conversion_rate?.change ?? null;

  const volume = metrics?.message_volume?.length > 0
    ? metrics.message_volume.slice(-14)
    : [];

  const maxValue = Math.max(...volume.map((item) => Math.max(item.in_count, item.out_count)), 1);
  const chartWidth = Math.max(volume.length * 50 + 40, 200);
  const chartHeight = 220;
  const plotHeight = 140;
  const baseline = 175;
  const barWidth = 16;
  const barGap = 4;

  const bars = volume.map((item, index) => {
    const inHeight = (item.in_count / maxValue) * plotHeight;
    const outHeight = (item.out_count / maxValue) * plotHeight;
    const x = 30 + index * 50;
    return {
      x,
      inHeight,
      outHeight,
      inCount: item.in_count,
      outCount: item.out_count,
      day: item.day,
    };
  });

  const labelIndexes = volume.length > 0
    ? Array.from(new Set([0, Math.floor(volume.length / 2), volume.length - 1]))
    : [];

  // Operators
  const operators = metrics?.operators ?? [];
  const efficiencyValue = Math.round(metrics?.team_efficiency ?? 0);
  const dailyGoal = metrics?.daily_goal ?? 500;
  const resolvedToday = metrics?.resolved_today ?? 0;

  const handleBarMouseEnter = (bar, event) => {
    const rect = event.currentTarget.closest(".dash-chart").getBoundingClientRect();
    setHoveredBar(bar);
    setTooltipPos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top - 60,
    });
  };

  const handleBarMouseLeave = () => {
    setHoveredBar(null);
  };

  return (
    <section className="dashboard-layout">
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h2 className="dashboard-title">Dashboard</h2>
            <div className="dashboard-subtitle">
              Analitica de marketing y resumen del CRM de WhatsApp
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
              <div className="dash-kpi-icon">💬</div>
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
              <div className="dash-kpi-icon">⏱️</div>
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
              <div className="dash-kpi-icon">👥</div>
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
              <div className="dash-kpi-icon">📈</div>
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
              <div className="dash-card-subtitle">Volumen diario por dirección</div>
            </div>
            <div className="dash-legend">
              <span className="dash-legend-item">
                <span className="dash-legend-dot in" /> Recibidos (clientes)
              </span>
              <span className="dash-legend-item">
                <span className="dash-legend-dot out" /> Enviados (operadores/bot)
              </span>
            </div>
          </div>
          {volume.length > 0 ? (
            <>
              <div className="dash-chart" style={{ position: "relative" }}>
                {hoveredBar && (
                  <div
                    className="dash-chart-tooltip"
                    style={{
                      left: Math.min(tooltipPos.x, chartWidth - 160),
                      top: Math.max(tooltipPos.y, 10),
                    }}
                  >
                    <div className="tooltip-date">{formatFullDate(hoveredBar.day)}</div>
                    <div className="tooltip-row">
                      <span className="tooltip-dot in" />
                      <span>Recibidos:</span>
                      <strong>{hoveredBar.inCount.toLocaleString()}</strong>
                    </div>
                    <div className="tooltip-row">
                      <span className="tooltip-dot out" />
                      <span>Enviados:</span>
                      <strong>{hoveredBar.outCount.toLocaleString()}</strong>
                    </div>
                    <div className="tooltip-total">
                      Total: {(hoveredBar.inCount + hoveredBar.outCount).toLocaleString()}
                    </div>
                  </div>
                )}
                <svg
                  className="dash-chart-svg"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Grid lines */}
                  <line className="dash-chart-grid" x1="20" y1="45" x2={chartWidth - 10} y2="45" />
                  <line className="dash-chart-grid" x1="20" y1="110" x2={chartWidth - 10} y2="110" />
                  <line className="dash-chart-grid" x1="20" y1="175" x2={chartWidth - 10} y2="175" />

                  {/* Y-axis labels */}
                  <text className="dash-chart-axis" x="15" y="48" textAnchor="end">{maxValue}</text>
                  <text className="dash-chart-axis" x="15" y="113" textAnchor="end">{Math.round(maxValue / 2)}</text>
                  <text className="dash-chart-axis" x="15" y="178" textAnchor="end">0</text>

                  {bars.map((bar, index) => (
                    <g
                      key={`bar-${index}`}
                      onMouseEnter={(e) => handleBarMouseEnter(bar, e)}
                      onMouseLeave={handleBarMouseLeave}
                      style={{ cursor: "pointer" }}
                    >
                      {/* Invisible hit area for better hover */}
                      <rect
                        x={bar.x - 5}
                        y={baseline - Math.max(bar.inHeight, bar.outHeight) - 10}
                        width={barWidth * 2 + barGap + 10}
                        height={Math.max(bar.inHeight, bar.outHeight) + 20}
                        fill="transparent"
                      />
                      {/* Received (green) bar */}
                      <rect
                        className="dash-bar in"
                        x={bar.x}
                        y={baseline - bar.inHeight}
                        width={barWidth}
                        height={Math.max(bar.inHeight, 2)}
                        rx="4"
                      />
                      {/* Sent (blue) bar */}
                      <rect
                        className="dash-bar out"
                        x={bar.x + barWidth + barGap}
                        y={baseline - bar.outHeight}
                        width={barWidth}
                        height={Math.max(bar.outHeight, 2)}
                        rx="4"
                      />
                    </g>
                  ))}
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
            <div className="empty-state">Sin datos de mensajes para el periodo seleccionado</div>
          )}
        </div>
      </div>

      <aside className="dashboard-side">
        <div className="dash-card">
          <div className="dash-card-title">Performance de Operadores</div>
          <div className="dash-card-subtitle">
            Top 10 - {PERIOD_OPTIONS.find(p => p.value === selectedPeriod)?.label || "Último mes"}
          </div>
          <div className="dash-operator-help">
            <small>
              <strong>Cerrados:</strong> Conversaciones que el operador resolvió (status cerrado).
              <br />
              <strong>En curso:</strong> Conversaciones asignadas que aún están activas.
            </small>
          </div>
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
                        <div className="dash-stat-label">Cerrados</div>
                        <div className="dash-stat-value success">{item.resolved}</div>
                      </div>
                      <div>
                        <div className="dash-stat-label">En curso</div>
                        <div className="dash-stat-value warning">{item.pending}</div>
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
              {resolvedToday.toLocaleString()} cerradas de {dailyGoal.toLocaleString()} objetivo
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
}

export default DashboardView;
