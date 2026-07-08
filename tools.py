# -*- coding: utf-8 -*-
"""
Herramientas del agente.

Cada herramienta tiene dos partes:
  1. Un "schema" (JSON) que le describe al modelo qué hace y qué parámetros acepta.
  2. Una función de Python que la ejecuta de verdad.

El modelo NUNCA ejecuta nada: solo PIDE ejecutar una herramienta con unos
argumentos, y es nuestro código (agent.py) el que la ejecuta y le devuelve
el resultado como texto.
"""

import os
import subprocess

# El agente solo puede tocar archivos dentro de esta carpeta (su "jaula").
WORKSPACE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workspace")

# Confirmación de comandos:
#   None  -> preguntar por consola (modo terminal, agent.py)
#   True  -> permitir sin preguntar (la web lo activa con un interruptor)
#   False -> denegar siempre
AUTO_CONFIRMAR = None


def _ruta_segura(ruta: str) -> str:
    """Convierte una ruta relativa en absoluta DENTRO del workspace.
    Si intenta escaparse (.. o rutas absolutas), lanza un error."""
    destino = os.path.abspath(os.path.join(WORKSPACE, ruta))
    if not destino.startswith(os.path.abspath(WORKSPACE)):
        raise ValueError(f"Ruta fuera del workspace: {ruta}")
    return destino


# ---------------------------------------------------------------- herramientas

def listar_archivos(ruta: str = ".") -> str:
    """Lista archivos y carpetas del workspace."""
    destino = _ruta_segura(ruta)
    if not os.path.exists(destino):
        return f"ERROR: no existe la ruta '{ruta}'"
    lineas = []
    for nombre in sorted(os.listdir(destino)):
        completo = os.path.join(destino, nombre)
        sufijo = "/" if os.path.isdir(completo) else ""
        lineas.append(nombre + sufijo)
    return "\n".join(lineas) if lineas else "(carpeta vacía)"


def leer_archivo(ruta: str) -> str:
    """Devuelve el contenido de un archivo de texto."""
    destino = _ruta_segura(ruta)
    if not os.path.isfile(destino):
        return f"ERROR: no existe el archivo '{ruta}'"
    with open(destino, "r", encoding="utf-8") as f:
        return f.read()


def escribir_archivo(ruta: str, contenido: str) -> str:
    """Crea o sobrescribe un archivo con el contenido dado."""
    destino = _ruta_segura(ruta)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        f.write(contenido)
    return f"OK: escrito '{ruta}' ({len(contenido)} caracteres)"


def ejecutar_comando(comando: str) -> str:
    """Ejecuta un comando de terminal dentro del workspace.
    Pide confirmación al humano antes (¡nunca dejes a un agente ejecutar
    comandos sin supervisión!)."""
    if AUTO_CONFIRMAR is None:
        print(f"\n  ⚠ El agente quiere ejecutar: {comando}")
        if input("  ¿Permitir? (s/n): ").strip().lower() != "s":
            return "El usuario DENEGÓ la ejecución del comando."
    elif AUTO_CONFIRMAR is False:
        return ("El usuario DENEGÓ la ejecución del comando "
                "(activa 'Permitir comandos' en la web si quieres autorizarlos).")
    try:
        resultado = subprocess.run(
            comando, shell=True, cwd=WORKSPACE,
            capture_output=True, text=True, timeout=60,
            encoding="utf-8", errors="replace",
        )
        salida = (resultado.stdout + resultado.stderr).strip()
        return f"Código de salida: {resultado.returncode}\n{salida or '(sin salida)'}"
    except subprocess.TimeoutExpired:
        return "ERROR: el comando tardó más de 60 segundos y fue cancelado."


# ------------------------------------------------- registro de herramientas

# Mapa nombre -> función real
FUNCIONES = {
    "listar_archivos": listar_archivos,
    "leer_archivo": leer_archivo,
    "escribir_archivo": escribir_archivo,
    "ejecutar_comando": ejecutar_comando,
}

# Schemas que se le pasan al modelo para que sepa qué puede pedir
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "listar_archivos",
            "description": "Lista los archivos y carpetas de una ruta del workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ruta": {"type": "string", "description": "Ruta relativa. Usa '.' para la raíz."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "leer_archivo",
            "description": "Lee el contenido completo de un archivo de texto.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ruta": {"type": "string", "description": "Ruta relativa del archivo."},
                },
                "required": ["ruta"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "escribir_archivo",
            "description": "Crea o sobrescribe un archivo con el contenido indicado.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ruta": {"type": "string", "description": "Ruta relativa del archivo."},
                    "contenido": {"type": "string", "description": "Contenido completo del archivo."},
                },
                "required": ["ruta", "contenido"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ejecutar_comando",
            "description": "Ejecuta un comando de terminal (por ejemplo 'python script.py') dentro del workspace y devuelve su salida. Úsalo para probar el código que escribas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "comando": {"type": "string", "description": "El comando a ejecutar."},
                },
                "required": ["comando"],
            },
        },
    },
]


def ejecutar_herramienta(nombre: str, argumentos: dict) -> str:
    """Ejecuta la herramienta pedida por el modelo y devuelve el resultado como texto.
    Cualquier error se devuelve como texto para que el modelo pueda reaccionar."""
    funcion = FUNCIONES.get(nombre)
    if funcion is None:
        return f"ERROR: la herramienta '{nombre}' no existe."
    try:
        return str(funcion(**argumentos))
    except Exception as e:
        return f"ERROR al ejecutar {nombre}: {e}"
