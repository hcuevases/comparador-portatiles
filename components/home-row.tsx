import type { ReactNode } from 'react';

// Fila de cards para los feeds de la home (Destacados ahora; Chollos al retomar el sub-1).
// Scroll horizontal con snap en móvil; grid en ≥md. Los hijos son <li> (p.ej. LaptopCardItem).
export function HomeRow({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-2">
        {icon}
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        {subtitle && <span className="text-sm text-zinc-500">{subtitle}</span>}
      </div>
      <ul className="flex snap-x gap-4 overflow-x-auto pb-2 [&>li]:min-w-[14rem] [&>li]:shrink-0 [&>li]:snap-start md:grid md:grid-cols-3 md:overflow-visible md:[&>li]:min-w-0 lg:grid-cols-4">
        {children}
      </ul>
    </section>
  );
}
