import { db } from '../config/db.js';

export const DEFAULT_SETTINGS = {
  showWeather: true,
  showSeconds: true,
  clock24h: true,
  tempUnit: 'C',
  showUpcoming: true,
  dynamicBackground: false,
  backgroundMode: 'auto',
  effectsIntensity: 'medium',
  defaultColor: 'yellow',
  mobileLayout: 'grid',
  // Aparência e acessibilidade
  theme: 'dark',
  fontScale: 1,
  highContrast: false,
  sounds: false,
  soundVolume: 0.6,
  showFocusTimer: false,
  focusMinutes: 25,
  breakMinutes: 5,
  // Conforto visual
  calmMode: false,
  autoCalmAfter: 0,
  warmFilter: 'off',
  bgDim: 0,
  softNotes: false,
};

export const SettingsModel = {
  get(userId) {
    const row = db.prepare('SELECT data FROM user_settings WHERE user_id = ?').get(userId);
    let saved = {};
    try {
      saved = row ? JSON.parse(row.data) : {};
    } catch {}
    return { ...DEFAULT_SETTINGS, ...saved };
  },

  save(userId, settings) {
    db.prepare(
      `INSERT INTO user_settings (user_id, data) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`,
    ).run(userId, JSON.stringify(settings));
    return this.get(userId);
  },
};
