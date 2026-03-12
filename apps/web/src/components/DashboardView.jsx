import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { apiGet, apiPatch } from "../api";

const PERIOD_OPTIONS = [
  { value: "24h", label: "Ultimas 24h" },
  { value: "7d", label: "Ultima semana" },
  { value: "30d", label: "Ultimo mes" },
];

const TABLE_PAGE_SIZE = 25;

const MATCH_STATUS_LABELS = {
  no_match: "Sin match",
  contact: "Contacto Odoo",
  patient_existing: "Paciente existente",
  registered_after_chat: "Registro post-chat",
};

const MATCH_STATUS_TONES = {
  no_match: "muted",
  contact: "info",
  patient_existing: "warning",
  registered_after_chat: "success",
};

function formatTableDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return `${Number(value).toFixed(1)}m`;
}

function formatOdooErrorMessage(message) {
  if (!message) return "";
  if (/odoo login failed/i.test(message)) {
    return "Odoo rechazo el inicio de sesion. Revisa usuario, clave o base configurada.";
  }
  return message;
}

function getChannelDashboardLabel(channel) {
  if (!channel) return "-";
  return channel.line_number || channel.display_name || channel.phone_number_id || "-";
}

function buildTableParams({ selectedPeriod, selectedChannel, query, includePaging = true }) {
  const params = new URLSearchParams();
  params.set("period", selectedPeriod || "30d");
  if (selectedChannel) {
    params.set("channel", selectedChannel);
  }
  if (query.search) params.set("search", query.search);
  if (query.tag) params.set("tag", query.tag);
  if (query.operator_id) params.set("operator_id", query.operator_id);
  if (query.call) params.set("call", query.call);
  if (query.message) params.set("message", query.message);
  if (query.sort_by) params.set("sort_by", query.sort_by);
  if (query.sort_order) params.set("sort_order", query.sort_order);
  if (includePaging) {
    params.set("page", String(query.page));
    params.set("page_size", String(query.page_size));
  }
  return params;
}

function getRowFlags(row, currentFlags) {
  return {
    remarketing: currentFlags?.remarketing ?? row?.remarketing ?? false,
    asistio: currentFlags?.asistio ?? row?.asistio ?? false,
  };
}

function StatCard({ label, value, hint, tone = "accent" }) {
  return (
    <article className={`overview-stat-card tone-${tone}`}>
      <div className="overview-stat-label">{label}</div>
      <div className="overview-stat-value">{value}</div>
      {hint ? <div className="overview-stat-hint">{hint}</div> : null}
    </article>
  );
}

function Panel({ title, subtitle, className = "", children, actions = null }) {
  return (
    <section className={`overview-panel ${className}`.trim()}>
      <header className="overview-panel-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="overview-panel-actions">{actions}</div> : null}
      </header>
      <div className="overview-panel-body">{children}</div>
    </section>
  );
}

function TimelineChart({ items = [] }) {
  const maxValue = Math.max(
    1,
    ...items.map((item) => Math.max(item.in_count || 0, item.bot_out_count || 0, item.human_out_count || 0))
  );

  return (
    <div className="overview-timeline">
      {items.length === 0 ? (
        <div className="overview-empty">Sin movimiento en el periodo</div>
      ) : (
        items.map((item) => (
          <div className="overview-timeline-day" key={item.day}>
            <div className="overview-timeline-bars">
              <span
                className="bar in"
                style={{ height: `${Math.max(8, ((item.in_count || 0) / maxValue) * 100)}%` }}
                title={`Entrantes: ${item.in_count || 0}`}
              />
              <span
                className="bar bot"
                style={{ height: `${Math.max(8, ((item.bot_out_count || 0) / maxValue) * 100)}%` }}
                title={`Bot: ${item.bot_out_count || 0}`}
              />
              <span
                className="bar human"
                style={{ height: `${Math.max(8, ((item.human_out_count || 0) / maxValue) * 100)}%` }}
                title={`Humano: ${item.human_out_count || 0}`}
              />
            </div>
            <div className="overview-timeline-label">{item.day?.slice(5) || "--"}</div>
          </div>
        ))
      )}
    </div>
  );
}

