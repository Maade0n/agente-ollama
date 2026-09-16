# Tema 11 · Bloque 2 — El Hamiltoniano, Qiskit Nature y Clásico vs. Cuántico

Solución de los 4 retos del PDF `ejercicios_martes_alumnos`, 100% local (sin token de IBM Quantum).

## Archivo principal
- `Tema11_Bloque2_Retos_Hamiltoniano.ipynb` — notebook con explicación conceptual, código ejecutable
  y la respuesta escrita de cada reto.

## Cómo ejecutarlo
```bash
pip install qiskit numpy matplotlib   # en Colab: !pip install -q qiskit
jupyter notebook Tema11_Bloque2_Retos_Hamiltoniano.ipynb
```
Solo se usa `qiskit.quantum_info` (cálculo local). No se requiere cuenta, token ni PySCF.

## Resultados que produce (coinciden con los esperados en clase)

| Reto | Resultado |
|---|---|
| 1. Mapeo del Hamiltoniano | `SparsePauliOp(['II','IZ','ZI','ZZ','XX'])` + matriz 4×4 verificada a mano |
| 2. Espectro de energía | `[-1.8605, -1.22, -0.86, -0.2595]` Ha → estado fundamental **−1.8605 Ha**; curva E(R) con mínimo ≈ 0.725 Å |
| 3. Mitigación ZNE | medidas a λ=1,2,3 → extrapolación a λ=0 = **−1.6500 Ha** (error residual 0.21 Ha, 132× la precisión química) |
| 4. Escalado | 45 qubits ⇒ **18,014,398,509,481,984 TB** de RAM con matriz densa + matriz de decisión clásico/cuántico |

## Chuleta de conceptos (Reto 1, que es el que más conceptos mete)

- **Hamiltoniano**: operador (= matriz) de la energía total. Con `n` qubits es de `2ⁿ × 2ⁿ`.
- **Paulis I, X, Y, Z**: base completa del espacio de operadores. Todo `H` se escribe `H = Σ cᵢ Pᵢ`.
- **`Z` = ocupación** (términos diagonales, energía estática). **`X`/`Y` = saltos y correlación** (fuera de la diagonal).
- **`II`** offset + repulsión nuclear · **`IZ`/`ZI`** energía de cada espín-orbital · **`ZZ`** repulsión electrón-electrón · **`XX`** correlación/doble excitación.
- **Jordan-Wigner**: traduce fermiones (electrones, con su signo de antisimetría) a qubits — 1 espín-orbital = 1 qubit.
- **`SparsePauliOp`**: guarda solo los términos que existen en lugar de la matriz densa (4ⁿ entradas). Es lo que hace viable escalar.
- **Eigenvalue mínimo = estado fundamental = geometría estable.**
