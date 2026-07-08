# -*- coding: utf-8 -*-
"""
Herramientas de CIBERSEGURIDAD para el agente (uso educativo y defensivo).

⚠️  ÉTICA Y LEGALIDAD (léelo, es lo más importante de todo el proyecto):
    Escanear o atacar sistemas que no son tuyos y sin permiso explícito es
    DELITO en casi todos los países. Estas herramientas están limitadas por
    código a tu propia máquina (localhost) y redes privadas (RFC 1918), que
    es donde tienes permiso para practicar. Un pentester profesional SIEMPRE
    trabaja con autorización por escrito.

Cada herramienta enseña un concepto distinto:
  - escanear_puertos      -> recon de red (sockets TCP, servicios, banners)
  - analizar_codigo       -> análisis estático de vulnerabilidades (SAST)
  - crackear_hash         -> por qué los hashes débiles / passwords flojas caen
  - analizar_log          -> detección de ataques (fuerza bruta) en logs
"""

import hashlib
import ipaddress
import re
import socket

from tools import _ruta_segura  # reutilizamos la "jaula" del workspace


# --------------------------------------------------------- 1) escáner de puertos

# Puertos comunes con el servicio que suele correr en ellos (para explicar hallazgos)
SERVICIOS = {
    21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS", 80: "HTTP",
    110: "POP3", 135: "MSRPC", 139: "NetBIOS", 143: "IMAP", 443: "HTTPS",
    445: "SMB", 1433: "MSSQL", 3306: "MySQL", 3389: "RDP (escritorio remoto)",
    5432: "PostgreSQL", 5900: "VNC", 6379: "Redis", 8080: "HTTP alternativo",
    8443: "HTTPS alternativo", 27017: "MongoDB",
}


def _es_objetivo_permitido(host: str) -> bool:
    """Solo se permite escanear localhost y direcciones PRIVADAS.
    Esto impide por diseño escanear internet / sistemas ajenos."""
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(host))
        return ip.is_private or ip.is_loopback
    except (socket.gaierror, ValueError):
        return False


def escanear_puertos(host: str = "127.0.0.1", puertos: str = "comunes") -> str:
    """Escanea puertos TCP de un host LOCAL. 'puertos' puede ser 'comunes'
    o un rango como '1-1024'. Hace un 'connect scan' e intenta leer el banner."""
    if not _es_objetivo_permitido(host):
        return (f"DENEGADO: '{host}' no es una dirección local/privada. "
                "Por ética y ley, esta herramienta solo escanea tu propia red. "
                "Prueba con 127.0.0.1 o una IP de tu LAN (192.168.x.x).")

    if puertos == "comunes":
        lista = sorted(SERVICIOS.keys())
    else:
        try:
            ini, fin = map(int, puertos.split("-"))
            lista = range(ini, min(fin, ini + 2000) + 1)  # tope de seguridad
        except ValueError:
            return "ERROR: formato de puertos inválido. Usa 'comunes' o '1-1024'."

    abiertos = []
    for puerto in lista:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.4)
            if s.connect_ex((host, puerto)) == 0:  # 0 = conexión establecida
                banner = ""
                try:
                    s.settimeout(0.6)
                    banner = s.recv(80).decode("utf-8", "replace").strip()
                except OSError:
                    pass
                servicio = SERVICIOS.get(puerto, "desconocido")
                abiertos.append(f"  {puerto}/tcp  {servicio}"
                                + (f"  — banner: {banner}" if banner else ""))

    if not abiertos:
        return f"Escaneo de {host}: ningún puerto abierto en el rango elegido."
    return f"Puertos ABIERTOS en {host}:\n" + "\n".join(abiertos)


# ------------------------------------------------ 2) análisis estático de código

# Patrones de vulnerabilidades típicas (versión educativa de un SAST real)
REGLAS_VULN = [
    (r"password\s*=\s*['\"][^'\"]+['\"]", "ALTA", "Contraseña escrita directamente en el código (hardcoded secret)"),
    (r"\beval\s*\(",                      "ALTA", "Uso de eval(): permite ejecución de código arbitrario"),
    (r"\bexec\s*\(",                      "ALTA", "Uso de exec(): permite ejecución de código arbitrario"),
    (r"os\.system\s*\(",                  "MEDIA", "os.system() con entrada del usuario -> inyección de comandos"),
    (r"shell\s*=\s*True",                 "MEDIA", "subprocess con shell=True -> riesgo de inyección de comandos"),
    (r"(SELECT|INSERT|UPDATE|DELETE).*\+\s*\w+", "ALTA", "SQL construido con concatenación -> inyección SQL (usa consultas parametrizadas)"),
    (r"md5\s*\(",                         "MEDIA", "MD5 es criptográficamente débil (colisiones); no lo uses para seguridad"),
    (r"verify\s*=\s*False",               "MEDIA", "Verificación de certificado TLS desactivada (verify=False)"),
    (r"pickle\.loads?\s*\(",              "ALTA", "pickle con datos no confiables -> ejecución de código"),
]


def analizar_codigo(ruta: str) -> str:
    """Analiza un archivo de código del workspace buscando vulnerabilidades comunes."""
    destino = _ruta_segura(ruta)
    try:
        with open(destino, "r", encoding="utf-8") as f:
            lineas = f.readlines()
    except FileNotFoundError:
        return f"ERROR: no existe el archivo '{ruta}'"

    hallazgos = []
    for n, linea in enumerate(lineas, start=1):
        for patron, gravedad, descripcion in REGLAS_VULN:
            if re.search(patron, linea, re.IGNORECASE):
                hallazgos.append(f"  [{gravedad}] línea {n}: {descripcion}\n      > {linea.strip()[:90]}")

    if not hallazgos:
        return f"Análisis de '{ruta}': no se encontraron vulnerabilidades de los patrones conocidos."
    return f"VULNERABILIDADES en '{ruta}' ({len(hallazgos)}):\n" + "\n".join(hallazgos)


