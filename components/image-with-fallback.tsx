'use client';

import Image, { type ImageProps } from 'next/image';
import type { ReactNode } from 'react';
import { useState } from 'react';

// next/image que cae a un `fallback` cuando no hay `src` o la imagen no carga. Necesario
// porque muchos thumbnails de PcComponentes fueron retirados y su origen devuelve 404:
// next/image solo cubre el caso de `src` nulo en el llamante; el error de carga en runtime
// hay que capturarlo con `onError`, y eso obliga a un Client Component.
type Props = Omit<ImageProps, 'src'> & {
  src: string | null | undefined;
  fallback: ReactNode;
};

export function ImageWithFallback({ src, alt, fallback, ...props }: Props) {
  const [failed, setFailed] = useState(false);
  const [trackedSrc, setTrackedSrc] = useState(src);

  // Si cambia el src (p.ej. la cesta de comparar reusa el componente con otro item),
  // resetea el estado de error. Patrón recomendado de React: ajustar estado durante el
  // render comparando con el valor previo, en vez de un useEffect (evita renders en cascada).
  if (src !== trackedSrc) {
    setTrackedSrc(src);
    setFailed(false);
  }

  if (!src || failed) return <>{fallback}</>;

  return <Image {...props} src={src} alt={alt} onError={() => setFailed(true)} />;
}
