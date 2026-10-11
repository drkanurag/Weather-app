import React from "react";
import { WeatherIcon } from "./WeatherIcons";
import { formatTemp, formatWind } from "../../services/weatherService";

export default function SmartAdvisor({
  insights,
  favoriteSummaries = [],
  currentLocationId,
  tempUnit = "C",
  windUnit = "km/h",
  onSelectCity,
}) {
  if (!insights) return null;

  return (
    <div className="aether-advisor-stack">
      {/* BEST ACTIVITIES FOR TODAY + WHAT TO WEAR & CARRY */}
      <div className="advisor-two-col">
        <section
          className="aether-card advisor-card"
          aria-label="Best Activities for Today"
        >
          <div className="aether-card-header">
            <div>
              <div className="aether-section-tag">
                <span className="tag-dot" /> DAILY ACTIVITY GUIDE
              </div>
              <h3>Best Activities for Today</h3>
            </div>
          </div>

          <div className="activity-scores-grid">
            {insights.activities.map((act) => {
              const r = 22;
              const c = 2 * Math.PI * r;
              const offset = c - (act.score / 100) * c;

              return (
                <div key={act.id} className="activity-score-item">
                  <div className="activity-ring-wrap">
                    <svg width="56" height="56" viewBox="0 0 56 56">
                      <circle
                        cx="28"
                        cy="28"
                        r={r}
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="4.5"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r={r}
                        fill="none"
                        stroke={act.color}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        transform="rotate(-90 28 28)"
                      />
                      <text
                        x="28"
                        y="32"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="13"
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {act.score}
                      </text>
                    </svg>
                  </div>
                  <div className="activity-info">
                    <div className="activity-title-row">
                      <strong>{act.title}</strong>
                      <span
                        className="activity-verdict-pill"
                        style={{
                          color: act.color,
                          background: `${act.color}20`,
                        }}
                      >
                        {act.label}
                      </span>
                    </div>
                    <p>{act.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* WHAT TO WEAR & CARRY TODAY */}
        <section
          className="aether-card wardrobe-card"
          aria-label="What to Wear and Carry Today"
        >
          <div className="aether-card-header">
            <div>
              <div className="aether-section-tag">
                <span className="tag-dot" /> CLOTHING &amp; ESSENTIALS
              </div>
              <h3>What to Wear &amp; Carry Today</h3>
            </div>
          </div>

          <p className="executive-summary-box">{insights.summary}</p>

          <div className="gear-checklist">
            {insights.gear.map((g, i) => (
              <div key={g.item + i} className="gear-row">
                <span className="gear-check-icon">✓</span>
                <div className="gear-text">
                  <strong>{g.item}</strong>
                  <span>{g.reason}</span>
                </div>
                <span className={`gear-tag tag-${g.tag.toLowerCase()}`}>
                  {g.tag}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* SAVED CITIES LIVE WEATHER */}
      {favoriteSummaries.length > 0 && (
        <section
          className="aether-card world-matrix-card"
          aria-label="Saved Cities Weather"
        >
          <div className="aether-card-header">
            <div>
              <div className="aether-section-tag">
                <span className="tag-dot" /> SAVED CITIES
              </div>
              <h3>Saved Cities Live Weather</h3>
            </div>
            <span className="daily-hint">
              Click any city to view its weather
            </span>
          </div>

          <div className="world-table-wrap">
            <table className="world-comparison-table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Weather</th>
                  <th>Temperature</th>
                  <th>Feels Like</th>
                  <th>Low / High</th>
                  <th>Wind</th>
                  <th>Humidity</th>
                </tr>
              </thead>
              <tbody>
                {favoriteSummaries.map((city) => {
                  const isActive = city.id === currentLocationId;
                  return (
                    <tr
                      key={city.id}
                      className={isActive ? "is-active-station" : ""}
                      onClick={() => onSelectCity && onSelectCity(city)}
                    >
                      <td>
                        <div className="station-cell">
                          <span className="station-country">
                            {city.countryCode || "GL"}
                          </span>
                          <div>
                            <strong>{city.name}</strong>
                            <small>{city.country}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="station-cond-cell">
                          <WeatherIcon type={city.condition?.icon} size={28} />
                          <span>{city.condition?.shortLabel}</span>
                        </div>
                      </td>
                      <td className="mono-cell temp-highlight">
                        {formatTemp(city.temp, tempUnit)}
                      </td>
                      <td className="mono-cell">
                        {formatTemp(city.feelsLike, tempUnit)}
                      </td>
                      <td className="mono-cell">
                        {formatTemp(city.tempMin, tempUnit)} /{" "}
                        <strong>{formatTemp(city.tempMax, tempUnit)}</strong>
                      </td>
                      <td className="mono-cell">
                        {formatWind(city.windSpeed, windUnit)}
                      </td>
                      <td className="mono-cell">{city.humidity}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
