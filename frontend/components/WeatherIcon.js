// Ícones de clima animados, feitos só com SVG + CSS (animações no globals.css)

function Sun() {
  return (
    <g className="wx-sun">
      <g className="wx-sun-rays">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1="50" y1="12" x2="50" y2="22" transform={`rotate(${i * 45} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="18" className="wx-sun-core" />
    </g>
  );
}

function Moon() {
  return (
    <g className="wx-moon">
      <path d="M58 22a26 26 0 1 0 20 38A22 22 0 0 1 58 22z" />
      <circle className="wx-star s1" cx="22" cy="24" r="1.8" />
      <circle className="wx-star s2" cx="80" cy="18" r="1.4" />
      <circle className="wx-star s3" cx="30" cy="70" r="1.2" />
    </g>
  );
}

function Cloud({ className = '', dark = false }) {
  return (
    <path
      className={`wx-cloud ${dark ? 'dark' : ''} ${className}`}
      d="M30 78h44a16 16 0 0 0 0-32 22 22 0 0 0-42-4 18 18 0 0 0-2 36z"
    />
  );
}

function Drops({ snow = false }) {
  return (
    <g className={snow ? 'wx-snow' : 'wx-rain'}>
      {[34, 48, 62, 76].map((x, i) =>
        snow ? (
          <text key={x} x={x - 4} y="94" className={`flake f${i}`}>
            ❄
          </text>
        ) : (
          <line key={x} x1={x} y1="84" x2={x - 4} y2="94" className={`drop d${i}`} />
        ),
      )}
    </g>
  );
}

export default function WeatherIcon({ condition = 'clear', isDay = true }) {
  const sky = isDay ? <Sun /> : <Moon />;
  return (
    <svg viewBox="0 0 100 100" className={`wx-icon wx-${condition}`} aria-hidden>
      {condition === 'clear' && sky}
      {condition === 'partly' && (
        <>
          <g transform="translate(-12 -14) scale(.9)">{sky}</g>
          <Cloud className="drift" />
        </>
      )}
      {condition === 'clouds' && (
        <>
          <g transform="translate(-14 -16) scale(.85)">
            <Cloud className="drift-slow" dark />
          </g>
          <Cloud className="drift" />
        </>
      )}
      {condition === 'fog' && (
        <>
          <Cloud className="drift-slow" />
          <g className="wx-fog">
            <line x1="20" y1="86" x2="70" y2="86" />
            <line x1="30" y1="94" x2="84" y2="94" />
          </g>
        </>
      )}
      {condition === 'rain' && (
        <>
          <Drops />
          <Cloud className="drift" dark />
        </>
      )}
      {condition === 'storm' && (
        <>
          <Drops />
          <path className="wx-bolt" d="M54 66 44 84h9l-5 14 14-20h-9l5-12z" />
          <Cloud className="drift" dark />
        </>
      )}
      {condition === 'snow' && (
        <>
          <Drops snow />
          <Cloud className="drift" />
        </>
      )}
    </svg>
  );
}
