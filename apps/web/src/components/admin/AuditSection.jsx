/**
 * AuditSection - Registros de auditoría
 */
import React from "react";

function AuditSection({ auditLogs, formatDate }) {
    return (
        <div className="panel">
            <div className="panel-title">Audit logs</div>
            <div className="table">
                <div className="table-head">
                    <span>Accion</span>
                    <span>Fecha</span>
                    <span>Data</span>
                </div>
                {auditLogs.map((log) => (
                    <div className="table-row" key={log.id}>
                        <span>{log.action}</span>
                        <span>{formatDate(log.created_at)}</span>
                        <span className="muted">
                            {JSON.stringify(log.data_json || {})}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default AuditSection;
