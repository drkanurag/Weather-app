import React, { useRef, useEffect, useState } from "react";
import { WeatherIcon } from "./WeatherIcons";
import { formatTemp, formatWind } from "../../services/weatherService";

export default function WholeDayExplorer({
  allDays = [],
  selectedDate = "",
  selectedDayRecord = null,
  todayDate = "",
  loadingCustomDate = false,
  tempUnit = "C",
  windUnit = "km/h",
  timeFormat = "12h",
  liveTimeStr = "",
  onSelectDate,
  onSelectPhaseHour,
  activePhaseId = null,
  activeHourIndex = 12,
  onSelectHourIndex,
  liveClockHour = 12,
  isSyncedToLiveClock = true,
  onResetToLiveClock,
  onManualRefresh,
}) {
  const stripRef = useRef(null);
  const activePillRef = useRef(null);
  const [isPlayingDay, setIsPlayingDay] = useState(false);

  // Auto-scroll active date pill into view
  useEffect(() => {
    if (activePillRef.current && stripRef.current) {
      try {
        activePillRef.current.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      } catch (e) {}
    }
  }, [selectedDate]);

  // 24-Hour Live Day Auto-Play loop
  useEffect(() => {
    if (!isPlayingDay) return;
    const timer = setInterval(() => {
      if (onSelectHourIndex) {
        onSelectHourIndex((prev) => (Number(prev) + 1) % 24);
      }
    }, 1100);
    return () => clearInterval(timer);
  }, [isPlayingDay, onSelectHourIndex]);

  const formatDayShort = (dateStr) => {
    if (!dateStr) return "";
    if (dateStr === todayDate) return "Today";
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString("en-US", { weekday: "short" });
  };

  const formatMonthDay = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatFullDateHeading = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatHourClock = (hr) => {
    const h = Number(hr) || 0;
    if (timeFormat === "24h") return `${String(h).padStart(2, "0")}:00`;
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00 ${suffix}`;
  };

  const shiftDateByDays = (offset) => {
    if (!selectedDate) return;
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, (d || 1) + offset);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    onSelectDate(`${yyyy}-${mm}-${dd}`);
  };

  const summary = selectedDayRecord?.summary;
  const dayParts = selectedDayRecord?.dayParts || [];
  const hours = selectedDayRecord?.hours || [];
  const currentSlotHour =
    hours[activeHourIndex] ||
    hours[liveClockHour] ||
    hours[12] ||
    hours[0] ||
    null;

  return (
    <section
      className="aether-card aether-wholeday-section"
      aria-label="Whole-Day Weather by Date"
    >
      {/* HEADER BAR WITH CALENDAR PICKER, LIVE TIME & PREV/NEXT DAY CONTROLS */}
      <div className="aether-card-header wholeday-header">
        <div>
          <div className="aether-section-tag">
            <span className="tag-dot live-pulse" /> WHOLE-DAY WEATHER &amp; DATE
            SELECTOR
          </div>
          <h3>
            📅{" "}
            <span className="highlight-date-text">
              {formatFullDateHeading(selectedDate)}
            </span>
            {liveTimeStr && (
              <span className="date-mode-badge mode-time-pill">
                🕒 {liveTimeStr}
              </span>
            )}
            <span className="date-mode-badge mode-today">
              <i className="live-dot" />{" "}
              {selectedDate === todayDate ? "Today" : "Selected Date"}
            </span>
          </h3>
        </div>

        <div className="wholeday-calendar-controls">
          <button
            type="button"
            className="aether-ctrl-btn"
            onClick={() => shiftDateByDays(-1)}
            title="Previous Day"
          >
            ◀ Prev Day
          </button>

          {selectedDate !== todayDate && (
            <button
              type="button"
              className="aether-ctrl-btn is-active"
              onClick={() => onSelectDate(todayDate)}
              title="Back to Today"
            >
              ⚡ Today
            </button>
          )}

          <button
            type="button"
            className="aether-ctrl-btn"
            onClick={() => shiftDateByDays(1)}
            title="Next Day"
          >
            Next Day ▶
          </button>

          <label
            className="aether-date-picker-label"
            title="Pick any date to check its full-day weather"
          >
            <span>📅 Pick Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onSelectDate(e.target.value);
              }}
              className="aether-date-input"
            />
          </label>

          {onManualRefresh && (
            <button
              type="button"
              className="aether-ctrl-btn"
              onClick={onManualRefresh}
              title="Refresh live weather"
            >
              🔄 Refresh
            </button>
          )}
        </div>
      </div>

      {/* HORIZONTAL SCROLLABLE MULTI-DATE STRIP */}
      <div className="wholeday-date-strip" ref={stripRef} role="tablist">
        {allDays.map((dayObj) => {
          const isSelected = dayObj.date === selectedDate;
          const s = dayObj.summary;
          const liveHourForDay =
            dayObj.hours?.[activeHourIndex] ||
            dayObj.hours?.[liveClockHour] ||
            dayObj.hours?.[12] ||
            null;
          return (
            <button
              key={dayObj.date}
              ref={isSelected ? activePillRef : null}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`date-strip-card ${isSelected ? "is-selected" : ""} ${
                dayObj.isToday ? "is-today" : ""
              }`}
              onClick={() => onSelectDate(dayObj.date)}
            >
              <div className="date-card-top">
                <span className="date-card-weekday">
                  {formatDayShort(dayObj.date)}
                </span>
                {dayObj.isToday && (
                  <span className="tiny-live-pill">
                    <i className="tiny-today-dot" /> LIVE
                  </span>
                )}
              </div>
              <span className="date-card-md">{formatMonthDay(dayObj.date)}</span>
              <div className="date-card-icon">
                <WeatherIcon
                  type={
                    liveHourForDay?.condition?.icon || s?.condition?.icon
                  }
                  size={30}
                />
              </div>
              <div className="date-card-temps">
                <strong>{formatTemp(s?.tempMax, tempUnit)}</strong>
                <span>{formatTemp(s?.tempMin, tempUnit)}</span>
              </div>
              {s?.precipProbMax >= 15 && (
                <span className="date-card-rain">💧 {s.precipProbMax}%</span>
              )}
            </button>
          );
        })}
      </div>

      {/* INTERACTIVE TIME-OF-DAY SLIDER FOR SELECTED DAY */}
      {currentSlotHour && !loadingCustomDate && (
        <div className="wholeday-live-scrubber-bar">
          <div className="scrubber-top-row">
            <div className="scrubber-live-readout">
              <span className="scrubber-live-badge">
                <i className="live-dot" /> 🕒{" "}
                {formatHourClock(activeHourIndex)}
              </span>
              <strong>
                {formatTemp(currentSlotHour.temp, tempUnit)} •{" "}
                {currentSlotHour.condition?.label}
              </strong>
              <span className="scrubber-sub-metrics">
                Feels like {formatTemp(currentSlotHour.feelsLike, tempUnit)} • 🌧️{" "}
                {currentSlotHour.precipProb}% Rain • 💨{" "}
                {formatWind(currentSlotHour.windSpeed, windUnit)} Wind
              </span>
            </div>

            <div className="scrubber-actions">
              {summary?.optimalOutdoorWindow && (
                <button
                  type="button"
                  className="aether-ctrl-btn"
                  title="Computed in O(N) via Sliding Window Comfort Algorithm"
                  onClick={() => {
                    setIsPlayingDay(false);
                    if (onSelectHourIndex) {
                      onSelectHourIndex(summary.optimalOutdoorWindow.startHour);
                    }
                  }}
                >
                  🌤️ Best 3h to Go Out:{" "}
                  {formatHourClock(summary.optimalOutdoorWindow.startHour)} –{" "}
                  {formatHourClock(summary.optimalOutdoorWindow.endHour)}
                </button>
              )}
              <button
                type="button"
                className={`aether-ctrl-btn ${isPlayingDay ? "is-active" : ""}`}
                onClick={() => setIsPlayingDay((p) => !p)}
              >
                {isPlayingDay ? "⏸ Pause Day Preview" : "▶ Play Full Day Sky"}
              </button>
              {!isSyncedToLiveClock && onResetToLiveClock && (
                <button
                  type="button"
                  className="aether-ctrl-btn"
                  onClick={() => {
                    setIsPlayingDay(false);
                    onResetToLiveClock();
                  }}
                >
                  ⚡ Back to Current Time ({formatHourClock(liveClockHour)})
                </button>
              )}
            </div>
          </div>

          <div className="scrubber-slider-wrap">
            <span className="scrubber-edge-label">
              {timeFormat === "24h" ? "00:00" : "12 AM"}
            </span>
            <input
              type="range"
              min="0"
              max="23"
              step="1"
              value={activeHourIndex}
              onChange={(e) => {
                setIsPlayingDay(false);
                if (onSelectHourIndex) {
                  onSelectHourIndex(Number(e.target.value));
                }
              }}
              className="wholeday-range-slider"
              aria-label="Slide to check weather at any hour of the day"
            />
            <span className="scrubber-edge-label">
              {timeFormat === "24h" ? "23:00" : "11 PM"}
            </span>
          </div>
        </div>
      )}

      {/* WHOLE-DAY SUMMARY + 4 PARTS OF THE DAY (MORNING / AFTERNOON / EVENING / NIGHT) */}
      {loadingCustomDate ? (
        <div className="wholeday-loading">
          <div className="loading-orbital" />
          <span>Loading full-day weather for {selectedDate}...</span>
        </div>
      ) : (
        selectedDayRecord && (
          <>
            <div className="wholeday-kpi-banner">
              <div className="wd-kpi-item">
                <span>DAY SUMMARY</span>
                <strong>{summary?.condition?.label}</strong>
              </div>
              <div className="wd-kpi-item">
                <span>HIGH &amp; LOW</span>
                <strong>
                  {formatTemp(summary?.tempMax, tempUnit)} /{" "}
                  {formatTemp(summary?.tempMin, tempUnit)}
                </strong>
              </div>
              <div className="wd-kpi-item">
                <span>RAIN CHANCE</span>
                <strong>{summary?.precipProbMax}%</strong>
              </div>
              <div className="wd-kpi-item">
                <span>WIND</span>
                <strong>{formatWind(summary?.windSpeedMax, windUnit)}</strong>
              </div>
              <div className="wd-kpi-item">
                <span>HUMIDITY</span>
                <strong>{summary?.humidityAvg}%</strong>
              </div>
              <div className="wd-kpi-item">
                <span>SUNRISE &amp; SUNSET</span>
                <strong>
                  ↑{" "}
                  {(summary?.sunrise || "").split("T")[1]?.slice(0, 5) ||
                    "06:10"}{" "}
                  • ↓{" "}
                  {(summary?.sunset || "").split("T")[1]?.slice(0, 5) ||
                    "18:25"}
                </strong>
              </div>
            </div>

            {/* 4 PARTS OF THE DAY: MORNING • AFTERNOON • EVENING • NIGHT */}
            <div className="wholeday-phases-grid">
              {dayParts.map((part) => {
                const isPhaseActive = activePhaseId === part.id;
                const phaseBadges = {
                  morning: "🌅 Morning",
                  afternoon: "☀️ Afternoon",
                  evening: "🌇 Evening",
                  night: "🌙 Night",
                };

                return (
                  <div
                    key={part.id}
                    className={`day-phase-card ${
                      isPhaseActive ? "is-active-phase" : ""
                    }`}
                    onClick={() => {
                      setIsPlayingDay(false);
                      if (onSelectPhaseHour) {
                        onSelectPhaseHour(
                          isPhaseActive ? null : part.representativeHour,
                          isPhaseActive ? null : part.id
                        );
                      }
                    }}
                    onMouseEnter={() =>
                      onSelectPhaseHour &&
                      onSelectPhaseHour(part.representativeHour, part.id)
                    }
                    onMouseLeave={() =>
                      onSelectPhaseHour && onSelectPhaseHour(null, null)
                    }
                    role="button"
                    tabIndex={0}
                  >
                    <div className="phase-card-head">
                      <div>
                        <h4>{phaseBadges[part.id] || part.title}</h4>
                        <span className="phase-time-range">
                          {part.timeRange}
                        </span>
                      </div>
                      <WeatherIcon type={part.condition?.icon} size={42} />
                    </div>

                    <div className="phase-temp-main">
                      <strong className="phase-avg-temp">
                        {formatTemp(part.tempAvg, tempUnit)}
                      </strong>
                      <div className="phase-temp-sub">
                        <span>
                          Feels like {formatTemp(part.feelsLikeAvg, tempUnit)}
                        </span>
                      </div>
                    </div>

                    <p className="phase-cond-label">{part.condition?.label}</p>

                    <div className="phase-micro-stats">
                      <span>🌧️ {part.precipProbMax}% Rain</span>
                      <span>💨 {formatWind(part.windSpeedAvg, windUnit)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      )}
    </section>
  );
}
