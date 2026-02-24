# Plan Bot by Codex

## Objetivo

Optimizar el bot de WhatsApp con IA para:

- mantener (o mejorar) la inteligencia del bot
- bajar consumo de tokens de forma fuerte
- respetar limites por minuto (ej. Groq TPM)
- evitar parches de heuristicas infinitas
- dejar arquitectura modular por proveedor (Groq, Gemini, OpenAI, Cloudflare Workers AI, local)
- priorizar costos bajos / gratis donde sea posible

## Principio de diseño (clave)

No usar una lista infinita de temas prohibidos.

La logica correcta es:

- definir el dominio permitido (podologia / pies)
- medir confianza
- enrutar / aclarar / descartar segun confianza

En otras palabras:

- `allowlist semantica` > `blacklist infinita`

## Diagnostico de la arquitectura actual

### Lo bueno

- El contenido canonico del negocio ya vive en nodos del flow (precios, horarios, servicios, contacto).
- Eso permite responder sin IA en muchos casos.
- Ya existe ASR local con `faster-whisper` (excelente para ahorro).
- El sistema ya separa parcialmente `aiRouter`, `flowExecutor`, `aiProviders`.

### Lo que hoy encarece / fragiliza

- `aiRouter` tiene demasiadas responsabilidades (routing + copy + parsing + fallback + heuristicas + provider branching).
- Se usa IA incluso en casos de alta obviedad que podrian resolverse por flow/reglas.
- No existe un presupuesto/cola formal por proveedor-modelo (TPM/RPM).
- La memoria conversacional no esta optimizada como estado estructurado (se usa mas como historial que como memoria util).
- El fallback puede degradar a respuestas genericas si el proveedor/modelo falla.
- Si el modelo esta bloqueado/no permitido, el sistema puede intentar mas de una vez sin valor.

## Meta de rendimiento (objetivo realista)

Para ~100 conversaciones/dia con ~5 turnos IA por conversacion (~500 turnos/dia):

- Turnos obvios (`precio`, `horario`, `ubicacion`, `menu`, `humano`): `0 tokens` (sin IA)
- Router IA normal (compacto): `< 500 tokens` por turno
- Copy conversacional real: `500-1200 tokens` solo cuando aplique
- Full fallback: raro (ideal < 10%)
- ASR: local gratis (`faster-whisper`)

## Arquitectura objetivo (modular, optimizada)

### Capa 0: Flow y reglas deterministicas (sin IA)

Se resuelve sin IA cuando hay alta confianza:

- botones/listas/interacciones
- menu / volver / inicio
- intents directos de flow (`precio`, `horario`, `ubicacion`, `contacto`)
- handoff explicito (`asesor`, `humano`) si aplica

Resultado:

- 0 tokens
- respuestas mas rapidas
- menos TPM consumido

### Capa 1: Compuerta de dominio (allowlist semantica)

Pregunta que debe responder esta capa:

- `¿el mensaje pertenece al dominio podologia de pies?`

Salidas:

- `in_domain` (alta confianza)
- `ambiguous` (media/baja confianza)
- `out_of_domain` (alta confianza)

Implementacion recomendada:

- No usar blacklist de rubros externos.
- Usar prototipos de dominio permitido:
  - servicios podologicos
  - sintomas podologicos
  - precios/horarios/ubicacion/contacto
  - variantes frecuentes de escritura

Tecnicas posibles (orden recomendado):

1. similitud semantica contra catalogo de dominio (embeddings)
2. clasificador local pequeno (dominio/no-dominio/ambiguo)
3. IA compacta solo si la confianza queda en zona gris

### Capa 2: Router IA compacto (decision only)

Uso:

- solo decide `action`, `route_id`, `clarify`, `handoff`
- no genera respuesta larga
- no recibe KB completa
- recibe contexto estructurado corto

Ventaja:

- mantiene inteligencia de enrutamiento
- reduce tokens fuerte

### Capa 3: Respuesta canonica del flow (sin IA)

Si hay `route_id` valido:

- se responde con el nodo del flow
- se evita copy IA
- se usa contenido verificado del negocio

Esto debe ser la ruta principal para:

- precios
- horarios
- ubicacion
- servicios conocidos

### Capa 4: Copy IA rica (solo bajo demanda)

Solo se usa para:

