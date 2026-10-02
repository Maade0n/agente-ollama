@echo off
title Chess Coach - entrenador de ajedrez
cd /d "%~dp0"
REM Abre el juego directamente en el navegador. No necesita Ollama ni Flask:
REM todo el ajedrez y el entrenador corren en JavaScript dentro del navegador.
start "" "ajedrez\index.html"
