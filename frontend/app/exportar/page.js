'use client';

// Página para imprimir ou "Salvar como PDF" todos os post-its, organizados por pasta.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { eventIcon, formatEventDate, repeatLabel } from '@/lib/format';
import { applyCachedAppearance } from '@/lib/appearance';

function pathName(folders, id) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts = [];
  for (let f = byId.get(id), i = 0; f && i < 5; f = byId.get(f.parentId), i++) parts.unshift(`${f.icon} ${f.name}`);
  return parts.join(' › ');
}

export default function ExportPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    applyCachedAppearance();
    api('/account/export')
      .then(setData)
      .catch((err) => setError(err.status === 401 ? 'Entre na sua conta para exportar.' : err.message));
  }, []);

  if (error) return <main className="print-page"><p>{error}</p></main>;
  if (!data) return <main className="print-page"><p>Preparando seus post-its...</p></main>;

  const active = data.notes.filter((n) => n.status !== 'trash');
  const groups = new Map();
  for (const n of active) {
    const key = n.folderId ? pathName(data.folders, n.folderId) || 'Pasta' : '📌 Mural geral';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  return (
    <main className="print-page">
      <header className="print-head">
        <div>
          <h1>📌 Mural de Notas</h1>
          <p>
            {data.user.name} · {active.length} post-its · exportado em {new Date(data.exportedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <button type="button" className="btn-primary no-print" onClick={() => window.print()}>
          🖨️ Imprimir / Salvar como PDF
        </button>
      </header>
      <p className="no-print print-tip">Dica: na janela de impressão, escolha “Salvar como PDF” como impressora.</p>

      {[...groups].map(([folder, notes]) => (
        <section key={folder} className="print-group">
          <h2>{folder}</h2>
          <div className="print-grid">
            {notes.map((n) => (
              <article key={n.id} className={`print-note postit-${n.color}`}>
                <h3>
                  {n.pinned && '📌 '}
                  {n.title}
                  {n.status === 'archived' && <small> (arquivado)</small>}
                </h3>
                {n.image && <img src={n.image} alt="" />}
                {n.content && <p>{n.content}</p>}
                {n.checklist?.length > 0 && (
                  <ul>
                    {n.checklist.map((i) => (
                      <li key={i.id}>
                        {i.done ? '☑' : '☐'} {i.text}
                      </li>
                    ))}
                  </ul>
                )}
                {n.eventDate && (
                  <p className="print-date">
                    {eventIcon(n.eventType)} {formatEventDate(n) || n.eventDate.split('-').reverse().join('/')} {n.repeat !== 'none' && `· 🔁 ${repeatLabel(n)}`}
                  </p>
                )}
                {n.tags?.length > 0 && <p className="print-tags">{n.tags.map((t) => `#${t}`).join(' ')}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
