import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // next/image bloquea hostnames remotos por defecto (anti-SSRF).
    // Permitimos explícitamente los CDNs de los retailers que indexamos.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'thumb.pccomponentes.com',
        // Las URLs siguen el patrón /w-<W>-<H>/articles/... siempre HTTPS.
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
