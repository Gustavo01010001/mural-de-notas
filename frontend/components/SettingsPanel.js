'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COLORS } from '@/lib/format';
import { SCENES, sceneFromWeather, sceneInfo } from '@/lib/scenes';
import { playSound, setSoundPrefs } from '@/lib/sounds';
import AccountSection from './AccountSection';
import Icon from './Icon';
import MyCode from './MyCode';

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="set-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden>
        <span />
      </span>
    </label>
  );
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="set-row">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={value === o.id ? 'active' : ''}
            onClick={() => onChange(o.id)}
          >
            {value === o.id && <motion.span layoutId={`seg-${label}`} className="segmented-pill" />}
            <span className="segmented-label">
              {o.icon && <Icon name={o.icon} size={15} />}
              {o.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Range({ label, value, min, max, step, onChange, format }) {
  return (
    <label className="set-row range-row">
      <span>
        {label} <b>{format(value)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` }}
      />
    </label>
  );
}

export default function SettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  user,
  onSaveName,
  onLogout,
  weather,
  autoCalm,
  onSnoozeAutoCalm,
  toast,
  onAuthError,
  onImported,
  onDeleted,
}) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(user?.name ?? '');
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const set = (key) => (value) => onChange({ [key]: value });
  const live = sceneInfo(sceneFromWeather(weather));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="drawer"
            role="dialog"
            aria-label="Configurações"
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <header className="drawer-head">
              <h2>
                <span className="gear-spin">
                  <Icon name="settings" size={22} />
                </span>{' '}
                Configurações
              </h2>
              <button className="icon-btn" onClick={onClose} aria-label="Fechar">
                <Icon name="x" size={18} />
              </button>
            </header>

            <div className="drawer-body">
              <section>
                <h3>Perfil</h3>
                <form
                  className="name-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSaveName(name);
                  }}
                >
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Seu nome" />
                  <button className="btn-small" disabled={!name.trim() || name.trim() === user?.name}>
                    Salvar
                  </button>
                </form>
                <small className="muted">{user?.email}</small>
                <MyCode code={user?.code} toast={toast} />
              </section>

              <section>
                <h3>Aparência e acessibilidade</h3>
                <Segmented
                  label="Tema"
                  value={settings.theme}
                  onChange={set('theme')}
                  options={[
                    { id: 'dark', icon: 'moon', label: 'Escuro' },
                    { id: 'light', icon: 'sun', label: 'Claro' },
                    { id: 'auto', icon: 'auto', label: 'Auto' },
                  ]}
                />
                <Segmented
                  label="Tamanho da letra"
                  value={settings.fontScale}
                  onChange={set('fontScale')}
                  options={[
                    { id: 1, label: 'A' },
                    { id: 1.15, label: 'A+' },
                    { id: 1.3, label: 'A++' },
                    { id: 1.5, label: 'A+++' },
                  ]}
                />
                <Toggle
                  label="Alto contraste"
                  hint="Textos e bordas mais fortes, sem transparências. Ajuda quem tem baixa visão."
                  checked={settings.highContrast}
                  onChange={set('highContrast')}
                />
              </section>

              <section>
                <h3>Sons e foco</h3>
                <Toggle
                  label="Sons suaves"
                  hint="Ao colar, excluir, completar checklist e nos lembretes."
                  checked={settings.sounds}
                  onChange={(v) => {
                    onChange({ sounds: v });
                    if (v) setTimeout(() => playSound('pop', { force: true }), 50);
                  }}
                />
                {settings.sounds && (
                  <Segmented
                    label="Volume"
                    value={settings.soundVolume}
                    onChange={(v) => {
                      onChange({ soundVolume: v });
                      setSoundPrefs({ volume: v });
                      setTimeout(() => playSound('check', { force: true }), 30);
                    }}
                    options={[
                      { id: 0.3, label: 'Baixo' },
                      { id: 0.6, label: 'Médio' },
                      { id: 1, label: 'Alto' },
                    ]}
                  />
                )}
                <Toggle
                  label="Timer de foco (Pomodoro)"
                  hint="Um cronômetro discreto no canto: foca, faz uma pausa, repete."
                  checked={settings.showFocusTimer}
                  onChange={set('showFocusTimer')}
                />
                {settings.showFocusTimer && (
                  <>
                    <Segmented
                      label="Foco"
                      value={settings.focusMinutes}
                      onChange={set('focusMinutes')}
                      options={[15, 25, 45, 50].map((m) => ({ id: m, label: `${m} min` }))}
                    />
                    <Segmented
                      label="Pausa"
                      value={settings.breakMinutes}
                      onChange={set('breakMinutes')}
                      options={[5, 10, 15].map((m) => ({ id: m, label: `${m} min` }))}
                    />
                  </>
                )}
              </section>

              <section>
                <h3>Clima e relógio</h3>
                <Toggle label="Mostrar clima e hora" checked={settings.showWeather} onChange={set('showWeather')} />
                <Toggle label="Mostrar segundos" checked={settings.showSeconds} onChange={set('showSeconds')} />
                <Toggle label="Formato 24 horas" checked={settings.clock24h} onChange={set('clock24h')} />
                <Segmented
                  label="Temperatura"
                  value={settings.tempUnit}
                  onChange={set('tempUnit')}
                  options={[
                    { id: 'C', label: '°C' },
                    { id: 'F', label: '°F' },
                  ]}
                />
              </section>

              <section className={`dyn-section ${settings.dynamicBackground ? 'on' : ''}`}>
                <h3>Imersão</h3>
                <Toggle
                  label="Simular clima dinâmico"
                  hint="O fundo do mural imita o tempo: chuva, raios, neblina, umidade, tempo seco..."
                  checked={settings.dynamicBackground}
                  onChange={set('dynamicBackground')}
                />

                <AnimatePresence initial={false}>
                  {settings.dynamicBackground && (
                    <motion.div
                      className="dyn-options"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <div className="scene-grid">
                        {SCENES.map((s) => (
                          <motion.button
                            key={s.id}
                            type="button"
                            className={`scene-card ${settings.backgroundMode === s.id ? 'active' : ''}`}
                            onClick={() => onChange({ backgroundMode: s.id })}
                            whileHover={{ y: -3 }}
                            whileTap={{ scale: 0.94 }}
                          >
                            <span className="scene-icon">{s.icon}</span>
                            <span>{s.label}</span>
                            {s.id === 'auto' && (
                              <small>
                                agora: {live.icon} {live.label}
                                {weather?.city && ` · ${weather.city}`}
                              </small>
                            )}
                          </motion.button>
                        ))}
                      </div>
                      {settings.backgroundMode === 'auto' && (
                        <p className="set-note">
                          🛰️ O fundo acompanha o clima atual da sua região
                          {weather?.description ? ` (${weather.description.toLowerCase()}, ${Math.round(weather.humidity)}% de umidade)` : ''}{' '}
                          e se atualiza a cada 10 minutos.
                          {weather && !weather.located && (
                            <em> Permita a localização no navegador para usar a sua cidade — por enquanto usando São Paulo.</em>
                          )}
                        </p>
                      )}
                      <Segmented
                        label="Intensidade"
                        value={settings.effectsIntensity}
                        onChange={set('effectsIntensity')}
                        options={[
                          { id: 'low', label: 'Baixa' },
                          { id: 'medium', label: 'Média' },
                          { id: 'high', label: 'Alta' },
                        ]}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <section className={`comfort-section ${settings.calmMode || autoCalm ? 'on' : ''}`}>
                <h3>Conforto visual</h3>
                <Toggle
                  label="Menos poluição visual"
                  hint="Tira piscadas, clarões e brilhos fortes e deixa o fundo mais calmo. Os post-its continuam se mexendo e tudo continua interativo."
                  checked={settings.calmMode || autoCalm}
                  onChange={(v) => (v ? onChange({ calmMode: true }) : autoCalm ? onSnoozeAutoCalm() : onChange({ calmMode: false }))}
                />
                <AnimatePresence>
                  {autoCalm && !settings.calmMode && (
                    <motion.p
                      className="set-note warn"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      🌙 Ligado sozinho porque você já está há mais de {settings.autoCalmAfter >= 60 ? `${settings.autoCalmAfter / 60} h` : `${settings.autoCalmAfter} min`} no mural.
                    </motion.p>
                  )}
                </AnimatePresence>
                <Segmented
                  label="Ligar sozinho após"
                  value={settings.autoCalmAfter}
                  onChange={set('autoCalmAfter')}
                  options={[
                    { id: 0, label: 'Nunca' },
                    { id: 30, label: '30 min' },
                    { id: 60, label: '1 h' },
                    { id: 120, label: '2 h' },
                  ]}
                />
                <Segmented
                  label="Filtro de luz azul"
                  value={settings.warmFilter}
                  onChange={set('warmFilter')}
                  options={[
                    { id: 'off', label: 'Desligado' },
                    { id: 'low', label: 'Leve' },
                    { id: 'high', label: 'Forte' },
                  ]}
                />
                <Range
                  label="Escurecer fundo"
                  value={settings.bgDim}
                  min={0}
                  max={70}
                  step={10}
                  onChange={set('bgDim')}
                  format={(v) => `${v}%`}
                />
                <Toggle
                  label="Cores suaves nos post-its"
                  hint="Tons mais foscos, que cansam menos a vista."
                  checked={settings.softNotes}
                  onChange={set('softNotes')}
                />
              </section>

              <section>
                <h3>Mural</h3>
                <Toggle label="Mostrar próximas datas" checked={settings.showUpcoming} onChange={set('showUpcoming')} />
                <Segmented
                  label="No celular"
                  value={settings.mobileLayout}
                  onChange={set('mobileLayout')}
                  options={[
                    { id: 'grid', icon: 'grid', label: 'Grade' },
                    { id: 'free', icon: 'hand', label: 'Livre' },
                  ]}
                />
                <p className="set-note">
                  <b>Grade:</b> os post-its se organizam sozinhos e cabem na tela, na mesma ordem do mural do PC.{' '}
                  <b>Livre:</b> igual ao PC, dá para arrastar (role o mural para ver tudo).
                </p>
                <div className="set-row">
                  <span>Cor padrão do post-it</span>
                  <div className="color-row small">
                    {COLORS.map((c) => (
                      <motion.button
                        key={c.id}
                        type="button"
                        className={`color-dot dot-${c.id} ${settings.defaultColor === c.id ? 'selected light' : ''}`}
                        onClick={() => onChange({ defaultColor: c.id })}
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        aria-label={c.label}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <AccountSection user={user} toast={toast} onAuthError={onAuthError} onImported={onImported} onDeleted={onDeleted} />

              <button className="btn-logout" onClick={onLogout}>
                Sair da conta
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