function DonutChart({ data = [] }) {
  const total = data.reduce((sum, item) => sum + (item.count || 0), 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = ["#1d4ed8", "#f59e0b", "#10b981"];

  return (
    <div className="overview-donut-wrap">
      <svg viewBox="0 0 120 120" className="overview-donut">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="16" />
        {data.map((item, index) => {
          const ratio = total > 0 ? item.count / total : 0;
          const strokeDasharray = `${ratio * circumference} ${circumference}`;
          const circle = (
            <circle
              key={item.status}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={colors[index % colors.length]}
              strokeWidth="16"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += ratio * circumference;
          return circle;
        })}
        <text x="60" y="58" textAnchor="middle" className="overview-donut-total">
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" className="overview-donut-caption">
          activas
        </text>
      </svg>
      <div className="overview-legend">
        {data.map((item, index) => (
          <div className="overview-legend-row" key={item.status}>
            <span className="swatch" style={{ background: colors[index % colors.length] }} />
            <span>{item.status}</span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({ items = [], formatter = (value) => value }) {
  const maxValue = Math.max(1, ...items.map((item) => item.count || 0));
  return (
    <div className="overview-bar-list">
      {items.length === 0 ? (
        <div className="overview-empty">Sin datos</div>
      ) : (
        items.map((item) => (
          <div className="overview-bar-row" key={item.id || item.label || item.status || item.node_id}>
            <div className="overview-bar-meta">
              <span>{item.label || item.status || item.node_id}</span>
              <strong>{formatter(item.count || 0)}</strong>
            </div>
            <div className="overview-bar-track">
              <span className="overview-bar-fill" style={{ width: `${((item.count || 0) / maxValue) * 100}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function FunnelChart({ steps = [] }) {
  const maxValue = Math.max(1, ...steps.map((step) => step.count || 0));
  return (
    <div className="overview-funnel">
      {steps.length === 0 ? (
        <div className="overview-empty">Tracking en espera de datos</div>
      ) : (
        steps.map((step) => (
          <div key={step.id} className="overview-funnel-step">
            <div className="overview-funnel-label">
              <span>{step.label}</span>
              <strong>{step.count}</strong>
            </div>
            <div className="overview-funnel-track">
              <span className="overview-funnel-fill" style={{ width: `${((step.count || 0) / maxValue) * 100}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function OdooStatusPanel({ odoo }) {
  const sync = odoo?.sync || null;
  const matchDistribution = odoo?.match_distribution || [];

  return (
    <div className="overview-odoo">
      <div className="overview-odoo-sync">
        <div>
          <span className="eyebrow">Sync</span>
          <strong>{sync?.sync_enabled ? "Activa" : "Sin configurar"}</strong>
        </div>
        <div>
          <span className="eyebrow">Intervalo</span>
          <strong>{sync?.sync_interval_minutes ? `${sync.sync_interval_minutes} min` : "--"}</strong>
        </div>
        <div>
          <span className="eyebrow">Ultima sync</span>
          <strong>{formatDateTime(sync?.last_success_at)}</strong>
        </div>
      </div>
      <BarList items={matchDistribution.map((item) => ({ ...item, label: MATCH_STATUS_LABELS[item.status] || item.status }))} />
      {sync?.last_error_message ? (
        <div className="overview-inline-alert">
          {formatOdooErrorMessage(sync.last_error_message)}
        </div>
      ) : null}
    </div>
  );
}

function TeamTable({ team = [] }) {
  return (
    <div className="overview-team-list">
      {team.length === 0 ? (
        <div className="overview-empty">Sin actividad humana en el periodo</div>
      ) : (
        team.slice(0, 8).map((operator) => (
          <div key={operator.id} className="overview-team-row">
            <div className="overview-team-main">
              <strong>{operator.name}</strong>
              <span>{operator.role || "operador"}</span>
            </div>
            <div className="overview-team-metrics">
              <span>{operator.handled_conversations} chats</span>
              <span>{operator.human_messages_sent} mensajes</span>
              <span>1ra: {formatDuration(operator.first_response_avg_min)}</span>
              <span>Prom: {formatDuration(operator.avg_response_avg_min)}</span>
              <span>Asignadas: {operator.assigned_now ?? 0}</span>
              <span>Asist.: {operator.attendances_attributed ?? 0}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DashboardView({
  metrics,
  channels,
  users = [],
  tags = [],
  selectedPeriod,
  selectedChannel,
  onPeriodChange,
  onChannelChange,
  onRefresh,
  onGenerateReport,
}) {
  const overview = metrics || {};
  const [tableRows, setTableRows] = useState([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState("");
  const [viewMode, setViewMode] = useState("dashboard");
  const [tableQuery, setTableQuery] = useState({
    page: 1,
    page_size: TABLE_PAGE_SIZE,
    search: "",
    tag: "",
    operator_id: "",
    call: "",
    message: "",
    sort_by: "date",
    sort_order: "desc",
  });
  const [searchDraft, setSearchDraft] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportMeta, setExportMeta] = useState(null);
  const [tableReloadSeq, setTableReloadSeq] = useState(0);
  const [tableFlagMap, setTableFlagMap] = useState({});
  const tableFlagPending = useRef({});

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(tableTotal / tableQuery.page_size)),
    [tableTotal, tableQuery.page_size]
  );

  const topCards = useMemo(
    () => [
      { label: "Activas ahora", value: overview.live?.active_now ?? 0, hint: "open + pending + assigned" },
      { label: "Pendientes sin tomar", value: overview.live?.pending_unassigned ?? 0, hint: "cola actual", tone: "warning" },
      { label: "Tomadas por operador", value: overview.live?.assigned_now ?? 0, hint: "asignadas ahora" },
      { label: "Sesiones bot activas", value: overview.live?.bot_sessions_active ?? 0, hint: "flow activo", tone: "info" },
      { label: "Asistencia confirmada", value: overview.period_summary?.attendance_confirmed ?? 0, hint: "manual + Odoo", tone: "success" },
      { label: "Registro post-chat", value: overview.period_summary?.registered_after_chat ?? 0, hint: "Odoo posterior al chat", tone: "success" },
      { label: "1ra respuesta humana", value: formatDuration(overview.response?.first_human_response_avg_min), hint: `post-handoff · p50 ${formatDuration(overview.response?.first_human_response_p50_min)} / p90 ${formatDuration(overview.response?.first_human_response_p90_min)}` },
      { label: "Respuesta humana promedio", value: formatDuration(overview.response?.avg_human_response_avg_min), hint: "turnos post-handoff", tone: "info" },
    ],
    [overview]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setTableQuery((prev) => ({
        ...prev,
        page: 1,
        search: searchDraft.trim(),
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    return () => {
      Object.values(tableFlagPending.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const tableParamsKey = useMemo(
    () =>
      JSON.stringify({
        period: selectedPeriod,
        channel: selectedChannel || "",
        ...tableQuery,
      }),
    [selectedPeriod, selectedChannel, tableQuery]
  );

  useEffect(() => {
    if (viewMode !== "table") {
      return undefined;
    }
    let active = true;
    async function loadTable() {
      setTableLoading(true);
      setTableError("");
      try {
        const params = buildTableParams({
          selectedPeriod,
          selectedChannel,
          query: tableQuery,
          includePaging: true,
        });
        const data = await apiGet(`/api/dashboard/table?${params.toString()}`);
        if (!active) return;
        const rows = data?.rows || [];
        setTableRows(rows);
        setTableTotal(data?.total || 0);
        setTableFlagMap(
          Object.fromEntries(rows.map((row) => [row.id, getRowFlags(row)]))
        );
      } catch (error) {
        if (!active) return;
        setTableRows([]);
        setTableTotal(0);
        setTableFlagMap({});
        setTableError(error?.message || "No se pudo cargar la tabla");
      } finally {
        if (active) {
          setTableLoading(false);
        }
      }
    }

    void loadTable();
    return () => {
      active = false;
    };
  }, [tableParamsKey, selectedPeriod, selectedChannel, tableQuery, tableReloadSeq, viewMode]);

  async function handleExportPdf() {
    setExportingPdf(true);
    setExportMeta(null);
    try {
      const params = buildTableParams({
        selectedPeriod,
        selectedChannel,
        query: tableQuery,
        includePaging: false,
      });
      const data = await apiGet(`/api/dashboard/table/export?${params.toString()}`);
      const rows = data?.rows || [];
      const doc = new jsPDF({ orientation: "landscape" });
      autoTable(doc, {
        head: [[
          "Paciente",
          "Numero",
          "Fecha",
          "Etiquetas",
          "Operador",
          "1ra resp.",
          "Prom. resp.",
          "Odoo",
          "Remarketing",
          "Asistio",
        ]],
        body: rows.map((row) => [
          row.patient_display || row.patient || "[sin nombre]",
          row.number || "-",
          formatTableDate(row.date),
          (row.tags || []).join(", "),
          row.operator_display || "Sin asignar",
          formatDuration(row.first_human_response_min),
          formatDuration(row.avg_human_response_min),
          MATCH_STATUS_LABELS[row.odoo_match_status] || row.odoo_match_status || "Sin match",
          row.remarketing ? "Si" : "No",
          row.asistio ? `Si (${row.asistio_source || "manual"})` : "No",
        ]),
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [29, 78, 216],
        },
      });
      const filenameDate = new Date().toISOString().split("T")[0];
      doc.save(`dashboard-tabla-${filenameDate}.pdf`);
      setExportMeta({
        rows: rows.length,
        total: data?.total || rows.length,
        truncated: Boolean(data?.truncated),
      });
    } catch (error) {
      setExportMeta({ error: error?.message || "No se pudo exportar PDF" });
    } finally {
      setExportingPdf(false);
    }
  }

  function handleToggleFlag(row, field, value) {
    const previousFlags = getRowFlags(row, tableFlagMap[row.id]);
    const nextFlags = { ...previousFlags, [field]: value };
    setTableFlagMap((prev) => ({
      ...prev,
      [row.id]: nextFlags,
    }));

    clearTimeout(tableFlagPending.current[row.id]);
    tableFlagPending.current[row.id] = setTimeout(async () => {
      try {
        await apiPatch(`/api/dashboard/table/row/${row.id}`, nextFlags);
        setTableReloadSeq((prev) => prev + 1);
      } catch (error) {
        setTableFlagMap((prev) => ({
          ...prev,
          [row.id]: previousFlags,
        }));
      } finally {
        delete tableFlagPending.current[row.id];
      }
    }, 250);
  }

  const tableRangeStart = tableTotal === 0 ? 0 : (tableQuery.page - 1) * tableQuery.page_size + 1;
  const tableRangeEnd = Math.min(tableTotal, tableQuery.page * tableQuery.page_size);
  const tablePanel = (
    <Panel
      title="Tabla operativa"
      subtitle="Drilldown con tiempos por chat y estado Odoo"
      className="panel-table overview-table-screen"
      actions={
        exportMeta ? (
          <span className="overview-export-meta">
            {exportMeta.error
              ? exportMeta.error
              : `${exportMeta.rows}/${exportMeta.total}${exportMeta.truncated ? " truncado" : ""}`}
          </span>
        ) : null
      }
    >
      <div className="overview-table-topbar">
        <div className="overview-table-toolbar">
          <label className="ui-search overview-table-search">
            <span>Buscar</span>
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Paciente, numero o linea"
            />
          </label>

          <select
            className="dash-filter"
            value={tableQuery.tag}
            onChange={(event) => setTableQuery((prev) => ({ ...prev, page: 1, tag: event.target.value }))}
          >
            <option value="">Todas las etiquetas</option>
            {tags.map((tag) => (
              <option key={tag.id || tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>

          <select
            className="dash-filter"
            value={tableQuery.operator_id}
            onChange={(event) => setTableQuery((prev) => ({ ...prev, page: 1, operator_id: event.target.value }))}
          >
            <option value="">Todos los operadores</option>
            <option value="unassigned">Sin asignar</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>

          <select
            className="dash-filter"
            value={tableQuery.call}
            onChange={(event) => setTableQuery((prev) => ({ ...prev, page: 1, call: event.target.value }))}
          >
            <option value="">Llamada: todos</option>
            <option value="yes">Con llamada</option>
            <option value="no">Sin llamada</option>
          </select>

          <select
            className="dash-filter"
            value={tableQuery.message}
            onChange={(event) => setTableQuery((prev) => ({ ...prev, page: 1, message: event.target.value }))}
          >
            <option value="">Mensaje: todos</option>
            <option value="yes">Con mensaje</option>
            <option value="no">Sin mensaje</option>
          </select>

          <select
            className="dash-filter"
            value={`${tableQuery.sort_by}:${tableQuery.sort_order}`}
            onChange={(event) => {
              const [sortBy, sortOrder] = event.target.value.split(":");
              setTableQuery((prev) => ({
                ...prev,
                page: 1,
                sort_by: sortBy,
                sort_order: sortOrder,
              }));
            }}
          >
            <option value="date:desc">Fecha desc</option>
            <option value="date:asc">Fecha asc</option>
            <option value="patient:asc">Paciente A-Z</option>
            <option value="number:asc">Numero asc</option>
            <option value="operator:asc">Operador A-Z</option>
          </select>
        </div>

        <div className="overview-table-meta">
          <span>
            Mostrando {tableRangeStart} - {tableRangeEnd} de {tableTotal.toLocaleString("es-BO")}
          </span>
        </div>
      </div>

      <div className="overview-table-wrap">
        <table className="overview-table">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Numero</th>
              <th>Fecha</th>
              <th>Etiquetas</th>
              <th>Operador</th>
              <th>1ra resp.</th>
              <th>Prom. resp.</th>
              <th>Odoo</th>
              <th>Remarketing</th>
              <th>Asistio</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading && (
              <tr>
                <td colSpan="10" className="overview-table-empty">Cargando filas...</td>
              </tr>
            )}
            {!tableLoading && tableError && (
              <tr>
                <td colSpan="10" className="overview-table-empty error">{tableError}</td>
              </tr>
            )}
            {!tableLoading && !tableError && tableRows.length === 0 && (
              <tr>
                <td colSpan="10" className="overview-table-empty">Sin resultados</td>
              </tr>
            )}
            {!tableLoading && !tableError && tableRows.map((row) => {
              const rowFlags = getRowFlags(row, tableFlagMap[row.id]);
              return (
                <tr key={row.id}>
                  <td>
                    <div className="overview-table-patient">
                      <strong>{row.patient_display || row.patient || "[sin nombre]"}</strong>
                      <span>{row.line || "-"}</span>
                    </div>
                  </td>
                  <td>{row.number || "-"}</td>
                  <td>{formatTableDate(row.date)}</td>
                  <td>
                    <div className="overview-tag-list">
                      {(row.tags || []).length ? (
                        row.tags.map((tag) => (
                          <span key={`${row.id}-${tag}`} className="overview-tag-pill">{tag}</span>
                        ))
                      ) : (
                        <span className="overview-muted">Sin etiquetas</span>
                      )}
                    </div>
                  </td>
                  <td>{row.operator_display || "Sin asignar"}</td>
                  <td>{formatDuration(row.first_human_response_min)}</td>
                  <td>{formatDuration(row.avg_human_response_min)}</td>
                  <td>
                    <span className={`overview-status-pill tone-${MATCH_STATUS_TONES[row.odoo_match_status] || "muted"}`}>
                      {MATCH_STATUS_LABELS[row.odoo_match_status] || row.odoo_match_status || "Sin match"}
                    </span>
                  </td>
                  <td>
                    <label className="overview-check">
                      <input
                        type="checkbox"
                        checked={rowFlags.remarketing}
                        onChange={(event) => handleToggleFlag(row, "remarketing", event.target.checked)}
                      />
                    </label>
                  </td>
                  <td>
                    <div className="overview-asistio-cell">
                      <label className="overview-check">
                        <input
                          type="checkbox"
                          checked={rowFlags.asistio}
                          onChange={(event) => handleToggleFlag(row, "asistio", event.target.checked)}
                        />
                      </label>
                      <span className="overview-asistio-source">{row.asistio_source || "--"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="overview-table-pagination">
        <button
          className="overview-btn overview-btn-secondary overview-btn-sm"
          type="button"
          disabled={tableQuery.page <= 1}
          onClick={() => setTableQuery((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
        >
          Anterior
        </button>
        <span>Pagina {tableQuery.page} / {totalPages}</span>
        <button
          className="overview-btn overview-btn-secondary overview-btn-sm"
          type="button"
          disabled={tableQuery.page >= totalPages}
          onClick={() => setTableQuery((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
        >
          Siguiente
        </button>
      </div>
    </Panel>
  );

  return (
    <section className="overview-shell">
      <header className="overview-header">
        <div className="overview-heading">
          <span className="overview-kicker">Operacion + Funnel + Odoo</span>
          <h2>Dashboard</h2>
          <p>Estado actual del inbox, rendimiento humano y conversiones reconciliadas con Odoo.</p>
        </div>
        <div className="overview-controls">
          <div className="overview-view-switch" role="tablist" aria-label="Vista dashboard">
            <button
              className={`overview-view-btn ${viewMode === "dashboard" ? "active" : ""}`}
              type="button"
              onClick={() => setViewMode("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`overview-view-btn ${viewMode === "table" ? "active" : ""}`}
              type="button"
              onClick={() => setViewMode("table")}
            >
              Tabla
            </button>
          </div>
          <select
            className="dash-filter"
            value={selectedChannel || ""}
            onChange={(event) => onChannelChange(event.target.value || null)}
          >
            <option value="">Todas las lineas</option>
            {(channels || []).map((channel) => (
              <option key={channel.phone_number_id} value={channel.phone_number_id}>
                {getChannelDashboardLabel(channel)}
              </option>
            ))}
          </select>
          <select
            className="dash-filter"
            value={selectedPeriod || "30d"}
            onChange={(event) => onPeriodChange(event.target.value)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="overview-btn overview-btn-secondary" type="button" onClick={onRefresh}>
            Actualizar
          </button>
          {viewMode === "table" ? (
            <button
              className="overview-btn overview-btn-secondary"
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? "Exportando..." : "Exportar PDF"}
            </button>
          ) : null}
          <button className="overview-btn overview-btn-primary" type="button" onClick={onGenerateReport}>
            Generar reporte
          </button>
        </div>
      </header>

      {viewMode === "dashboard" ? (
        <div className="overview-grid">
          <section className="overview-stats">
            {topCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </section>

          <Panel
            title="Serie diaria"
            subtitle="Entrantes, bot y humano"
            className="panel-timeline"
          >
            <TimelineChart items={overview.period_summary?.message_timeline || []} />
          </Panel>

          <Panel
            title="Estado actual"
            subtitle="Distribucion instantanea"
            className="panel-status"
          >
            <DonutChart data={overview.live?.status_distribution || []} />
          </Panel>

          <Panel
            title="Funnel del flow"
            subtitle={(overview.funnel?.tracking_ready ? "Unico por conversacion" : "Desde despliegue del tracking")}
            className="panel-funnel"
          >
            <FunnelChart steps={overview.funnel?.steps || []} />
          </Panel>

          <Panel
            title="Equipo"
            subtitle="Promedios post-handoff por operador"
            className="panel-team"
          >
            <TeamTable team={overview.team || []} />
          </Panel>

          <Panel
            title="Odoo"
            subtitle="Match por telefono y salud del sync"
            className="panel-odoo"
          >
            <OdooStatusPanel odoo={overview.odoo} />
          </Panel>

          <Panel
            title="Temas top"
            subtitle="Nodos mas visitados del flow"
            className="panel-topics"
          >
            <BarList items={overview.funnel?.top_topics || []} />
          </Panel>

          <Panel
            title="Nodos activos"
            subtitle="Sesiones abiertas por nodo"
            className="panel-nodes"
          >
            <BarList items={(overview.live?.current_nodes || []).map((item) => ({ ...item, label: item.node_id }))} />
          </Panel>
        </div>
      ) : (
        tablePanel
      )}
    </section>
  );
}

export default DashboardView;
