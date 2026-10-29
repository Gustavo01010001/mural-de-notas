// Envio de e-mail (redefinir senha). Configure no backend/.env:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
// Ex.: Gmail → SMTP_HOST=smtp.gmail.com SMTP_PORT=465 e uma "senha de app" da conta Google.
// Sem SMTP configurado, o link aparece só no terminal do backend (modo desenvolvimento).
import nodemailer from 'nodemailer';

let transport = null;

export const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function sendPasswordReset({ to, name, link }) {
  if (!mailConfigured()) {
    console.log(`\n[e-mail não configurado] Link para ${to} redefinir a senha (vale 30 min):\n${link}\n`);
    return { sent: false };
  }
  await getTransport().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'Mural de Notas — redefinir sua senha',
    text: `Olá, ${name}!\n\nPara criar uma senha nova, abra este link (vale 30 minutos):\n${link}\n\nSe não foi você, é só ignorar este e-mail.`,
    html: `<div style="font-family:sans-serif;font-size:16px;color:#222">
      <p>Olá, ${escapeHtml(name)}! 📌</p>
      <p>Para criar uma senha nova no <b>Mural de Notas</b>, clique no botão (vale 30 minutos):</p>
      <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#ffd43b;color:#222;border-radius:10px;text-decoration:none;font-weight:bold">Criar senha nova</a></p>
      <p style="color:#666;font-size:13px">Se não foi você, é só ignorar este e-mail. Sua senha continua a mesma.</p>
    </div>`,
  });
  return { sent: true };
}
