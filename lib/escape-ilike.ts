/**
 * Escapa los caracteres especiales de ILIKE (% y _) para que el usuario no
 * pueda inyectar comodines accidentalmente al teclear.
 */
export function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (m) => `\\${m}`);
}
