import React, { useState } from "react";
import { WeatherIcon } from "./WeatherIcons";
import {
  formatTemp,
  formatWind,
  getWindCardinal,
  getUvMeta,
} from "../../services/weatherService";

export default function DailyForecast({
  daily = [],
  daysByDate = {},
  liveClockHour = 12,
  dailyBounds = { min: 10, max: 30 },
  currentTemp = null,
  selectedDate = "",
  onSelectDate = null,
  tempUnit = "C",
  windUnit = "km/h",
}) {
  const [expandedIdx, setExpandedIdx] = useState(0);

  const formatDayName = (dateStr, isToday) => {
    if (isToday) return "Today";
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

  const formatShortDate = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatClockTime = (isoStr) => {
    if (!isoStr || !isoStr.includes("T")) return "--:--";
    return isoStr.split("T")[1].slice(0, 5);
  };

  const span = Math.max(1, dailyBounds.max - dailyBounds.min);

  return (
    <section
      className="aether-card aether-daily-section"
      aria-label="14-Day Weather Forecast"
    >
      <div className="aether-card-header">
        <div>
          <div className="aether-section-tag">
            <span className="tag-dot live-pulse" /> DAILY FORECAST
          </div>
          <h3>14-Day Weather Forecast</h3>
        </div>
        <span className="daily-hint">
          Click any day to view its full-day weather
        </span>
      </div>

      <div className="daily-list">
        {daily.map((day, idx) => {
          const dayRecord = daysByDate?.[day.date];
          const liveHourSlot =
            dayRecord?.hours?.[liveClockHour] || dayRecord?.hours?.[12] || null;
          const liveDayTemp = day.isToday
            ? currentTemp ?? liveHourSlot?.temp ?? day.tempMax
            : liveHourSlot?.temp ?? Math.round((day.tempMax + day.tempMin) / 2);

          const leftPct = Math.max(
            0,
            Math.min(100, ((day.tempMin - dailyBounds.min) / span) * 100)
          );
          const widthPct = Math.max(
            6,
            Math.min(
              100 - leftPct,
              ((day.tempMax - day.tempMin) / span) * 100
            )
          );

          const liveDotPct =
            liveDayTemp !== null
              ? Math.max(
                  0,
                  Math.min(100, ((liveDayTemp - dailyBounds.min) / span) * 100)
                )
              : null;

          const isExpanded = selectedDate
            ? selectedDate === day.date
            : expandedIdx === idx;
          const uvMeta = getUvMeta(day.uvMax);

          return (
            <div
              key={day.date}
              className={`daily-item-wrapper ${isExpanded ? "is-expanded" : ""}`}
            >
              <button
                type="button"
                className="daily-row-btn"
                onClick={() => {
                  setExpandedIdx(isExpanded ? null : idx);
                  if (onSelectDate) onSelectDate(day.date);
                }}
                aria-expanded={isExpanded}
              >
                <div className="daily-col-day">
                  <span className="day-title">
                    {formatDayName(day.date, day.isToday)}
                    {day.isToday && <span className="daily-live-tag">● LIVE</span>}
                  </span>
                  <span className="day-date">{formatShortDate(day.date)}</span>
                </div>

                <div className="daily-col-cond">
                  <WeatherIcon
                    type={
                      liveHourSlot?.condition?.icon || day.condition.icon
                    }
                    size={32}
                  />
                  <div className="cond-meta">
                    <span className="cond-name">
                      {liveHourSlot?.condition?.shortLabel ||
                        day.condition.shortLabel}
                    </span>
                    {day.precipProbMax >= 12 && (
                      <span className="cond-precip-badge">
                        💧 {day.precipProbMax}% Rain
                      </span>
                    )}
                  </div>
                </div>

                <div className="daily-col-range">
                  <span className="range-min">
                    {formatTemp(day.tempMin, tempUnit)}
                  </span>
                  <div className="range-track">
                    <div
                      className="range-fill"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                      }}
                    />
                    {liveDotPct !== null && (
                      <span
                        className="range-now-dot"
                        style={{ left: `${liveDotPct}%` }}
                        title={`Expected temperature around this hour: ${formatTemp(
                          liveDayTemp,
                          tempUnit
                        )}`}
                      />
                    )}
                  </div>
                  <span className="range-max">
                    {formatTemp(day.tempMax, tempUnit)}
                  </span>
                </div>

                <span className="daily-chevron" aria-hidden="true">
                  {isExpanded ? "−" : "+"}
                </span>
              </button>

              {isExpanded && (
                <div className="daily-expanded-panel">
                  <p className="daily-expanded-summary">
                    <strong>{day.condition.label}:</strong>{" "}
                    {day.condition.detail}. Feels like{" "}
                    <strong>{formatTemp(day.feelsLikeMin, tempUnit)}</strong> to{" "}
                    <strong>{formatTemp(day.feelsLikeMax, tempUnit)}</strong>.
                  </p>

                  {dayRecord?.dayParts?.length > 0 && (
                    <div className="daily-mini-phases-row">
                      {dayRecord.dayParts.map((part) => (
                        <div key={part.id} className="daily-mini-phase-pill">
                          <span>{part.title}</span>
                          <WeatherIcon type={part.condition?.icon} size={22} />
                          <strong>{formatTemp(part.tempAvg, tempUnit)}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="daily-expanded-grid">
                    <div className="daily-mini-stat">
                      <span className="mini-label">RAIN CHANCE</span>
                      <span className="mini-val">{day.precipProbMax}%</span>
                    </div>
                    <div className="daily-mini-stat">
                      <span className="mini-label">WIND SPEED</span>
                      <span className="mini-val">
                        {formatWind(day.windSpeedMax, windUnit)}
                      </span>
                    </div>
                    <div className="daily-mini-stat">
                      <span className="mini-label">SUN &amp; UV</span>
                      <span className="mini-val" style={{ color: uvMeta.color }}>
                        {uvMeta.label}
                      </span>
                    </div>
                    <div className="daily-mini-stat">
                      <span className="mini-label">SUNRISE &amp; SUNSET</span>
                      <span className="mini-val">
                        ↑ {formatClockTime(day.sunrise)} • ↓{" "}
                        {formatClockTime(day.sunset)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
