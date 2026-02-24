# Plan de Optimización del AI Router — Bot Podopie
> Elaborado por Claude Sonnet 4.6 · 2026-02-23

---

## Diagnóstico

### Problema raíz
El bot tiene un límite de **6,000 tokens por minuto (TPM)** en Groq (tier gratuito).
Con 100 conversaciones/día × 5 llamadas IA cada una = **500 llamadas/día**.
Si cada llamada consume ~5,000 tokens, en picos de tráfico se agota el cupo en segundos.

### Estado actual (antes de las correcciones)
| Componente | Tokens estimados |
|---|---|
| System prompt con 134 nodos completos | ~4,500 |
| User prompt (historial + mensaje) | ~500–700 |
| **Total por llamada** | **~5,000–5,246** |

### Estado después de corrección de `buildRoutingNodeCatalog`
| Componente | Tokens estimados |
|---|---|
| System prompt con ~27 nodos (solo button-targets) | ~550 |
| User prompt | ~300–400 |
| **Total por llamada de routing** | **~850–950** |

---

## Principio de diseño (el más importante)

> **Define LO QUE ESTÁ EN SCOPE, no lo que NO está.**

En lugar de listar infinitos temas prohibidos (peluquería, repostería, mecánico, etc.),
el sistema prompt debe decir una sola vez:

```
Si el tema NO es de pies/podología => respond (mensaje corto aclarando que solo atienden pies).
```

Eso cubre CUALQUIER tema fuera de scope con una sola regla. No se necesita `detectOutOfScopeBusinessIntent` con keywords. La IA ya sabe lo que es podología y lo que no.

---

## Fase 1 — Correcciones inmediatas (ya parcialmente aplicadas)

### 1.1 `buildRoutingNodeCatalog` ✅ (ya corregido)
- Antes: incluía los 134 nodos del flow (~18,000 chars = ~4,500 tokens)
- Ahora: solo incluye nodos que son destinos de botones (~27 nodos = ~475 tokens)
- Ubicación: `apps/api/src/services/aiRouter.js` función `buildRoutingNodeCatalog`

### 1.2 `buildCloudflareRouteSystemPrompt` ✅ (ya corregido en sesión)
- Contiene las reglas core sin listas de keywords
- Incluye la regla "si no es podología → respond" de forma compacta
- NO tiene sección "RUTAS DIRECTAS" (esa sección rompió el routing anterior)
- Prompt actual está en líneas 436–467 del archivo

### 1.3 Eliminar `detectOutOfScopeBusinessIntent` ⚠️ (pendiente)
- Función en líneas ~1201–1215 con lista `OUT_OF_SCOPE_BUSINESS_WORDS`
- Esta función lista tipos de negocio prohibidos (peluquería, barbería, repostería, etc.)
- **Acción**: Eliminar la función y la constante `OUT_OF_SCOPE_BUSINESS_WORDS`
- **Reemplazar con**: La regla ya existente en `buildCloudflareRouteSystemPrompt` es suficiente
- Motivo: La IA entiende "solo atendemos pies/podología" sin necesitar una lista de 50 rubros

### 1.4 Condition de keyword augmentation ✅ (ya corregido)
- Antes: el fallback de keywords solo corría cuando `!parsed.route_id`
- Después: corre para cualquier `action === "respond"` o `action === "clarify"`
- Esto previene que el modelo retorne `MAIN_MENU` cuando debería rutear a `PRECIOS_INFO`

---

## Fase 2 — Optimización de tokens (objetivo: ≤700 tokens/llamada de routing)

### 2.1 Arquitectura de dos llamadas (ya implementada)
El sistema ya tiene arquitectura correcta:
1. **Llamada de routing** (barata): `buildCloudflareRouteSystemPrompt` → solo decide `action` + `route_id`
   - Output máximo: 180 tokens (`maxTokens: 180`)
   - System prompt objetivo: ~550 tokens
   - User prompt objetivo: ~200–300 tokens
   - **Total objetivo: ~750–1,030 tokens/llamada**

2. **Llamada de copy** (solo si action=respond/clarify): `buildCloudflareCopyPrompt` → genera el texto
   - Solo se ejecuta para respuestas conversacionales
   - La mayoría de interacciones son `route` → no necesitan segunda llamada

### 2.2 Historial compacto
- Usar `getConversationSummary` en lugar del historial completo para el routing
- El historial completo (últimos N mensajes) solo es necesario para el copy
- Esto reduce el user prompt de routing en ~100–200 tokens

### 2.3 Presupuesto de tokens por escenario
| Escenario | Routing | Copy | Total |
|---|---|---|---|
| Usuario pide info → route | ~800 | — | **~800** |
| Usuario saluda → respond + copy | ~800 | ~600 | **~1,400** |
| Urgencia → handoff | ~800 | — | **~800** |
| Out of scope → respond + copy | ~800 | ~500 | **~1,300** |

