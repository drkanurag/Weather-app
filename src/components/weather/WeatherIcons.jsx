import React from "react";

export function WeatherIcon({ type = "clear-day", size = 48, className = "" }) {
  const uid = React.useId ? React.useId().replace(/:/g, "") : Math.random().toString(36).slice(2, 8);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`aether-weather-icon ${className}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`sunGrad-${uid}`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#FFF7AE" />
          <stop offset="55%" stopColor="#FACC15" />
          <stop offset="100%" stopColor="#F97316" />
        </radialGradient>
        <linearGradient id={`moonGrad-${uid}`} x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="55%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <linearGradient id={`cloudLight-${uid}`} x1="20%" y1="10%" x2="80%" y2="95%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>
        <linearGradient id={`cloudDark-${uid}`} x1="20%" y1="10%" x2="80%" y2="95%">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="60%" stopColor="#64748B" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id={`rainGrad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient id={`boltGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="50%" stopColor="#FACC15" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
      </defs>

      {/* CLEAR DAY */}
      {type === "clear-day" && (
        <g>
          <circle
            cx="32"
            cy="32"
            r="21"
            fill={`url(#sunGrad-${uid})`}
            opacity="0.18"
          />
          <g stroke="#FBBF24" strokeWidth="3" strokeLinecap="round">
            <line x1="32" y1="6" x2="32" y2="11" />
            <line x1="32" y1="53" x2="32" y2="58" />
            <line x1="6" y1="32" x2="11" y2="32" />
            <line x1="53" y1="32" x2="58" y2="32" />
            <line x1="13.6" y1="13.6" x2="17.2" y2="17.2" />
            <line x1="46.8" y1="46.8" x2="50.4" y2="50.4" />
            <line x1="50.4" y1="13.6" x2="46.8" y2="17.2" />
            <line x1="17.2" y1="46.8" x2="13.6" y2="50.4" />
          </g>
          <circle cx="32" cy="32" r="14" fill={`url(#sunGrad-${uid})`} />
        </g>
      )}

      {/* CLEAR NIGHT */}
      {type === "clear-night" && (
        <g>
          <circle cx="32" cy="32" r="20" fill="#818CF8" opacity="0.14" />
          <path
            d="M39.5 15.5C31.5 17 26 24.5 27.5 33C29 41.5 36.8 46.8 45 45C40.2 49.5 33 51 26.2 48.2C17.8 44.7 13.8 35 17.3 26.6C20.2 19.6 27 15.2 34.5 15.2C36.2 15.2 37.9 15.3 39.5 15.5Z"
            fill={`url(#moonGrad-${uid})`}
          />
          <circle cx="46" cy="18" r="1.8" fill="#FEF08A" />
          <circle cx="51" cy="27" r="1.3" fill="#E0E7FF" />
          <circle cx="20" cy="15" r="1.2" fill="#E0E7FF" />
        </g>
      )}

      {/* PARTLY CLOUDY DAY */}
      {type === "partly-cloudy-day" && (
        <g>
          <g stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round">
            <line x1="23" y1="9" x2="23" y2="13" />
            <line x1="9" y1="23" x2="13" y2="23" />
            <line x1="13" y1="13" x2="16" y2="16" />
            <line x1="33" y1="13" x2="30" y2="16" />
          </g>
          <circle cx="23" cy="24" r="10" fill={`url(#sunGrad-${uid})`} />
          <path
            d="M22 46H46.5C51.7 46 56 41.7 56 36.5C56 31.6 52.3 27.6 47.5 27.1C45.9 19.6 39.3 14 31.3 14C22.2 14 14.8 21.4 14.8 30.5C14.8 31.1 14.8 31.7 14.9 32.3C11.5 33.5 9 36.7 9 40.5C9 45.2 12.8 46 17.5 46H22Z"
            fill={`url(#cloudLight-${uid})`}
          />
        </g>
      )}

      {/* PARTLY CLOUDY NIGHT */}
      {type === "partly-cloudy-night" && (
        <g>
          <path
            d="M29 12C23.5 13 19.8 18.2 20.8 24C21.8 29.8 27.1 33.4 32.8 32.2C29.5 35.3 24.5 36.3 19.9 34.4C14.1 32 11.4 25.3 13.8 19.6C15.8 14.8 20.4 11.8 25.6 11.8C26.8 11.8 27.9 11.9 29 12Z"
            fill={`url(#moonGrad-${uid})`}
          />
          <circle cx="47" cy="14" r="1.5" fill="#FEF08A" />
          <path
            d="M22 47H46.5C51.7 47 56 42.7 56 37.5C56 32.6 52.3 28.6 47.5 28.1C45.9 20.6 39.3 15 31.3 15C22.2 15 14.8 22.4 14.8 31.5C14.8 32.1 14.8 32.7 14.9 33.3C11.5 34.5 9 37.7 9 41.5C9 46.2 12.8 47 17.5 47H22Z"
            fill={`url(#cloudDark-${uid})`}
          />
        </g>
      )}

      {/* OVERCAST */}
      {type === "overcast" && (
        <g>
          <path
            d="M27 38H49C53.4 38 57 34.4 57 30C57 25.9 53.9 22.5 49.9 22.1C48.5 15.8 42.9 11 36.2 11C28.5 11 22.2 17.3 22.2 25C22.2 25.5 22.2 26 22.3 26.5C19.4 27.5 17.3 30.2 17.3 33.4C17.3 37.4 20.5 38 24.5 38H27Z"
            fill={`url(#cloudDark-${uid})`}
            opacity="0.85"
          />
          <path
            d="M19 47H44.5C49.7 47 54 42.7 54 37.5C54 32.6 50.3 28.6 45.5 28.1C43.9 20.6 37.3 15 29.3 15C20.2 15 12.8 22.4 12.8 31.5C12.8 32.1 12.8 32.7 12.9 33.3C9.5 34.5 7 37.7 7 41.5C7 46.2 10.8 47 15.5 47H19Z"
            fill={`url(#cloudLight-${uid})`}
          />
        </g>
      )}

      {/* FOG / MIST */}
      {type === "fog" && (
        <g>
          <path
            d="M19 37H45C49.4 37 53 33.4 53 29C53 24.6 49.5 21.1 45.2 20.9C43.7 14.6 38 10 31.2 10C23.4 10 17 16.4 17 24.2C17 24.9 17.1 25.5 17.2 26.1C13.7 27.2 11 30.4 11 34.2C11 36.5 14 37 19 37Z"
            fill={`url(#cloudDark-${uid})`}
          />
          <g stroke="#94A3B8" strokeWidth="3.2" strokeLinecap="round">
            <line x1="12" y1="44" x2="52" y2="44" />
            <line x1="16" y1="51" x2="48" y2="51" />
            <line x1="22" y1="58" x2="42" y2="58" />
          </g>
        </g>
      )}

      {/* DRIZZLE / RAIN / HEAVY RAIN */}
      {(type === "drizzle" || type === "rain" || type === "heavy-rain") && (
        <g>
          <path
            d="M19 41H45.5C50.7 41 55 36.7 55 31.5C55 26.6 51.3 22.6 46.5 22.1C44.9 14.6 38.3 9 30.3 9C21.2 9 13.8 16.4 13.8 25.5C13.8 26.1 13.8 26.7 13.9 27.3C10.5 28.5 8 31.7 8 35.5C8 40.2 11.8 41 16.5 41H19Z"
            fill={type === "heavy-rain" ? `url(#cloudDark-${uid})` : `url(#cloudLight-${uid})`}
          />
          <g
            stroke={`url(#rainGrad-${uid})`}
            strokeWidth={type === "heavy-rain" ? "3.2" : "2.6"}
            strokeLinecap="round"
          >
            <line x1="21" y1="46" x2="17" y2="56" />
            <line x1="32" y1="46" x2="28" y2="58" />
            <line x1="43" y1="46" x2="39" y2="56" />
            {type === "heavy-rain" && (
              <>
                <line x1="26.5" y1="49" x2="23.5" y2="59" />
                <line x1="37.5" y1="49" x2="34.5" y2="59" />
              </>
            )}
          </g>
        </g>
      )}

      {/* THUNDERSTORM */}
      {type === "thunderstorm" && (
        <g>
          <path
            d="M19 39H45.5C50.7 39 55 34.7 55 29.5C55 24.6 51.3 20.6 46.5 20.1C44.9 12.6 38.3 7 30.3 7C21.2 7 13.8 14.4 13.8 23.5C13.8 24.1 13.8 24.7 13.9 25.3C10.5 26.5 8 29.7 8 33.5C8 38.2 11.8 39 16.5 39H19Z"
            fill={`url(#cloudDark-${uid})`}
          />
          <polygon
            points="33,34 23,48 31,48 28,60 42,44 33.5,44"
            fill={`url(#boltGrad-${uid})`}
          />
          <g stroke={`url(#rainGrad-${uid})`} strokeWidth="2.4" strokeLinecap="round">
            <line x1="18" y1="44" x2="15" y2="53" />
            <line x1="45" y1="44" x2="42" y2="53" />
          </g>
        </g>
      )}

      {/* SNOW / HEAVY SNOW / SLEET */}
      {(type === "snow" || type === "heavy-snow" || type === "sleet") && (
        <g>
          <path
            d="M19 40H45.5C50.7 40 55 35.7 55 30.5C55 25.6 51.3 21.6 46.5 21.1C44.9 13.6 38.3 8 30.3 8C21.2 8 13.8 15.4 13.8 24.5C13.8 25.1 13.8 25.7 13.9 26.3C10.5 27.5 8 30.7 8 34.5C8 39.2 11.8 40 16.5 40H19Z"
            fill={`url(#cloudLight-${uid})`}
          />
          <g fill="#BAE6FD">
            <circle cx="20" cy="48" r="2.5" />
            <circle cx="32" cy="51" r="2.8" />
            <circle cx="44" cy="48" r="2.5" />
            <circle cx="26" cy="57" r="2.3" />
            <circle cx="38" cy="57" r="2.3" />
          </g>
        </g>
      )}
    </svg>
  );
}

