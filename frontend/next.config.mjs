import os from 'node:os';

// Libera o "next dev" para ser aberto pelo IP da rede local (ex.: testar no celular)
const lanIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: import.meta.dirname },
  allowedDevOrigins: lanIPs,
};

export default nextConfig;