Con 500 llamadas/día promedio y una mezcla realista (70% route, 30% respond):
- 350 llamadas × 800 tokens = 280,000 tokens/día
- 150 llamadas × 1,400 tokens = 210,000 tokens/día
- **Total: ~490,000 tokens/día**

Groq tier gratuito: 14,400 RPD × 6,000 TPM
- RPD: 500 llamadas << 14,400 ✅
- TPM: el pico depende de la concurrencia, pero 500/día distribuidas no debería saturar ✅

---

## Fase 3 — Eliminar segunda llamada IA para out_of_scope (opcional)

Actualmente para `action: "out_of_scope"` o `action: "respond"` se hace una segunda llamada para generar el texto.

**Alternativa**: Incluir el campo `text` en el JSON de routing directamente:

```json
{"action":"respond","text":"Hola, solo atendemos temas de pies y podología. ¿Puedo ayudarte con algo relacionado?","reason":"tema fuera de scope"}
```

Para esto, cambiar el schema de routing de `ROUTER_DECISION_SCHEMA` a `ROUTER_SCHEMA` (que incluye `text`)
y actualizar `buildCloudflareRouteSystemPrompt` para indicar que en caso de `respond` incluya el texto.

**Ventaja**: Elimina la segunda llamada IA para out_of_scope → -600 tokens en esos casos.
**Riesgo**: Aumenta el output máximo del routing (de 180 a ~350 tokens), puede aumentar latencia.

---

## Fase 4 — Auto-hospedado con Ollama (opción zero-costo)

### Cuándo usar Ollama
- Si el volumen crece y Groq free tier ya no alcanza
- Si se quiere cero latencia de red (servidor propio)
- Si el presupuesto de APIs es $0

### Setup
```bash
# Instalar Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Descargar modelo (~2GB RAM)
ollama pull qwen2.5:3b

# API compatible con OpenAI en localhost:11434
```

### Integración en el bot
En `apps/api/src/services/aiProviders.js`, agregar proveedor `ollama`:

```javascript
case "ollama": {
  const baseUrl = config.baseUrl || "http://localhost:11434";
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model || "qwen2.5:3b",
      messages: [
        { role: "system", content: config.system },
        { role: "user", content: config.user }
      ],
      temperature: config.temperature ?? 0,
      max_tokens: config.maxTokens || 180,
      stream: false,
    }),
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
```

En el flow (`botpoditov3.flow.js`), cambiar:
```javascript
ai: {
  provider: "ollama",  // en lugar de "groq"
  model: "qwen2.5:3b",
  ...
}
```

### Modelos recomendados por RAM disponible
| RAM | Modelo | Calidad routing |
|---|---|---|
| 2GB | qwen2.5:3b | Buena para routing simple |
| 4GB | llama3.2:3b | Mejor comprensión contextual |
| 8GB | llama3.1:8b | Equivalente a Groq actual |
| 16GB+ | qwen2.5:14b | Excelente, casi GPT-4 en tareas específicas |

---

## Resumen de cambios por archivo

### `apps/api/src/services/aiRouter.js`
- [x] `buildRoutingNodeCatalog`: filtrar solo button-targets
- [x] `buildCloudflareRouteSystemPrompt`: prompt limpio con regla "solo pies"
- [x] Keyword augmentation: correr para todo `action=respond`
- [ ] Eliminar `OUT_OF_SCOPE_BUSINESS_WORDS` y `detectOutOfScopeBusinessIntent`
- [ ] (Opcional) Usar `ROUTER_SCHEMA` en routing para incluir `text` en misma llamada

### `apps/api/src/services/aiProviders.js`
- [ ] (Opcional/Fase 4) Agregar case `"ollama"` con API OpenAI-compatible

### `apps/api/flows/botpoditov3.flow.js`
- [ ] (Opcional/Fase 4) Cambiar `provider: "groq"` a `provider: "ollama"` si se instala

---

## Anti-patrones a evitar

1. **No** agregar secciones "RUTAS DIRECTAS" con ejemplos de keywords → el modelo los confunde con IDs de nodos reales
2. **No** listar temas out-of-scope → usar una sola regla positiva (solo pies/podología)
3. **No** hacer keyword matching para reemplazar decisiones de la IA → usarlo solo como último fallback cuando la IA falla completamente
4. **No** incluir toda la knowledge base en el prompt de routing → la KB es para el copy, no para routing
5. **No** usar `historyForAI` completo en routing → usar solo el summary compacto

---

## Métricas de éxito

- Tokens por llamada de routing: **< 1,000** (actualmente ~950 después de correcciones)
- Tasa de routing correcto a `PRECIOS_INFO` para queries de precios: **> 90%**
- Tasa de out_of_scope correcto sin keyword list: **> 95%**
- Sin errores 429 en Groq con 100 conv/día × 5 llamadas: **0 rate limit errors en operación normal**
