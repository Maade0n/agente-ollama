# Guía para aprender con el agente de ciberseguridad 🛡️

**Antes de nada:** abre **`ABRIR_SEGURIDAD.bat`** (no el normal). Sabrás que estás
en el modo correcto porque arriba dice `=== MODO CIBERSEGURIDAD ===`.

**Salida limpia:** por defecto el agente muestra solo lo esencial (🔧 la
herramienta que usa y el informe final). Si algún día quieres VER cómo piensa
paso a paso (💭), abre una terminal en la carpeta y ejecuta
`python agent.py --seguridad --pensar`. Para el día a día, deja el modo limpio.

El agente tiene 4 herramientas de seguridad. Cada una enseña un concepto real
de un pentest. Aquí tienes qué pedirle, en orden, y **qué deberías aprender** de
cada ejercicio. Copia y pega las peticiones tal cual.

---

## 🟢 Nivel 1 — Reconocimiento de red (escaneo de puertos)

> escanea los puertos comunes de mi maquina 127.0.0.1 y dime que servicios hay abiertos y cuales son un riesgo

**Qué aprendes:** la primera fase de cualquier ataque/auditoría es el *recon*:
saber qué "puertas" (puertos) tiene una máquina y qué servicio corre en cada una.
En tu propio PC verás cosas reales (MySQL, MongoDB, SMB...). Pregúntale luego:

> por que es peligroso tener MongoDB abierto sin contraseña?

**Reto:** pídele que escanee el rango `1-1024` en vez de "comunes" y observa la
diferencia de tiempo. Eso es el compromiso velocidad/cobertura real de nmap.

**Prueba la ética:** pídele escanear `8.8.8.8` (un servidor de Google). Verás que
el agente lo RECHAZA. Entiende por qué: escanear sistemas ajenos es delito.

---

## 🟢 Nivel 2 — Análisis de código vulnerable (SAST)

Primero pídele que cree código malo a propósito:

> crea un archivo web_insegura.py con una consulta SQL hecha con concatenacion de strings, una contraseña escrita en el codigo y un uso de eval()

Luego:

> ahora analiza web_insegura.py en busca de vulnerabilidades y explicame cada una

**Qué aprendes:** el análisis estático (SAST) busca patrones peligrosos sin
ejecutar el código. Verás inyección SQL, secretos hardcodeados y `eval`.
Pregúntale:

> como se arregla la inyeccion SQL de ese archivo? reescribelo de forma segura

Así aprendes el antes/después: **consultas parametrizadas**, variables de entorno
para secretos, etc.

---

## 🟡 Nivel 3 — Hashes y contraseñas

> calcula tu mismo el hash md5 de la palabra "password" (crea un script y ejecutalo), y luego intenta crackear ese hash

**Qué aprendes:** cómo se guardan (mal) las contraseñas y por qué un diccionario
las rompe en milisegundos. Después reta al agente:

> ahora crackea el hash md5 de la palabra "Tr0ub4dor&3xK9!" — por que no lo consigue?

Entenderás por qué una contraseña larga y aleatoria + *salt* derrota al ataque.

---

## 🟡 Nivel 4 — Detección de ataques en logs (lado defensivo)

> crea un archivo de log falso auth.log con 20 lineas, donde la IP 192.168.1.66 tenga 8 intentos de login fallidos y el resto sean accesos normales de otras IPs

Luego:

> analiza auth.log y dime si hay algun ataque de fuerza bruta en curso

**Qué aprendes:** el lado *azul* (defensa). Un SOC detecta ataques buscando
patrones en logs. Aquí: muchos fallos desde una IP = fuerza bruta.
Pregúntale:

> que deberia hacer un administrador cuando detecta esa IP?

---

## 🔴 Nivel 5 — Encadenar todo (esto ya es un mini-pentest)

Una sola petición que obligue al agente a usar VARIAS herramientas y razonar:

> haz una mini auditoria de seguridad de mi maquina: escanea mis puertos, y por cada servicio de base de datos que encuentres abierto, explicame como un atacante lo aprovecharia y como lo protejo

**Qué aprendes:** esto es lo que hace un agente "de verdad": planifica, ejecuta
varias herramientas, junta los resultados y produce un informe. Fíjate en los
pasos en gris (💭 pensamiento, 🔧 herramienta) para ver CÓMO decide.

---

## Consejos para aprender de verdad

1. **No te quedes con el resultado: pregunta "¿por qué?"** El agente explica, y
   ahí está el aprendizaje. "por qué es peligroso", "cómo se arregla", "qué pasaría si...".
2. **Contrasta con herramientas reales.** Tienes nmap/Zenmap: escanea `127.0.0.1`
   con nmap y compara con lo que dijo el agente. ¿Coinciden los puertos?
3. **Recuerda el límite ético SIEMPRE.** Solo tu máquina o laboratorios con permiso
   (prueba máquinas de [TryHackMe](https://tryhackme.com) o [HackTheBox](https://hackthebox.com),
   que son legales y hechas para practicar).
4. **Lee el código de `tools_seguridad.py`.** Ahí ves CÓMO funciona un escáner de
   puertos por dentro (sockets TCP). Entender la herramienta > usarla a ciegas.
