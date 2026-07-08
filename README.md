# Mini agente de código 🤖

Un clon casero de **Claude Code / Aider** en ~200 líneas de Python, sin frameworks,
usando **Ollama** en local (gratis). Hecho para aprender cómo funciona un agente
de IA por dentro.

## La idea en una frase

> **Agente = LLM + herramientas + bucle + condición de parada**

Un LLM solo genera texto. Lo que lo convierte en *agente* es un bucle escrito
por nosotros que:

```
┌──────────────────────────────────────────────────┐
│  1. Usuario escribe una petición                 │
│  2. Se manda al modelo + lista de herramientas   │
│  3. ¿El modelo pide una herramienta?             │
│       SÍ → la ejecutamos, le damos el resultado, │
│            volvemos al paso 2         (Iterate)  │
│       NO → responde con texto: FIN    (Stop)     │
└──────────────────────────────────────────────────┘
```

Mapeo con el diagrama "LOOPS" típico:

| Concepto del diagrama | En este código |
|---|---|
| **Loop** | El `for` de `procesar_peticion()` en `agent.py` |
| **Memory** | La lista `messages` (toda la conversación acumulada) |
| **State** | El contenido de la carpeta `workspace/` |
| **Verifier** | El propio modelo ejecuta el código y comprueba la salida |
| **Stop condition** | El modelo responde sin pedir herramientas |
| **Cost** | `MAX_ITERACIONES` corta el bucle si se atasca |

## Archivos

- [`agent.py`](agent.py) — el bucle agéntico (el "cerebro" de la orquestación).
- [`tools.py`](tools.py) — las 4 herramientas: `listar_archivos`, `leer_archivo`,
  `escribir_archivo`, `ejecutar_comando` (esta última pide tu confirmación).
- [`web.py`](web.py) + [`templates/index.html`](templates/index.html) — interfaz
  web con Flask: el mismo bucle, pero chateando desde el navegador y viendo
  cada paso (pensamiento 💭, herramienta 🔧, resultado ↳) en streaming.
- `workspace/` — la "jaula" donde el agente trabaja. No puede tocar nada fuera.

## Cómo ejecutarlo

Requisito: Ollama encendido con el modelo `qwen3.5:4b` descargado.

```bash
pip install -r requirements.txt

python agent.py   # versión terminal  (o doble clic en ABRIR_AGENTE.bat)
python web.py     # versión web       (o doble clic en ABRIR_WEB.bat)
```

La versión web se abre sola en http://127.0.0.1:5000. El interruptor
"Permitir comandos" de la parte de abajo controla si el agente puede ejecutar
comandos de terminal (siempre confinado al workspace).

Ejemplos de peticiones para probar:

- `Crea un script fizzbuzz.py del 1 al 15 y ejecútalo para comprobar que funciona`
- `Haz una calculadora simple en calc.py y pruébala`
- `Lista los archivos y explícame qué hay en el workspace`

## Detalles importantes del código

1. **El modelo nunca ejecuta nada.** Solo *pide* ejecutar una herramienta con unos
   argumentos (JSON). Nuestro código la ejecuta y le devuelve el resultado como
   un mensaje con `role: "tool"`.
2. **Los errores también se le devuelven al modelo** como texto. Así puede
   reaccionar y corregirse (lo verás: escribe código, falla, lo lee, lo arregla).
3. **Seguridad**: rutas confinadas a `workspace/` y confirmación humana antes de
   cada comando de terminal. Nunca dejes a un agente ejecutar comandos a ciegas.
4. `qwen3.5:4b` es un modelo *razonador*: verás su "pensamiento" en gris antes
   de cada acción.

## Ideas para seguir practicando

- Añadir una herramienta `editar_archivo(buscar, reemplazar)` en vez de
  sobrescribir archivos enteros (así funciona Claude Code de verdad).
- Guardar `messages` en un JSON para que el agente tenga memoria entre sesiones.
- Añadir una herramienta de búsqueda web → lo conviertes en un *deep research agent*.
- Probar un modelo más grande (`qwen3.5:14b` si tu PC aguanta): verás cuánto
  mejora la fiabilidad. El bucle es el mismo; la diferencia es el modelo.
- Cambiar Ollama por la API de Anthropic: solo cambia la llamada `ollama.chat()`.
