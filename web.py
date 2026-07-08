# -*- coding: utf-8 -*-
"""
Interfaz web del mini agente (Flask).

Es el MISMO bucle agéntico de agent.py, pero en vez de imprimir en la
terminal, va enviando cada paso al navegador en streaming (una línea JSON
por evento), y el navegador los va pintando en el chat.

Ejecutar:  python web.py   ->  se abre http://127.0.0.1:5000
"""

import json
import sys
import threading
import webbrowser

import ollama
from flask import Flask, Response, render_template, request

import tools
from agent import MAX_ITERACIONES, MODELO, SYSTEM_PROMPT
from tools import TOOLS, ejecutar_herramienta

app = Flask(__name__)

# La memoria de la conversación (compartida mientras el servidor esté vivo)
messages = [{"role": "system", "content": SYSTEM_PROMPT}]


def evento(tipo: str, texto: str) -> str:
    """Una línea JSON por evento: el navegador las lee según llegan."""
    return json.dumps({"tipo": tipo, "texto": texto}, ensure_ascii=False) + "\n"


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/reiniciar")
def reiniciar():
    """Borra la memoria y empieza una conversación nueva."""
    del messages[1:]  # conserva solo el system prompt
    return {"ok": True}


@app.post("/chat")
def chat():
    datos = request.get_json()
    # El interruptor de la web decide si se permiten comandos de terminal
    tools.AUTO_CONFIRMAR = bool(datos.get("permitir_comandos"))
    messages.append({"role": "user", "content": datos["mensaje"]})

    def generar():
        # === El mismo bucle agéntico de agent.py ===
        for _ in range(MAX_ITERACIONES):
            respuesta = ollama.chat(model=MODELO, messages=messages, tools=TOOLS)
            mensaje = respuesta["message"]
            messages.append(mensaje)

            pensamiento = (mensaje.get("thinking") or "").strip()
            if pensamiento:
                yield evento("pensando", pensamiento[:300])

            # Condición de parada: sin herramientas = respuesta final
            if not mensaje.get("tool_calls"):
                contenido = (mensaje.get("content") or "").strip()
                yield evento("final", contenido or pensamiento)
                return

            for tool_call in mensaje["tool_calls"]:
                nombre = tool_call["function"]["name"]
                argumentos = tool_call["function"]["arguments"] or {}
                if isinstance(argumentos, str):
                    argumentos = json.loads(argumentos)

                yield evento("herramienta",
                             f"{nombre}({json.dumps(argumentos, ensure_ascii=False)[:120]})")
                resultado = ejecutar_herramienta(nombre, argumentos)
                messages.append({"role": "tool", "tool_name": nombre, "content": resultado})
                yield evento("resultado", resultado[:200])

        yield evento("final", f"(detenido: alcancé el máximo de {MAX_ITERACIONES} pasos)")

    return Response(generar(), mimetype="application/x-ndjson")


if __name__ == "__main__":
    if "--sin-navegador" not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=5000, debug=False)
