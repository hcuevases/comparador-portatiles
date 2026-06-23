# Filtros en bottom-sheet (móvil) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En móvil, mover los filtros de la home a un bottom-sheet abierto por un botón "Filtros (N)" sticky, dejando el grid arriba; en ≥md no cambia nada.

**Architecture:** Componente cliente nuevo `MobileFilters` (botón sticky + sheet con overlay, sin dependencias) que reutiliza `LaptopFilters` tal cual; el `<aside>` de la home pasa a solo-escritorio. Un helper puro `countActiveFilters` (testeable) alimenta el badge.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Vitest. CI = `eslint` + `tsc` + `vitest run`. Repo CRLF (no `prettier --write`).

**Spec:** `docs/superpowers/specs/2026-06-23-filtros-movil-bottom-sheet-design.md`

---

### Task 1: Helper puro `countActiveFilters`

**Files:**
- Create: `lib/active-filters.ts`
- Test: `lib/active-filters.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/active-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { countActiveFilters } from './active-filters';

const p = (q: string) => new URLSearchParams(q);

describe('countActiveFilters', () => {
  it('sin filtros → 0', () => {
    expect(countActiveFilters(p(''))).toBe(0);
  });
  it('cada marca cuenta por separado', () => {
    expect(countActiveFilters(p('brand=Acer,HP,Lenovo'))).toBe(3);
  });
  it('ram/screen/line/cond/price suman 1 cada uno', () => {
    expect(countActiveFilters(p('ram_min=16'))).toBe(1);
    expect(countActiveFilters(p('screen=14'))).toBe(1);
    expect(countActiveFilters(p('line=ThinkPad'))).toBe(1);
    expect(countActiveFilters(p('cond=nuevos'))).toBe(1);
    expect(countActiveFilters(p('price_max=1200'))).toBe(1);
  });
  it('cada característica activa suma 1', () => {
    expect(countActiveFilters(p('gaming=1&ai=1&oled=1'))).toBe(3);
    expect(countActiveFilters(p('gaming=0'))).toBe(0); // solo cuenta '1'
  });
  it('q (buscador del hero) NO cuenta', () => {
    expect(countActiveFilters(p('q=macbook'))).toBe(0);
  });
  it('combinación', () => {
    expect(countActiveFilters(p('brand=Acer,HP&ram_min=16&oled=1&q=x'))).toBe(4);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run lib/active-filters.test.ts`
Expected: FAIL (`countActiveFilters` no existe).

- [ ] **Step 3: Implementar**

Crear `lib/active-filters.ts`:

```ts
// Cuenta los filtros de catálogo activos a partir de los searchParams. Pura y testeable;
// la usa el badge "Filtros (N)" del bottom-sheet móvil. El buscador `?q=` vive en el hero,
// no es un filtro del panel, así que NO se cuenta. Las claves deben coincidir con las que
// emite `components/laptop-filters.tsx`.
//
// Tipa el parámetro estructuralmente (solo `.get`) para aceptar tanto `URLSearchParams`
// (tests) como el `ReadonlyURLSearchParams` que devuelve `useSearchParams()` — este último
// NO es asignable a `URLSearchParams` (le faltan set/append/delete).
type ReadableParams = { get(key: string): string | null };

const FEATURE_KEYS = ['gaming', 'ai', 'oled'] as const;
const SINGLE_VALUE_KEYS = ['ram_min', 'screen', 'line', 'cond', 'price_max'] as const;

export function countActiveFilters(params: ReadableParams): number {
  let n = 0;
  n += (params.get('brand') ?? '').split(',').filter(Boolean).length;
  for (const key of SINGLE_VALUE_KEYS) {
    if ((params.get(key) ?? '') !== '') n += 1;
  }
  for (const key of FEATURE_KEYS) {
    if (params.get(key) === '1') n += 1;
  }
  return n;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run lib/active-filters.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/active-filters.ts lib/active-filters.test.ts
git commit -m "feat(filtros): countActiveFilters (badge del panel móvil)"
```

---

### Task 2: Componente `MobileFilters` (botón sticky + bottom-sheet)

**Files:**
- Create: `components/mobile-filters.tsx`

Contexto: reutiliza `components/laptop-filters.tsx` (export `LaptopFilters`, props `{ brands: string[]; productLines: { value: string; count: number }[]; ramOptions?: number[] }`) y `lib/active-filters.ts`. Patrón de overlay como `components/cookie-banner.tsx`. No añadir dependencias.

- [ ] **Step 1: Crear el componente**