- `respond`
- `clarify`
- fuera de dominio (respuesta amable, personalizada)
- casos conversacionales donde no corresponde un nodo directo

Input recomendado:

- prompt de copy + personalidad
- snippet de KB relevante (no toda la base)
- contexto estructurado minimo

### Capa 5: Fallback completo (casos raros)

Mantener el prompt grande, pero como ultimo recurso:

- parse fail repetido
- casos ambiguos complejos
- mensajes multi-intencion complicados
- degradacion de provider

## Arquitectura modular por proveedor (obligatoria)

El router no debe depender de detalles del proveedor.

Crear/usar una capa de capacidades por proveedor-modelo:

- `generateRouteDecision()`
- `generateCopy()`
- `transcribeAudio()`
- `estimateTokens()` (aprox local si no hay tokenizer)
- `parseUsage()`
- `parseRateLimitHeaders()`
- `supportsJsonSchema`
- `supportsPromptCaching`
- `supportsAudioTranscription`

### Proveedores actuales (compatibilidad objetivo)

- Groq
- OpenAI
- Gemini
- Cloudflare Workers AI

### Proveedores futuros

Agregar adapter en `aiProviders` sin tocar la logica principal del router.

## Control de costo y limites (TPM/RPM)

### Problema

Groq (ejemplo) tiene limite de tokens por minuto. Si entran varios mensajes juntos, aunque el promedio diario sea bajo, igual se rompe.

### Solucion: AI Budget Manager (token bucket)

Implementar presupuesto por proveedor-modelo:

- `TPM` (tokens por minuto)
- `RPM` (requests por minuto) si aplica
- reserva de tokens estimados antes de cada llamada
- ajuste posterior con uso real (si la API devuelve usage)
- cola corta + degradacion elegante si no hay presupuesto

Comportamiento recomendado:

- si no hay presupuesto para `copy_rich`:
  - responder con flow o texto corto
- si no hay presupuesto para `route_compact`:
  - usar reglas + `show_services`
- loggear claramente el motivo de degradacion

## Audio (gratis / robusto)

### Estrategia recomendada

- Mantener `faster-whisper` local como principal (gratis)
- Mejorar pipeline de ASR, no solo prompt

### Mejoras de ASR (prioridad alta)

- VAD / recorte de silencios (si audio largo/ruidoso)
- deteccion de transcripcion dudosa (texto basura, muy corto, incoherente)
- segunda pasada local solo si baja confianza
- normalizacion post-ASR antes del router
- si sigue dudoso:
  - pedir aclaracion breve
  - no mandar a copy IA cara

## Memoria conversacional (reordenar enfoque)

No depender de historial textual largo en cada turno.

Guardar en `session.data` memoria estructurada:

- `current_node_id`
- `last_intent`
- `last_route_id`
- `domain_class` (`in_domain`, `ambiguous`, `out_of_domain`)
- `domain_confidence`
- `clarifications_asked`
- `ai_pending.question`
- `last_ai_stage` (`deterministic`, `route_compact`, `copy_rich`, `full_fallback`)
- `last_sent_text`
- `services_discussed`

Historial textual:

- dejarlo para operador/debug
- no enviarlo por defecto al router compacto

## Flujo ideal de un mensaje (resumen)

1. Webhook recibe mensaje/audio
2. Si audio -> ASR local (`faster-whisper`) + normalizacion
3. Resolver flow/session actual
4. Reglas deterministicas obvias (sin IA)
5. Compuerta de dominio (allowlist semantica)
6. Router IA compacto (si hace falta y hay presupuesto TPM)
7. Si `route` -> responder con nodo del flow
8. Si `respond/clarify` -> copy IA rica con snippet
9. Si falla -> fallback completo (raro)
10. Registrar metricas/costo/latencia/etapa

## Plan de implementacion por etapas (recomendado)

### Etapa 1: Observabilidad + presupuesto IA (sin romper funcionalidad)

Objetivo:

- medir exactamente costo y latencia por etapa
- controlar TPM/RPM

Cambios:

- agregar metricas por llamada IA:
  - `provider`, `model`
  - `stage` (`route_compact`, `copy_rich`, `full_fallback`, `asr`)
  - chars/tokens estimados IN/OUT
  - retries
  - latencia
  - motivo de fallback/degradacion
- implementar `AI Budget Manager` (token bucket) por proveedor-modelo

