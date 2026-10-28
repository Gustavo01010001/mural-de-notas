// Gera certificados HTTPS locais para o "npm run dev:https" (usa o openssl que vem com o Git).
//
// - certs/ca.pem + ca-key.pem: uma autoridade certificadora (CA) só deste PC
// - certs/server.pem + server-key.pem: certificado do site para localhost + IPs da rede
// - public/mural-ca.crt: cópia PÚBLICA da CA, para instalar no celular (opcional, tira o aviso)
//
// As chaves (*-key.pem) nunca saem do PC: a pasta certs/ está no .gitignore.
// Se o IP do PC mudar, o certificado do site é refeito sozinho na próxima execução.
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'certs');
const file = (name) => path.join(dir, name);

const OPENSSL_CANDIDATES = [
  'openssl',
  'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
];

function findOpenssl() {
  for (const bin of OPENSSL_CANDIDATES) {
    try {
      execFileSync(bin, ['version'], { stdio: 'ignore' });
      return bin;
    } catch {}
  }
  console.error('❌ openssl não encontrado. Instale o Git para Windows (ele já traz o openssl).');
  process.exit(1);
}

const lanIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
  .map((i) => i.address);

// O certificado atual ainda serve? (existe, não vence em 30 dias e cobre todos os IPs de agora)
function serverCertIsValid() {
  if (!fs.existsSync(file('server.pem')) || !fs.existsSync(file('server-key.pem'))) return false;
  const cert = new X509Certificate(fs.readFileSync(file('server.pem')));
  const expiresSoon = new Date(cert.validTo).getTime() - Date.now() < 30 * 86_400_000;
  const san = cert.subjectAltName ?? '';
  return !expiresSoon && lanIPs.every((ip) => san.includes(`IP Address:${ip}`));
}

const openssl = findOpenssl();
const run = (args) => execFileSync(openssl, args, { stdio: 'pipe' });
fs.mkdirSync(dir, { recursive: true });

if (!fs.existsSync(file('ca.pem')) || !fs.existsSync(file('ca-key.pem'))) {
  console.log('🔐 Criando a autoridade certificadora local...');
  run(['genrsa', '-out', file('ca-key.pem'), '2048']);
  run([
    'req', '-x509', '-new', '-key', file('ca-key.pem'), '-sha256', '-days', '3650',
    '-subj', '/CN=Mural de Notas - CA local/O=Mural de Notas (dev)', '-out', file('ca.pem'),
  ]);
}

if (serverCertIsValid()) {
  console.log(`🔒 Certificado HTTPS ok (localhost${lanIPs.map((ip) => `, ${ip}`).join('')})`);
} else {
  console.log(`🔐 Gerando certificado HTTPS para localhost${lanIPs.map((ip) => `, ${ip}`).join('')}...`);
  const alt = ['DNS:localhost', 'IP:127.0.0.1', ...lanIPs.map((ip) => `IP:${ip}`)].join(',');
  const ext = file('server.ext');
  fs.writeFileSync(
    ext,
    `basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${alt}\n`,
  );
  run(['genrsa', '-out', file('server-key.pem'), '2048']);
  run(['req', '-new', '-key', file('server-key.pem'), '-subj', '/CN=Mural de Notas (dev)', '-out', file('server.csr')]);
  run([
    'x509', '-req', '-in', file('server.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca-key.pem'),
    '-CAcreateserial', '-out', file('server.pem'), '-days', '397', '-sha256', '-extfile', ext,
  ]);
  fs.rmSync(file('server.csr'), { force: true });
  fs.rmSync(ext, { force: true });
}

// Cópia pública da CA (só o certificado, sem chave) para baixar no celular
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.copyFileSync(file('ca.pem'), path.join(root, 'public', 'mural-ca.crt'));

for (const ip of lanIPs) console.log(`📱 No celular (mesma rede): https://${ip}:3000`);
