'use client';

// "Seu ID" no perfil: a pessoa copia e manda para quem vai chamá-la para uma pasta
import { useEffect, useState } from 'react';
import Icon from './Icon';

export default function MyCode({ code, toast }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  if (!code) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast?.('ID copiado! Agora é só mandar para quem vai te convidar.', 'success');
    } catch {
      // sem permissão de área de transferência: deixa o texto selecionado para copiar na mão
      const el = document.getElementById('my-code-value');
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      toast?.('Selecionei o ID: aperte Ctrl+C (ou "Copiar") para copiar.', 'info');
    }
  }

  function share() {
    navigator
      .share({ title: 'Mural de Notas', text: `Me convida para a sua pasta no Mural de Notas! Meu ID é ${code}` })
      .catch(() => {});
  }

  return (
    <div className="my-code">
      <div className="my-code-head">
        <span className="my-code-label">Seu ID</span>
        <span id="my-code-value" className="my-code-value" aria-label={`Seu ID: ${code.split('').join(' ')}`}>
          {code}
        </span>
      </div>
      <div className="my-code-actions">
        <button type="button" className={`btn-small ${copied ? 'done' : ''}`} onClick={copy} aria-live="polite">
          <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copiado!' : 'Copiar'}
        </button>
        {canShare && (
          <button type="button" className="btn-small ghost" onClick={share}>
            <Icon name="upload" size={15} /> Enviar
          </button>
        )}
      </div>
      <small className="muted">Mande esse ID para quem quer te chamar para uma pasta. Ele não mostra seu e-mail.</small>
    </div>
  );
}
