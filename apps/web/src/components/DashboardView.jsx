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

function formatChartLabel(value) {
  if (!value) return "--";
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

// Elimina emojis y caracteres especiales, solo letras, números y puntuación básica
function sanitizeName(name) {
  if (!name) return "-";
  const cleaned = name.replace(/[^\p{L}\p{N}\s.\-,'()]/gu, "").trim();
  return cleaned || "-";
}

function formatChange(value, suffix = "%") {
  if (value === null || value === undefined) return null;
  return value > 0 ? `+${value}${suffix}` : `${value}${suffix}`;
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
  const [viewMode, setViewMode] = useState("cards");
  const [hoveredBar, setHoveredBar] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tableRows, setTableRows] = useState([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState("");
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

  const operators = metrics?.operators ?? [];
  const efficiencyValue = Math.round(metrics?.team_efficiency ?? 0);
  const dailyGoal = metrics?.daily_goal ?? 500;
  const resolvedToday = metrics?.resolved_today ?? 0;

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(tableTotal / tableQuery.page_size));
  }, [tableTotal, tableQuery.page_size]);

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

  const tableParamsKey = useMemo(() => {
    return JSON.stringify({
      period: selectedPeriod,
      channel: selectedChannel || "",
      ...tableQuery,
    });
  }, [selectedPeriod, selectedChannel, tableQuery]);

  useEffect(() => {
    if (viewMode !== "table") {
      return;
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
          Object.fromEntries(
            rows.map((row) => [row.id, getRowFlags(row)])
          )
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
  }, [viewMode, tableParamsKey, selectedPeriod, selectedChannel, tableQuery, tableReloadSeq]);

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
      const generatedAt = new Date().toLocaleString("es-BO");
      const periodLabel = PERIOD_OPTIONS.find((option) => option.value === (selectedPeriod || "30d"))?.label || "Ultimo mes";
      const lineLabel = selectedChannel
        ? getChannelDashboardLabel((channels || []).find((line) => line.phone_number_id === selectedChannel)) || selectedChannel
        : "Todas las lineas";

      doc.setFontSize(13);
      doc.text("Reporte Dashboard - Vista Tabla", 14, 12);
      doc.setFontSize(10);
      doc.text(`Periodo: ${periodLabel}`, 14, 18);
      doc.text(`Linea: ${lineLabel}`, 14, 23);
      doc.text(`Generado: ${generatedAt}`, 14, 28);

      const body = rows.map((row) => ([
        row.patient || "-",
        row.number || "-",
        formatTableDate(row.date),
        row.call ? "Si" : "No",
        row.message ? "Si" : "No",
        row.tag || "-",
        row.operator || "-",
        row.line || "-",
        row.remarketing ? "Si" : "No",
        row.asistio ? "Si" : "No",
      ]));

      autoTable(doc, {
        startY: 34,
        head: [[
          "Paciente",
          "Numero",
          "Fecha",
          "Llamada",
          "Mensaje",
          "Etiqueta",
          "Operador",
          "Linea",
          "Remarketing",
          "Asistio",
        ]],
        body,
        styles: {
          fontSize: 8,
          cellPadding: 1.6,
        },
        headStyles: {
          fillColor: [30, 58, 138],
        },
      });

      if (data?.truncated) {
        const y = (doc.lastAutoTable?.finalY || 34) + 8;
        doc.setTextColor(176, 0, 32);
        doc.text(
          `Aviso: exportacion truncada al limite de ${data.limit || rows.length} filas.`,
          14,
          y
        );
      }

      const filenameDate = new Date().toISOString().split("T")[0];
      doc.save(`dashboard-tabla-${filenameDate}.pdf`);
      setExportMeta({
        total: data?.total || rows.length,
        rows: rows.length,
        truncated: Boolean(data?.truncated),
      });
    } catch (error) {
      setTableError(error?.message || "No se pudo exportar el PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  function handleFlagChange(row, field, value) {
    const previousFlags = getRowFlags(row, tableFlagMap[row.id]);
    const nextFlags = {
      ...previousFlags,
      [field]: Boolean(value),
    };

    setTableFlagMap((prev) => ({
      ...prev,
      [row.id]: nextFlags,
    }));

    clearTimeout(tableFlagPending.current[row.id]);
    tableFlagPending.current[row.id] = setTimeout(async () => {
      try {
        await apiPatch(`/api/dashboard/table/row/${row.id}`, nextFlags);
        setTableRows((prev) =>
          prev.map((item) =>
            item.id === row.id ? { ...item, ...nextFlags } : item
          )
        );
      } catch {
        setTableFlagMap((prev) => ({
          ...prev,
          [row.id]: previousFlags,
        }));
      } finally {
        delete tableFlagPending.current[row.id];
      }
    }, 500);
  }

  const tableRangeStart = tableTotal === 0 ? 0 : (tableQuery.page - 1) * tableQuery.page_size + 1;
  const tableRangeEnd = Math.min(tableTotal, tableQuery.page * tableQuery.page_size);

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
          <div className="dashboard-actions dashboard-actions-wrap">
            <div className="dash-view-toggle">
              <button
                className={`dash-view-btn ${viewMode === "cards" ? "active" : ""}`}
                type="button"
                onClick={() => setViewMode("cards")}
              >
                Dashboard
              </button>
              <button
                className={`dash-view-btn ${viewMode === "table" ? "active" : ""}`}
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
            <button
              className="ghost"
              type="button"
              onClick={() => {
                if (viewMode === "table") {
                  setTableReloadSeq((value) => value + 1);
                } else {
                  onRefresh();
                }
              }}
            >
              Actualizar
            </button>
            <button className="primary" type="button" onClick={onGenerateReport}>
              Generar Reporte
            </button>
            {viewMode === "table" && (
              <button
                className="primary"
                type="button"
                onClick={handleExportPdf}
                disabled={exportingPdf}
              >
                {exportingPdf ? "Exportando..." : "Exportar PDF"}
              </button>
            )}
          </div>
        </header>

        {viewMode === "cards" ? (
          <>
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
                    <div className="dash-kpi-label">Contactos unicos</div>
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
                    <div className="dash-kpi-label">Tasa de conversion</div>
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
                  <div className="dash-card-subtitle">Volumen diario por direccion</div>
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
                      <line className="dash-chart-grid" x1="20" y1="45" x2={chartWidth - 10} y2="45" />
                      <line className="dash-chart-grid" x1="20" y1="110" x2={chartWidth - 10} y2="110" />
                      <line className="dash-chart-grid" x1="20" y1="175" x2={chartWidth - 10} y2="175" />

                      <text className="dash-chart-axis" x="15" y="48" textAnchor="end">{maxValue}</text>
                      <text className="dash-chart-axis" x="15" y="113" textAnchor="end">{Math.round(maxValue / 2)}</text>
                      <text className="dash-chart-axis" x="15" y="178" textAnchor="end">0</text>

                      {bars.map((bar, index) => (
                        <g
                          key={`bar-${index}`}
                          onMouseEnter={(event) => handleBarMouseEnter(bar, event)}
                          onMouseLeave={handleBarMouseLeave}
                          style={{ cursor: "pointer" }}
                        >
                          <rect
                            x={bar.x - 5}
                            y={baseline - Math.max(bar.inHeight, bar.outHeight) - 10}
                            width={barWidth * 2 + barGap + 10}
                            height={Math.max(bar.inHeight, bar.outHeight) + 20}
                            fill="transparent"
                          />
                          <rect
                            className="dash-bar in"
                            x={bar.x}
                            y={baseline - bar.inHeight}
                            width={barWidth}
                            height={Math.max(bar.inHeight, 2)}
                            rx="4"
                          />
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
          </>
        ) : (
          <div className="dash-card dash-table-card">
            <div className="dash-table-toolbar">
              <label className="ui-search dash-table-search">
                <span className="ui-search-icon template-search-icon" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Buscar por paciente, numero, etiqueta, operador o linea"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                />
              </label>
              <select
                className="dash-filter"
                value={tableQuery.tag}
                onChange={(event) =>
                  setTableQuery((prev) => ({ ...prev, page: 1, tag: event.target.value }))
                }
              >
                <option value="">Todas las etiquetas</option>
                {(tags || []).map((tag) => (
                  <option key={tag.id || tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <select
                className="dash-filter"
                value={tableQuery.operator_id}
                onChange={(event) =>
                  setTableQuery((prev) => ({ ...prev, page: 1, operator_id: event.target.value }))
                }
              >
                <option value="">Todos los operadores</option>
                <option value="unassigned">Sin asignar</option>
                {(users || [])
                  .filter((user) => user.role !== "admin")
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
              </select>
              <select
                className="dash-filter"
                value={tableQuery.call}
                onChange={(event) =>
                  setTableQuery((prev) => ({ ...prev, page: 1, call: event.target.value }))
                }
              >
                <option value="">Llamada: todos</option>
                <option value="si">Llamada: si</option>
                <option value="no">Llamada: no</option>
              </select>
              <select
                className="dash-filter"
                value={tableQuery.message}
                onChange={(event) =>
                  setTableQuery((prev) => ({ ...prev, page: 1, message: event.target.value }))
                }
              >
                <option value="">Mensaje: todos</option>
                <option value="si">Mensaje: si</option>
                <option value="no">Mensaje: no</option>
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
                <option value="patient:desc">Paciente Z-A</option>
                <option value="number:asc">Numero asc</option>
                <option value="number:desc">Numero desc</option>
              </select>
            </div>

            <div className="dash-table-meta">
              <div>
                Mostrando {tableRangeStart} - {tableRangeEnd} de {tableTotal.toLocaleString("es-BO")}
              </div>
              {exportMeta && (
                <div className="dash-muted">
                  Exportado: {exportMeta.rows} filas
                  {exportMeta.truncated ? " (truncado por limite)" : ""}
                </div>
              )}
            </div>

            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Numero</th>
                    <th>Fecha</th>
                    <th>Llamada</th>
                    <th>Mensaje</th>
                    <th>Etiquetas</th>
                    <th>Operador</th>
                    <th>Linea</th>
                    <th>Remarketing</th>
                    <th>Asistio</th>
                  </tr>
                </thead>
                <tbody>
                  {tableLoading && (
                    <tr>
                      <td colSpan="10" className="dash-table-empty">Cargando filas...</td>
                    </tr>
                  )}
                  {!tableLoading && tableError && (
                    <tr>
                      <td colSpan="10" className="dash-table-empty error">{tableError}</td>
                    </tr>
                  )}
                  {!tableLoading && !tableError && tableRows.length === 0 && (
                    <tr>
                      <td colSpan="10" className="dash-table-empty">Sin resultados</td>
                    </tr>
                  )}
                  {!tableLoading && !tableError && tableRows.map((row) => {
                    const rowFlags = getRowFlags(row, tableFlagMap[row.id]);

                    return (
                      <tr key={row.id}>
                        <td className="dash-td-name">{sanitizeName(row.patient)}</td>
                        <td>{row.number || "-"}</td>
                        <td>{formatTableDate(row.date)}</td>
                        <td>
                          <span className={`dash-bool-pill ${row.call ? "yes" : "no"}`}>
                            {row.call ? "Si" : "No"}
                          </span>
                        </td>
                        <td>
                          <span className={`dash-bool-pill ${row.message ? "yes" : "no"}`}>
                            {row.message ? "Si" : "No"}
                          </span>
                        </td>
                        <td className="dash-td-tags-cell">
                          <div className="dash-tags-list">
                            {(row.tags || (row.tag ? [row.tag] : [])).length > 0
                              ? (row.tags || [row.tag]).map((t) => (
                                <span className="dash-tag-chip" key={t}>{t}</span>
                              ))
                              : <span className="dash-muted">-</span>
                            }
                          </div>
                        </td>
                        <td>
                          {row.operator || <span className="dash-muted">Sin asignar</span>}
                        </td>
                        <td>{row.line || <span className="dash-muted">-</span>}</td>
                        <td className="dash-flag-cell">
                          <input
                            className="dash-flag-checkbox"
                            type="checkbox"
                            checked={Boolean(rowFlags.remarketing)}
                            onChange={(event) =>
                              handleFlagChange(row, "remarketing", event.target.checked)
                            }
                            aria-label={`Remarketing para ${row.patient || row.number || row.id}`}
                          />
                        </td>
                        <td className="dash-flag-cell">
                          <input
                            className="dash-flag-checkbox"
                            type="checkbox"
                            checked={Boolean(rowFlags.asistio)}
                            onChange={(event) =>
                              handleFlagChange(row, "asistio", event.target.checked)
                            }
                            aria-label={`Asistio para ${row.patient || row.number || row.id}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="dash-table-pagination">
              <button
                className="ghost"
                type="button"
                disabled={tableQuery.page <= 1}
                onClick={() =>
                  setTableQuery((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                }
              >
                Anterior
              </button>
              <span>Pagina {tableQuery.page} / {totalPages}</span>
              <button
                className="ghost"
                type="button"
                disabled={tableQuery.page >= totalPages}
                onClick={() =>
                  setTableQuery((prev) => ({
                    ...prev,
                    page: Math.min(totalPages, prev.page + 1),
                  }))
                }
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="dashboard-side">
        {viewMode === "cards" && (
          <div className="dash-card">
            <div className="dash-card-title">Performance de Operadores</div>
            <div className="dash-card-subtitle">
              Top 10 - {PERIOD_OPTIONS.find((option) => option.value === selectedPeriod)?.label || "Ultimo mes"}
            </div>
            <div className="dash-operator-help">
              <small>
                <strong>Cerrados:</strong> Conversaciones que el operador resolvio (status cerrado).
                <br />
                <strong>En curso:</strong> Conversaciones asignadas que aun estan activas.
              </small>
            </div>
            <div className="dash-operator-list">
              {operators.length > 0 ? (
                operators.map((item, index) => (
                  <div className="dash-operator" key={item.id || `op-${index}`}>
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
        )}

        <div className="dash-card">
          <div className="dash-card-title">Eficiencia de Equipo</div>
          <div className="dash-efficiency">
            <div className="dash-efficiency-value">{efficiencyValue}%</div>
            <div className="dash-progress">
              <div className="dash-progress-fill" style={{ width: `${efficiencyValue}%` }} />
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