# ------------------------------------------------------ 3) crackeo de hash (demo)

# Mini diccionario de contraseñas más usadas (los ataques reales usan millones)
DICCIONARIO = [
    "123456", "password", "123456789", "12345678", "qwerty", "abc123",
    "111111", "1234567", "sunshine", "iloveyou", "admin", "welcome",
    "monkey", "dragon", "letmein", "football", "root", "toor", "pass",
    "hola", "contraseña", "secreto", "master", "shadow", "superman",
]


def crackear_hash(hash_objetivo: str, algoritmo: str = "md5") -> str:
    """Intenta descubrir la contraseña que generó un hash, probando un diccionario.
    Enseña por qué las contraseñas débiles y los hashes sin 'salt' son inseguros.
    Algoritmos: md5, sha1, sha256."""
    algoritmo = algoritmo.lower()
    if algoritmo not in ("md5", "sha1", "sha256"):
        return "ERROR: algoritmo no soportado. Usa md5, sha1 o sha256."

    objetivo = hash_objetivo.strip().lower()
    for palabra in DICCIONARIO:
        calculado = hashlib.new(algoritmo, palabra.encode()).hexdigest()
        if calculado == objetivo:
            return (f"¡CRACKEADO! El hash {algoritmo} corresponde a: '{palabra}'\n"
                    "Lección: estaba en un diccionario de passwords comunes. "
                    "Contraseñas largas y aleatorias + 'salt' lo habrían evitado.")
    return (f"No se encontró en el diccionario de {len(DICCIONARIO)} palabras. "
            "Los ataques reales usan listas de millones (p.ej. rockyou.txt).")


# ---------------------------------------------- 4) detección de ataques en logs

def analizar_log(ruta: str, umbral: int = 5) -> str:
    """Analiza un log de accesos buscando indicios de ataque de FUERZA BRUTA:
    muchos fallos de login desde la misma IP. 'umbral' = fallos para alertar."""
    destino = _ruta_segura(ruta)
    try:
        with open(destino, "r", encoding="utf-8") as f:
            contenido = f.read()
    except FileNotFoundError:
        return f"ERROR: no existe el archivo '{ruta}'"

    # Contamos líneas de fallo por IP (formato tipo: "... 192.168.1.5 ... FAILED/failed login")
    fallos = {}
    patron_ip = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b")
    for linea in contenido.splitlines():
        if re.search(r"fail|failed|denied|invalid|401|403", linea, re.IGNORECASE):
            m = patron_ip.search(linea)
            if m:
                fallos[m.group(1)] = fallos.get(m.group(1), 0) + 1

    sospechosas = {ip: n for ip, n in fallos.items() if n >= umbral}
    if not sospechosas:
        return f"Análisis de '{ruta}': sin patrones de fuerza bruta (umbral {umbral} fallos)."
    lineas = [f"  {ip}: {n} intentos fallidos  ⚠ posible fuerza bruta"
              for ip, n in sorted(sospechosas.items(), key=lambda x: -x[1])]
    return f"IPs SOSPECHOSAS en '{ruta}':\n" + "\n".join(lineas)


# ------------------------------------------------- registro para el agente

FUNCIONES_SEGURIDAD = {
    "escanear_puertos": escanear_puertos,
    "analizar_codigo": analizar_codigo,
    "crackear_hash": crackear_hash,
    "analizar_log": analizar_log,
}

TOOLS_SEGURIDAD = [
    {
        "type": "function",
        "function": {
            "name": "escanear_puertos",
            "description": "Escanea puertos TCP de un host LOCAL (solo localhost o redes privadas). Detecta servicios abiertos y lee banners. Úsalo para reconocimiento de red.",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "description": "IP o nombre. Por defecto 127.0.0.1 (tu propia máquina)."},
                    "puertos": {"type": "string", "description": "'comunes' o un rango como '1-1024'."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analizar_codigo",
            "description": "Analiza un archivo de código del workspace buscando vulnerabilidades (secretos hardcoded, inyección SQL/comandos, eval, hashes débiles...).",
            "parameters": {
                "type": "object",
                "properties": {
                    "ruta": {"type": "string", "description": "Ruta relativa del archivo a analizar."},
                },
                "required": ["ruta"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "crackear_hash",
            "description": "Intenta averiguar la contraseña de un hash probando un diccionario. Demuestra la debilidad de passwords comunes y hashes sin salt.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hash_objetivo": {"type": "string", "description": "El hash en hexadecimal."},
                    "algoritmo": {"type": "string", "description": "md5, sha1 o sha256."},
                },
                "required": ["hash_objetivo"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analizar_log",
            "description": "Analiza un archivo de log del workspace buscando ataques de fuerza bruta (muchos fallos de login desde la misma IP).",
            "parameters": {
                "type": "object",
                "properties": {
                    "ruta": {"type": "string", "description": "Ruta relativa del archivo de log."},
                    "umbral": {"type": "integer", "description": "Nº de fallos para marcar una IP como sospechosa (por defecto 5)."},
                },
                "required": ["ruta"],
            },
        },
    },
]