Crear `components/mobile-filters.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { countActiveFilters } from '@/lib/active-filters';

import { LaptopFilters } from './laptop-filters';

type ProductLine = { value: string; count: number };

type Props = {
  brands: string[];
  productLines: ProductLine[];
  ramOptions?: number[];
  total: number;
};

export function MobileFilters({ brands, productLines, ramOptions, total }: Props) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const activeCount = countActiveFilters(searchParams);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Mientras el sheet está abierto: bloquea el scroll del body, enfoca el botón cerrar y
  // escucha Escape. El cleanup restaura todo aunque el componente se desmonte abierto.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Barra sticky con el botón de filtros (accesible al hacer scroll del grid). */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="a11y-tap inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Filtros
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-cyan-600 px-1.5 text-xs font-semibold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filtros"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 className="text-sm font-semibold">Filtros</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar filtros"
                className="a11y-tap rounded-full p-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <LaptopFilters brands={brands} productLines={productLines} ramOptions={ramOptions} />
            </div>

            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="a11y-tap w-full rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                Ver resultados ({total})
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/mobile-filters.tsx
git commit -m "feat(filtros): MobileFilters — botón sticky + bottom-sheet"
```

---

### Task 3: Cablear en la home (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`

Contexto: hoy (líneas ~232-238) el `<aside>` con `LaptopFilters` se apila en móvil. La variable del total de resultados es `totalCount`.

- [ ] **Step 1: Importar `MobileFilters`**

Junto al import existente `import { LaptopFilters } from '@/components/laptop-filters';` añadir:

```ts
import { MobileFilters } from '@/components/mobile-filters';
```

- [ ] **Step 2: Renderizar `MobileFilters` (móvil) y ocultar el aside en móvil**

Sustituir este bloque:

```tsx
      {/* Filtros en barra lateral izquierda (sticky en ≥md — incluye tablets y el
          modo escritorio del móvil; apilados sobre los resultados en pantallas
          pequeñas). */}
      <div className="md:grid md:grid-cols-[15rem_1fr] md:items-start md:gap-6 lg:grid-cols-[16rem_1fr] lg:gap-8">
        <aside className="md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto md:pb-4">
          <LaptopFilters brands={allBrands} productLines={productLines} />
        </aside>
```

por:

```tsx
      {/* Móvil (<md): filtros en bottom-sheet abierto por un botón sticky. */}
      <MobileFilters brands={allBrands} productLines={productLines} total={totalCount} />

      {/* Filtros en barra lateral izquierda en ≥md (sticky). En móvil el aside se oculta
          y los filtros viven en el bottom-sheet de arriba. */}
      <div className="md:grid md:grid-cols-[15rem_1fr] md:items-start md:gap-6 lg:grid-cols-[16rem_1fr] lg:gap-8">
        <aside className="hidden md:block md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto md:pb-4">
          <LaptopFilters brands={allBrands} productLines={productLines} />
        </aside>
```

(El resto del bloque — el `<div className="min-w-0">` con resultados y grid — no se toca.)

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(filtros): usa MobileFilters en móvil; aside solo en ≥md"
```

---

### Task 4: Suite + verificación manual

- [ ] **Step 1: Suite completa (gate CI)**

Run: `npm run lint; npm run typecheck; npm test`
Expected: PASS — todos verdes (incluye el test nuevo de `countActiveFilters`).

- [ ] **Step 2: Verificación manual (local, `npm run dev`)**

Comprobar en el navegador a ancho **<768px** (DevTools responsive):
- Aparece la barra sticky con "Filtros"; el grid está justo debajo (no apilado el panel entero).
- Tocar "Filtros" abre el sheet desde abajo; el body no hace scroll detrás.
- Togglear un filtro actualiza el grid detrás en vivo; el badge "Filtros (N)" refleja el nº.
- "Ver resultados (N)" cierra el sheet; ✕, backdrop y Escape también cierran.
- A **≥768px**: no aparece ni el botón ni el sheet; el sidebar sticky funciona como antes.
- Modo oscuro correcto en barra, sheet y botones.

No hay test automatizado de la UI del sheet (convención del repo: solo lógica pura en CI).

---

## Notas de implementación

- **CRLF**: no `prettier --write`. Verificar con lint + typecheck + vitest.
- **No tocar** `LaptopFilters` (se reutiliza tal cual; su tarjeta con borde dentro del
  sheet es aceptable) ni la lógica de filtrado/URL. El buscador `?q=` sigue en el hero.
- **Sin dependencias nuevas**.
- **Rama**: `feat/filtros-movil-bottom-sheet`. Al cerrar: nota de vault (addendum donde
  encaje el rediseño de la home / filtros) + bitácora.
```
