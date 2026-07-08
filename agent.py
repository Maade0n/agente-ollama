# -*- coding: utf-8 -*-
"""
Mini agente de código (clon casero de Claude Code / Aider) con Ollama.

La idea completa cabe en una frase:

    Un agente = un LLM + herramientas + un bucle + una condición de parada.

El flujo (el mismo del diagrama "LOOPS"):

    1. El usuario escribe una petición (Prompt).
    2. Se la mandamos al modelo junto con la lista de herramientas.
    3. Si el modelo responde pidiendo una herramienta -> la ejecutamos,
       le devolvemos el resultado, y volvemos al paso 2 (Iterate).
    4. Si el modelo responde solo con texto -> ha terminado (Stop condition),
       mostramos su respuesta y esperamos la siguiente petición del usuario.

La "memoria" del agente es simplemente la lista `messages`: todo lo que ha
pasado (peticiones, respuestas, resultados de herramientas) se acumula ahí.
"""

import json
import os
import sys

import ollama

# La consola de Windows usa cp1252 por defecto y revienta con caracteres
# especiales que a veces genera el modelo (→, emojis...). Forzamos UTF-8.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import tools
from tools import TOOLS, WORKSPACE, ejecutar_herramienta

MODELO = "qwen3.5:4b"

# ¿Arrancamos en modo ciberseguridad? (flag --seguridad, o lo activa la web)
MODO_SEGURIDAD = "--seguridad" in sys.argv

# ¿Mostrar el "pensamiento" del modelo? Por defecto NO, para no llenar la
# pantalla. Actívalo con --pensar si quieres ver cómo razona cada paso.
MOSTRAR_PENSAMIENTO = "--pensar" in sys.argv


def activar_seguridad():
    """Añade las herramientas de seguridad al catálogo del agente y devuelve
    el system prompt de analista. Se llama desde la terminal y desde la web."""
    from tools_seguridad import FUNCIONES_SEGURIDAD, TOOLS_SEGURIDAD
    tools.FUNCIONES.update(FUNCIONES_SEGURIDAD)   # ejecutar_herramienta ya las verá
    TOOLS.extend(TOOLS_SEGURIDAD)                 # el modelo ya las podrá pedir
    return SYSTEM_PROMPT_SEGURIDAD

# Límite de vueltas del bucle por petición: la red de seguridad contra
# agentes que se quedan dando vueltas para siempre (el "Cost" del diagrama).
MAX_ITERACIONES = 15

SYSTEM_PROMPT = """Eres un agente de programación que trabaja en una carpeta llamada workspace.

Reglas:
- Usa las herramientas para explorar, leer, escribir archivos y ejecutar comandos.
- Las rutas son relativas al workspace y sin prefijos: escribe "hola.txt" o "src/app.py" (NUNCA ".hola.txt", "./hola.txt" ni rutas absolutas).
- Escribe código Python bien formateado, con saltos de línea e indentación de 4 espacios. Nunca pongas todo en una sola línea.
- Si un comando falla 2 veces, deja de intentarlo y explica el problema.
- Antes de modificar un archivo existente, léelo primero.
- Después de escribir código, pruébalo ejecutándolo con ejecutar_comando.
- Cuando la tarea esté completa y verificada, responde con un resumen corto en español SIN llamar a más herramientas.
- Da respuestas breves y directas.
"""

SYSTEM_PROMPT_SEGURIDAD = """Eres un analista de ciberseguridad defensiva que trabaja en un laboratorio autorizado. Tienes herramientas de archivos y de seguridad.

Herramientas de seguridad:
- escanear_puertos: reconocimiento de red (SOLO localhost y redes privadas; por diseño rechaza objetivos públicos).
- analizar_codigo: busca vulnerabilidades en un archivo del workspace.
- crackear_hash: prueba un diccionario contra un hash (demostración didáctica).
- analizar_log: detecta ataques de fuerza bruta en un log.

Cómo trabajas (IMPORTANTE, sé eficiente):
- Usa cada herramienta UNA sola vez por objetivo. NUNCA repitas el mismo escaneo.
- NO inventes datos: un "banner" de un servicio NO es un hash; no intentes crackear texto que no sea un hash real que te haya dado el usuario.
- Recuerda el principio ético: solo se actúa sobre sistemas propios o con permiso explícito.

Formato del informe final (SIN llamar a más herramientas):
- Máximo 8 líneas en total. Nada de tablas gigantes ni emojis de sobra.
- Una línea por hallazgo con este formato: "- <servicio/problema>: <riesgo en pocas palabras> → <qué hacer>".
- Termina con UNA frase de conclusión.
"""