Entregable:

- logs/metrica claros para ver donde se va el costo

### Etapa 2: Compuerta de dominio (allowlist semantica)

Objetivo:

- eliminar el enfoque de blacklist infinita
- clasificar dominio con confianza

Cambios:

- catalogo de dominio permitido (servicios, sintomas, info general)
- motor de similitud / clasificador ligero
- salidas `in_domain / ambiguous / out_of_domain`

Entregable:

- decisiones de dominio reproducibles y auditables

### Etapa 3: Router compacto por defecto + copy bajo demanda

Objetivo:

- bajar tokens sin perder inteligencia

Cambios:

- router compacto como ruta principal
- copy rica solo cuando `respond/clarify`
- flow canonico para info verificable
- fallback completo solo para edge cases

Entregable:

- reduccion fuerte de tokens promedio

### Etapa 4: Memoria estructurada y limpieza de responsabilidades

Objetivo:

- simplificar `aiRouter`
- mejorar calidad con menos contexto textual

Cambios:

- mover logica a modulos:
  - `domainGate`
  - `routeDecisionService`
  - `copyService`
  - `fallbackPolicy`
  - `budgetManager`
- fortalecer memoria estructurada en session

Entregable:

- router mantenible y modular

### Etapa 5: ASR robusto gratis (faster-whisper)

Objetivo:

- mejorar entendimiento de audios sin tokens

Cambios:

- deteccion de baja confianza / basura
- segunda pasada local opcional
- normalizacion post-ASR

Entregable:

- menos errores por audio que hoy parecen “fallas de IA”

### Etapa 6: Fallbacks de proveedor/modelo

Objetivo:

- evitar caidas por modelos bloqueados/limites

Cambios:

- matriz de modelos por proveedor (permitidos / preferidos)
- fallback automatico por error:
  - `model blocked`
  - `429`
  - `quota`
  - timeout

Entregable:

- resiliencia sin duplicar llamadas inutiles

## Recomendacion de stack (costo/beneficio)

### Opcion A (recomendada si quieres gratis/casi gratis y rapido)

- ASR: `faster-whisper` local ✅
- LLM principal: `Groq` (con budget manager y router compacto)
- Fallback: flow/reglas + (opcional) otro proveedor

Ventaja:

- costo muy bajo
- buena velocidad
- facil de operar

### Opcion B (si tienes GPU propia)

- ASR: `faster-whisper` local
- LLM local servido con:
  - `Ollama` (simple)
  - o `vLLM` (mejor throughput, OpenAI-compatible)
- Groq como respaldo

Ventaja:

- casi sin limite de tokens
- control total

Nota:

- Si no tienes GPU decente, no conviene poner LLM local CPU como principal para 100 chats/dia.

## Metricas de exito (KPI)

- `% de turnos sin IA` (reglas/flow)
- `% de turnos route_compact`
- `% de turnos copy_rich`
- `% de turnos full_fallback`
- `tokens promedio por turno`
- `latencia promedio por turno`
- `errores por proveedor/modelo`
- `tasa de aclaraciones`
- `precision de enrutamiento` (sample manual)
- `fallas de ASR` / `transcripcion dudosa`

## Riesgos y mitigaciones

### Riesgo: bajar tokens y perder calidad

Mitigacion:

- fallback completo se mantiene
- pruebas A/B por etapa
- rollout gradual por tenant/flow

### Riesgo: Groq bloqueado o rate-limited

Mitigacion:

- budget manager
- fallback de modelo/proveedor
- degradacion elegante a flow

### Riesgo: audio mal transcrito

Mitigacion:

- ASR local mejorado
- deteccion de baja confianza
- aclaracion temprana

## Orden de ejecucion sugerido (practico)

1. Budget manager + metricas
2. Domain gate (allowlist semantica)
3. Router compacto + copy bajo demanda
4. Fallbacks de modelo/proveedor
5. Refactor modular del router
6. Mejoras de ASR y scoring

## Notas finales

- El valor del sistema no esta en “meter menos prompt”, sino en **usar IA donde realmente aporta**.
- El flow ya contiene mucha inteligencia de negocio (contenido canonico); eso es una ventaja que hay que explotar.
- La IA debe ser el cerebro de decisiones ambiguas, no el reemplazo de todo el flujo.

