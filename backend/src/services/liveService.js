// "Ao vivo" nas pastas compartilhadas: quem está na pasta agora, cursores das outras pessoas
// e aviso de que os post-its mudaram (para todo mundo recarregar na hora).
// Usa Server-Sent Events (uma conexão aberta do servidor para o navegador) — sem bibliotecas extras.

const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#f06595'];
const HEARTBEAT_MS = 25_000;
const CURSOR_MIN_MS = 40; // no máximo ~25 atualizações de cursor por segundo por pessoa

const channels = new Map(); // folderId -> Set<client>

export const colorFor = (userId) => COLORS[userId % COLORS.length];

function send(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // conexão já caiu; o "close" limpa
  }
}

function presence(folderId) {
  const seen = new Map();
  for (const c of channels.get(folderId) ?? []) seen.set(c.userId, { id: c.userId, name: c.name, color: c.color });
  return [...seen.values()];
}

function broadcast(folderId, event, data, exceptUserId = null) {
  for (const c of channels.get(folderId) ?? []) {
    if (c.userId !== exceptUserId) send(c, event, data);
  }
}

export const live = {
  subscribe(folderId, user, req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const client = { userId: user.id, name: user.name, color: colorFor(user.id), res, lastCursor: 0 };
    if (!channels.has(folderId)) channels.set(folderId, new Set());
    channels.get(folderId).add(client);

    send(client, 'hello', { me: { id: user.id, color: client.color }, presence: presence(folderId) });
    broadcast(folderId, 'presence', { presence: presence(folderId) }, user.id);

    const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(beat);
      const set = channels.get(folderId);
      set?.delete(client);
      if (set && set.size === 0) channels.delete(folderId);
      broadcast(folderId, 'presence', { presence: presence(folderId) });
      broadcast(folderId, 'cursor-leave', { userId: user.id });
    });
  },

  cursor(folderId, userId, point) {
    const set = channels.get(folderId);
    if (!set) return;
    const now = Date.now();
    const mine = [...set].find((c) => c.userId === userId);
    if (!mine || now - mine.lastCursor < CURSOR_MIN_MS) return;
    mine.lastCursor = now;
    broadcast(folderId, 'cursor', { userId, name: mine.name, color: mine.color, ...point }, userId);
  },

  // Algo mudou na pasta: os outros recarregam (quem fez a mudança já está atualizado)
  notify(folderId, actorId, kind = 'notes') {
    if (folderId === null || folderId === undefined || !channels.has(folderId)) return;
    broadcast(folderId, kind, { by: actorId, at: Date.now() }, actorId);
  },

  // Tirou alguém da pasta: fecha a conexão dessa pessoa
  kick(folderId, userId) {
    for (const c of channels.get(folderId) ?? []) {
      if (c.userId === userId) {
        send(c, 'kicked', {});
        c.res.end();
      }
    }
  },

  stats: () => Object.fromEntries([...channels].map(([id, set]) => [id, set.size])),
};
