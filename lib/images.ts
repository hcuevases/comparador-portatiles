// PcComponentes codifica el tamaño del thumb en la ruta del CDN:
// w-150-150 ("small"), w-300-300 ("medium"), w-530-530 ("large"). Guardamos la
// large en BD; pedir el tamaño justo para cada contexto evita que next/image
// descargue de más del origen. Si la URL no tiene el patrón, se devuelve igual.
export function pccThumb(url: string, size: 150 | 300 | 530): string {
  return url.replace(/\/w-\d+-\d+\//, `/w-${size}-${size}/`);
}
