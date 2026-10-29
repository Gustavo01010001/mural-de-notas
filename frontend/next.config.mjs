import os from 'node:os';

// Libera o "next dev" para ser aberto pelo IP da rede local (ex.: testar no celular)
const lanIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

// Para onde o front repassa as chamadas /api (o backend Express)
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: import.meta.dirname },
  allowedDevOrigins: lanIPs,
  // Sem o botãozinho "N" do Next no canto: só aparecia em desenvolvimento e cobria "Próximas datas"
  devIndicators: false,
  // O navegador fala só com o front (http ou https, mesmo endereço);
  // o Next repassa /api/* para o backend. Assim o celular aceita um único certificado.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
