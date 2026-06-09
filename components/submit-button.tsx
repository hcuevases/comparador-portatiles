'use client';

import { useFormStatus } from 'react-dom';

/**
 * Botón de envío que se desactiva automáticamente mientras la server action
 * está en vuelo. Reutilizable en cualquier form con server actions.
 */
export function SubmitButton({
  children,
  pendingText,
  variant = 'primary',
  fullWidth = false,
}: {
  children: React.ReactNode;
  pendingText: string;
  variant?: 'primary' | 'secondary' | 'danger';
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();

  const styles =
    variant === 'primary'
      ? 'bg-cyan-600 text-white hover:bg-cyan-700'
      : variant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2'
        : 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900';

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
        (fullWidth ? 'w-full ' : '') +
        styles
      }
    >
      {pending ? pendingText : children}
    </button>
  );
}