AZUL = "\033[94m"
VERDE = "\033[92m"
GRIS = "\033[90m"
RESET = "\033[0m"


def procesar_peticion(messages: list) -> None:
    """El corazón del agente: el bucle LLM -> herramienta -> LLM."""
    for iteracion in range(MAX_ITERACIONES):

        # 1. Preguntamos al modelo qué hacer a continuación
        respuesta = ollama.chat(model=MODELO, messages=messages, tools=TOOLS)
        mensaje = respuesta["message"]

        # Guardamos su respuesta en la memoria (aunque sea una llamada a herramienta)
        messages.append(mensaje)

        # qwen3.5 es un modelo "razonador": piensa en un campo aparte.
        # Solo lo mostramos si el usuario lo pidió con --pensar (si no, llena la pantalla).
        pensamiento = (mensaje.get("thinking") or "").strip()
        if pensamiento and MOSTRAR_PENSAMIENTO:
            print(f"{GRIS}  💭 {pensamiento[:200].replace(chr(10), ' ')}{RESET}")

        # 2. Condición de parada: si no pide herramientas, ha terminado
        if not mensaje.get("tool_calls"):
            contenido = (mensaje.get("content") or "").strip()
            # A veces el modelo deja la respuesta solo en el razonamiento
            print(f"\n{VERDE}Agente:{RESET} {contenido or pensamiento}\n")
            return

        # 3. Ejecutamos cada herramienta que pidió y le devolvemos los resultados
        for tool_call in mensaje["tool_calls"]:
            nombre = tool_call["function"]["name"]
            argumentos = tool_call["function"]["arguments"] or {}
            if isinstance(argumentos, str):  # a veces llegan como texto JSON
                argumentos = json.loads(argumentos)

            # Un paso = una línea limpia: qué herramienta usó y sus argumentos
            args_corto = json.dumps(argumentos, ensure_ascii=False)[:70]
            print(f"{GRIS}  🔧 {nombre}({args_corto}){RESET}")
            resultado = ejecutar_herramienta(nombre, argumentos)

            messages.append({
                "role": "tool",
                "tool_name": nombre,
                "content": resultado,
            })
        # ...y el bucle vuelve a empezar: el modelo verá los resultados
        # y decidirá el siguiente paso (Verify -> Iterate del diagrama).

    print(f"\n{VERDE}Agente:{RESET} (detenido: alcancé el máximo de {MAX_ITERACIONES} pasos)\n")


def main() -> None:
    os.makedirs(WORKSPACE, exist_ok=True)  # la jaula donde trabaja el agente

    if MODO_SEGURIDAD:
        system_prompt = activar_seguridad()
        print("=== MODO CIBERSEGURIDAD (laboratorio, solo redes propias) ===")
    else:
        system_prompt = SYSTEM_PROMPT

    print(f"Mini agente — modelo {MODELO} — workspace: {WORKSPACE}")
    print("Escribe tu petición (o 'salir' para terminar).\n")

    # La memoria de toda la conversación
    messages = [{"role": "system", "content": system_prompt}]

    while True:
        try:
            peticion = input(f"{AZUL}Tú:{RESET} ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not peticion:
            continue
        if peticion.lower() in ("salir", "exit", "quit"):
            break

        messages.append({"role": "user", "content": peticion})
        procesar_peticion(messages)

    print("¡Hasta luego!")


if __name__ == "__main__":
    main()
