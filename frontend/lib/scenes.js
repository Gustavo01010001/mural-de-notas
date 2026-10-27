// Cenas do "clima dinâmico" que o fundo do mural pode simular
export const SCENES = [
  { id: 'auto', label: 'Tempo real', icon: '🛰️' },
  { id: 'neutral', label: 'Neutro', icon: '✨' },
  { id: 'clear', label: 'Céu limpo', icon: '☀️' },
  { id: 'dry', label: 'Seco', icon: '🏜️' },
  { id: 'humid', label: 'Úmido', icon: '💧' },
  { id: 'cloudy', label: 'Nublado', icon: '☁️' },
  { id: 'rain', label: 'Chuvoso', icon: '🌧️' },
  { id: 'storm', label: 'Tempestade', icon: '⛈️' },
  { id: 'snow', label: 'Neve', icon: '❄️' },
  { id: 'fog', label: 'Neblina', icon: '🌫️' },
];

export const sceneInfo = (id) => SCENES.find((s) => s.id === id) ?? SCENES[1];

// "Tempo real": a cena segue o clima ATUAL da região do usuário (o mesmo que aparece no widget).
// A umidade só refina dias de céu aberto (seco x úmido); chuva, nuvens etc. vêm direto da condição.
export function sceneFromWeather(w) {
  if (!w) return 'neutral';
  switch (w.condition) {
    case 'storm':
      return 'storm';
    case 'rain':
      return 'rain';
    case 'snow':
      return 'snow';
    case 'fog':
      return 'fog';
    case 'clouds':
      return 'cloudy';
    case 'clear':
    case 'partly':
      if (w.humidity != null && w.humidity < 40) return 'dry';
      if (w.humidity != null && w.humidity >= 85) return 'humid';
      return w.condition === 'partly' ? 'cloudy' : 'clear';
    default:
      return 'neutral';
  }
}

export function resolveScene(settings, weather) {
  if (!settings?.dynamicBackground) return null;
  return settings.backgroundMode === 'auto' ? sceneFromWeather(weather) : settings.backgroundMode;
}
