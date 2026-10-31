import os from 'node:os';

// Libera o "next dev" para ser aberto pelo IP da rede local (ex.: testar no celular)
const lanIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

// Para onde o front repassa as chamadas /api (o backend Express)
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

const isDev = process.env.NODE_ENV === 'development';

// Cabeçalhos de segurança (modelo "Without Nonces" da documentação do Next):
// só o próprio site carrega scripts, estilos, imagens e fontes; ninguém embute o mural num <iframe>.
// 'unsafe-eval' e ws: só em desenvolvimento (recarga automática). Sem upgrade-insecure-requests:
// quebraria o acesso por http local.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // localização só para o clima; câmera e microfone nunca
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=()' },
  // HSTS só em produção: no localhost ele ficaria gravado e forçaria https em outros projetos do PC
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // não anuncia "X-Powered-By: Next.js"
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  turbopack: { root: import.meta.dirname },
  allowedDevOrigins: ['127.0.0.1', ...lanIPs], // 127.0.0.1: abrir outra conta numa aba à parte (testes)
  // Sem o botãozinho "N" do Next no canto: só aparecia em desenvolvimento e cobria "Próximas datas"
  devIndicators: false,
  // O navegador fala só com o front (http ou https, mesmo endereço);
  // o Next repassa /api/* para o backend. Assim o celular aceita um único certificado.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
