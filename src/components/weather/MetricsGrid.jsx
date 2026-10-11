import React from "react";
import {
  formatTemp,
  formatWind,
  formatVisibility,
  getWindCardinal,
  getBeaufortScale,
  getAqiMeta,
  getUvMeta,
} from "../../services/weatherService";

export default function MetricsGrid({
  weather,
  tempUnit = "C",
  windUnit = "km/h",
}) {
  if (!weather) return null;
  const { current, airQuality, astronomy, daily } = weather;

  const aqiMeta = getAqiMeta(airQuality?.usAqi);
  const uvMeta = getUvMeta(current.uvIndex);
  const beaufort = getBeaufortScale(current.windSpeed);
  const cardinal = getWindCardinal(current.windDirection);

  const todaySummary = daily?.[0] || {};
  const rainChance = Math.max(
    current.precipProb || 0,
    todaySummary.precipProbMax || 0
  );
  const rainAmount = todaySummary.precipSum ?? current.precipitation ?? 0;

  const getRainSummary = () => {
    if (rainChance >= 65 || rainAmount >= 5) {
      return {
        status: "Likely to Rain",
        color: "#38bdf8",
        advice: "Carry an umbrella or raincoat before heading out.",
      };
    }
    if (rainChance >= 35 || rainAmount >= 0.5) {
      return {
        status: "Possible Light Showers",
        color: "#fbbf24",
        advice: "A small foldable umbrella is a good idea today.",
      };
    }
    return {
      status: "Mostly Dry",
      color: "#10b981",
      advice: "Low chance of rain — great for outdoor plans.",
    };
  };
  const rainMeta = getRainSummary();

  const getHumidityComfort = (rh) => {
    if (rh >= 75) {
      return {
        label: "Humid & Sticky",
        color: "#f59e0b",
        advice: "Air feels warm and humid. Drink plenty of water and wear breathable clothes.",
      };
    }
    if (rh < 30) {
      return {
        label: "Dry Air",
        color: "#38bdf8",
        advice: "Air is quite dry today. Keep water and lip balm or moisturizer handy.",
      };
    }
    return {
      label: "Comfortable",
      color: "#10b981",
      advice: "Humidity is at a comfortable, pleasant level for being outdoors.",
    };
  };
  const humComfort = getHumidityComfort(current.humidity);

  const daylightHrs = Math.floor((astronomy?.daylightSeconds || 43200) / 3600);
  const daylightMins = Math.round(
    ((astronomy?.daylightSeconds || 43200) % 3600) / 60
  );

  return (
    <section
      className="aether-metrics-bento"
      aria-label="Today's Essential Weather Details"
    >
      {/* 1. RAIN & UMBRELLA CHECK */}
      <article className="aether-card bento-card">
        <div className="bento-card-top">
          <span className="bento-label">🌧️ RAIN &amp; UMBRELLA</span>
          <span className="bento-sub-badge" style={{ color: rainMeta.color }}>
            {rainMeta.status}
          </span>
        </div>

        <div className="bento-big-metric">
          <strong>{rainChance}%</strong>
          <span>Chance of Rain</span>
        </div>

        <div className="metric-linear-bar">
          <div
            className="metric-linear-fill"
            style={{
              width: `${Math.max(4, rainChance)}%`,
              background: "linear-gradient(90deg, #38bdf8, #2563eb)",
            }}
          />
        </div>

        <p className="bento-footnote">{rainMeta.advice}</p>
      </article>

      {/* 2. WIND & BREEZE */}
      <article className="aether-card bento-card">
        <div className="bento-card-top">
          <span className="bento-label">💨 WIND &amp; BREEZE</span>
          <span className="bento-sub-badge">{beaufort.description}</span>
        </div>

        <div className="bento-big-metric">
          <strong>{formatWind(current.windSpeed, windUnit)}</strong>
          <span>Direction: From {cardinal}</span>
        </div>

        <p className="bento-footnote">
          Wind gusts up to{" "}
          <strong>{formatWind(current.windGusts, windUnit)}</strong>.{" "}
          {current.windSpeed < 20
            ? "Calm and comfortable breeze outdoors."
            : "Noticeably breezy — secure light outdoor items."}
        </p>
      </article>

      {/* 3. HUMIDITY & COMFORT */}
      <article className="aether-card bento-card">
        <div className="bento-card-top">
          <span className="bento-label">💧 HUMIDITY</span>
          <span className="bento-sub-badge" style={{ color: humComfort.color }}>
            {humComfort.label}
          </span>
        </div>

        <div className="bento-big-metric">
          <strong>{current.humidity}%</strong>
          <span>Feels Like {formatTemp(current.feelsLike, tempUnit)}</span>
        </div>

        <div className="metric-linear-bar">
          <div
            className="metric-linear-fill"
            style={{
              width: `${current.humidity}%`,
              background: "linear-gradient(90deg, #38bdf8, #6366f1)",
            }}
          />
        </div>

        <p className="bento-footnote">{humComfort.advice}</p>
      </article>

      {/* 4. SUN & UV PROTECTION */}
      <article className="aether-card bento-card">
        <div className="bento-card-top">
          <span className="bento-label">☀️ SUN &amp; UV LEVEL</span>
          <span className="bento-sub-badge" style={{ color: uvMeta.color }}>
            {uvMeta.label}
          </span>
        </div>

        <div className="bento-big-metric">
          <strong>UV { Math.round(current.uvIndex) }</strong>
          <span>
            Today&apos;s Peak: UV{" "}
            {Math.round(todaySummary.uvMax ?? current.uvIndex)}
          </span>
        </div>

        <div className="uv-spectrum-bar">
          <div
            className="uv-marker"
            style={{
              left: `${Math.min(
                98,
                Math.max(2, (current.uvIndex / 11) * 100)
              )}%`,
            }}
          />
        </div>

        <p className="bento-footnote">{uvMeta.advice}</p>
      </article>

      {/* 5. SUNRISE & SUNSET */}
      <article className="aether-card bento-card">
        <div className="bento-card-top">
          <span className="bento-label">🌅 SUNRISE &amp; SUNSET</span>
          <span className="bento-sub-badge">
            {daylightHrs}h {daylightMins}m of Daylight
          </span>
        </div>

        <div className="bento-big-metric">
          <strong>↑ {astronomy?.solar?.sunriseFormatted || "06:10 AM"}</strong>
          <span>Sunset: ↓ {astronomy?.solar?.sunsetFormatted || "06:25 PM"}</span>
        </div>

        <p className="bento-footnote">
          Moon tonight: <strong>{astronomy?.moon?.name || "Clear Moon"}</strong>.{" "}
          {astronomy?.solar?.isDaylight
            ? "Currently daytime at this location."
            : "Currently nighttime at this location."}
        </p>
      </article>

      {/* 6. AIR QUALITY & ROAD VISIBILITY */}
      <article className="aether-card bento-card">
        <div className="bento-card-top">
          <span className="bento-label">🍃 AIR QUALITY &amp; VIEW</span>
          <span className="bento-sub-badge" style={{ color: aqiMeta.color }}>
            {aqiMeta.label} Air
          </span>
        </div>

        <div className="bento-big-metric">
          <strong style={{ color: aqiMeta.color }}>{aqiMeta.label}</strong>
          <span>
            Road Visibility: {formatVisibility(current.visibility, tempUnit)}
          </span>
        </div>

        <p className="bento-footnote">{aqiMeta.advice}</p>
      </article>
    </section>
  );
}