// Accurate SVG Moon Phase disc renderer
export function MoonPhaseIcon({ fraction = 0.25, size = 44 }) {
  const r = 18;
  const cx = 22;
  const cy = 22;

  // Compute lit path for waxing (0..0.5) and waning (0.5..1)
  const isWaxing = fraction <= 0.5;
  const phaseAngle = fraction * 2 * Math.PI;
  const rx = Math.abs(Math.cos(phaseAngle)) * r;

  let sweep1 = isWaxing ? 1 : 0;
  let sweep2 = fraction < 0.25 || fraction > 0.75 ? 0 : 1;
  if (!isWaxing) {
    sweep2 = fraction < 0.75 ? 1 : 0;
  }

  const d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweep1} ${cx} ${
    cy + r
  } A ${rx} ${r} 0 0 ${sweep2} ${cx} ${cy - r} Z`;

  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="#1E293B"
        stroke="rgba(148, 163, 184, 0.35)"
        strokeWidth="1.5"
      />
      {fraction > 0.02 && fraction < 0.98 && (
        <path d={d} fill="#F8FAFC" opacity="0.92" />
      )}
      {fraction >= 0.48 && fraction <= 0.52 && (
        <circle cx={cx} cy={cy} r={r} fill="#F8FAFC" />
      )}
      {/* Subtle lunar craters */}
      <circle cx="17" cy="16" r="2.5" fill="rgba(100,116,139,0.22)" />
      <circle cx="26" cy="24" r="3.4" fill="rgba(100,116,139,0.18)" />
      <circle cx="20" cy="28" r="1.8" fill="rgba(100,116,139,0.2)" />
    </svg>
  );
}

