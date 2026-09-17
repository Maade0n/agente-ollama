# Tema 11 · Bloque 1 (Lunes) — Simulaciones cuánticas en ciencia de materiales

Solución de los 4 retos del PDF `ejercicios_lunes_alumnos`, 100% local (sin token de IBM Quantum).

## Archivo principal
- `Tema11_Bloque1_Retos_Simulacion.ipynb`

## Cómo ejecutarlo
```bash
pip install qiskit numpy matplotlib      # en Colab: la celda 0 lo instala sola
jupyter notebook Tema11_Bloque1_Retos_Simulacion.ipynb
```

## Qué resuelve cada reto

| Reto | Contenido |
|---|---|
| 1. Backends | Simulador vs QPU real; código de nube comentado + `BasicSimulator` local ejecutando un estado de Bell |
| 2. Pared algorítmica | n=20 → **1,048,576** amplitudes (16 MB); cada electrón duplica; de laptop a Frontier solo se ganan ~19 electrones |
| 3. Qubits | Mapeo 1 orbital = 1 qubit, principio de Pauli gratis, superposición (8 configuraciones con 3 qubits), entrelazamiento con entropía = 1 |
| 4. Impacto I+D | Embudo de I+D: 98.7% menos costo y 56× más rápido; tabla del costo de fallar tarde |

## Las 5 ideas del bloque
1. El problema no es velocidad, es tamaño: **2ⁿ**. Cada electrón **duplica** la memoria.
2. Más RAM no tumba la pared: duplicar toda la memoria del mundo compra **un electrón más**.
3. Los qubits escalan **linealmente**: 1 espín-orbital = 1 qubit.
4. Superposición (muchas configuraciones a la vez) + entrelazamiento (correlación física) + Pauli de regalo.
5. Simulador para desarrollar, QPU para validar — en ese orden.

> Continúa en `../tema11_bloque2/` (Bloque 2, martes): el operador hamiltoniano y Qiskit Nature.
