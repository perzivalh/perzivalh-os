/**
 * BotSection - Configuración del Bot
 */
import React from "react";

function BotSection({ settings, setSettings, handleSaveSettings }) {
    return (
        <div className="panel">
            <div className="panel-title">Configuracion de Bot</div>
            {settings ? (
                <>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.bot_enabled}
                            onChange={(event) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    bot_enabled: event.target.checked,
                                }))
                            }
                        />
                        Bot enabled
                    </label>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.auto_reply_enabled}
                            onChange={(event) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    auto_reply_enabled: event.target.checked,
                                }))
                            }
                        />
                        Auto reply enabled
                    </label>
                    <button className="primary" onClick={handleSaveSettings}>
                        Guardar settings
                    </button>
                </>
            ) : (
                <div className="empty-state">Cargando settings...</div>
            )}
        </div>
    );
}

export default BotSection;
