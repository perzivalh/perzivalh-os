import React from "react";

const FALLBACK_VOLUME = [
  { day: "2024-01-01", in_count: 210, out_count: 90 },
  { day: "2024-01-04", in_count: 280, out_count: 120 },
  { day: "2024-01-07", in_count: 240, out_count: 110 },
  { day: "2024-01-10", in_count: 320, out_count: 140 },
  { day: "2024-01-13", in_count: 300, out_count: 130 },
  { day: "2024-01-17", in_count: 310, out_count: 135 },
  { day: "2024-01-20", in_count: 290, out_count: 120 },
  { day: "2024-01-24", in_count: 260, out_count: 115 },
  { day: "2024-01-27", in_count: 330, out_count: 150 },
  { day: "2024-01-30", in_count: 340, out_count: 160 },
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

function DashboardView({ statusCounts, metrics, onRefresh }) {
  const activeConversations = (statusCounts.open || 0) + (statusCounts.pending || 0);
  const responseMinutes = metrics?.avg_first_reply_seconds
    ? Number(metrics.avg_first_reply_seconds) / 60
    : null;
  const responseValue = responseMinutes ? `${responseMinutes.toFixed(1)}m` : "-";
  const conversionRaw =
    metrics?.conversion_rate ?? metrics?.conversion_rate_percent ?? null;
  const conversionPercent =
    conversionRaw === null || conversionRaw === undefined
      ? 18.4
      : conversionRaw > 1
        ? conversionRaw
        : conversionRaw * 100;
  const conversionValue = `${conversionPercent.toFixed(1)}%`;

  const volume =
    metrics?.message_volume?.length > 0
      ? metrics.message_volume.slice(-10)
      : FALLBACK_VOLUME;
  const maxValue = Math.max(
    ...volume.map((item) => item.in_count + item.out_count),
    1
  );
  const chartWidth = volume.length * 42 + 30;
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
  const labelIndexes = Array.from(
    new Set([0, Math.floor(volume.length / 3), Math.floor((2 * volume.length) / 3), volume.length - 1])
  );
  const efficiencyValue = Math.round(metrics?.team_efficiency || 94);
  const topTags = (metrics?.top_tags || []).slice(0, 3);

  return (
    <section className="dashboard-layout">
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <div className="dashboard-kicker">PODOPIE Enterprise</div>
            <h2 className="dashboard-title">Dashboard</h2>
            <div className="dashboard-subtitle">
              Marketing Analytics & WhatsApp CRM Overview
            </div>
          </div>
          <div className="dashboard-actions">
            <button className="dash-filter" type="button">
              <span className="dash-filter-icon" aria-hidden="true" />
              Ultimos 30 dias
            </button>
            <button className="primary" type="button" onClick={onRefresh}>
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
            <div className="dash-kpi-change up">+12.5%</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-top">
              <div>
                <div className="dash-kpi-label">Tiempo de respuesta</div>
                <div className="dash-kpi-value">{responseValue}</div>
              </div>
              <div className="dash-kpi-icon">T</div>
            </div>
            <div className="dash-kpi-change down">-0.8m</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-top">
              <div>
                <div className="dash-kpi-label">Tasa de conversion</div>
                <div className="dash-kpi-value">{conversionValue}</div>
              </div>
              <div className="dash-kpi-icon">%</div>
            </div>
            <div className="dash-kpi-change up">+2.1%</div>
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
        </div>

        <div className="dashboard-lower">
          <div className="dash-card">
            <div className="dash-card-header">
              <div className="dash-card-title">Ultimas etiquetas detectadas</div>
              <button className="link-button" type="button">
                Ver todo
              </button>
            </div>
            <div className="dash-tag-table">
              <div className="dash-tag-head">
                <span>Etiqueta</span>
                <span>Frecuencia</span>
                <span>Accion</span>
              </div>
              {topTags.map((tag) => (
                <div className="dash-tag-row" key={tag.name}>
                  <span className="dash-tag-chip">{tag.name}</span>
                  <span className="dash-tag-count">{tag.count}</span>
                  <span className="dash-tag-action">&gt;</span>
                </div>
              ))}
              {!topTags.length && (
                <div className="empty-state">Sin etiquetas recientes</div>
              )}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-header">
              <div className="dash-card-title">Actividad de Campana</div>
              <span className="dash-pill">Monitor</span>
            </div>
            <div className="dash-campaign">
              <div className="dash-campaign-title">
                Campana de Verano "Pies Sanos"
              </div>
              <div className="dash-campaign-meta">
                <span className="dash-pill solid">84% enviado</span>
                <span className="dash-muted">Hace 2 horas</span>
              </div>
              <div className="dash-progress">
                <div className="dash-progress-fill" style={{ width: "84%" }} />
              </div>
              <div className="dash-muted">1,240 destinatarios</div>
            </div>
          </div>
        </div>
      </div>

      <aside className="dashboard-side">
        <div className="dash-card">
          <div className="dash-card-title">Performance de Operadores</div>
          <div className="dash-card-subtitle">Top 5 leaderboard - hoy</div>
          <div className="dash-operator-list">
            {[
              {
                name: "Lucia Fernandez",
                role: "Especialista CRM",
                resolved: 84,
                pending: 3,
              },
              {
                name: "Ricardo Gomez",
                role: "Atencion Pacientes",
                resolved: 71,
                pending: 8,
              },
              {
                name: "Ana Martinez",
                role: "Soporte Medico",
                resolved: 65,
                pending: 12,
              },
            ].map((item) => (
              <div className="dash-operator" key={item.name}>
                <div className="dash-operator-avatar">{item.name[0]}</div>
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
            ))}
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
            <div className="dash-muted">Objetivo diario: 500 conversiones</div>
          </div>
        </div>
      </aside>
    </section>
  );
}

export default DashboardView;
