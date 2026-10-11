import React, { useState, useMemo } from "react";
import { WeatherIcon } from "./WeatherIcons";
import {
  convertTempValue,
  formatTemp,
  formatWind,
  getWindCardinal,
} from "../../services/weatherService";

export default function HourlyForecast({
  hourly = [],
  wholeDayHours = [],
  selectedDate = "",
  tempUnit = "C",
  windUnit = "km/h",
  timeFormat = "12h",
  onHoverHour = null,
}) {
  const [viewScope, setViewScope] = useState("wholeday"); // 'wholeday' (00:00-23:00) | 'rolling48'
  const [mode, setMode] = useState("temp"); // 'temp' | 'precip' | 'wind' | 'uv'
  const [hoverIdx, setHoverIdx] = useState(null);

  const slice = useMemo(() => {
    if (viewScope === "wholeday" && wholeDayHours && wholeDayHours.length > 0) {
      return wholeDayHours;
    }
    return hourly.slice(0, 48);
  }, [viewScope, wholeDayHours, hourly]);

  const formatHourLabel = (isoStr, isNow) => {
    if (isNow) return "Now";
    if (!isoStr) return "";
    const timePart = isoStr.split("T")[1] || "00:00";
    const [hStr, mStr] = timePart.split(":");
    const h = Number(hStr) || 0;
    if (timeFormat === "24h") {
      return `${String(h).padStart(2, "0")}:${mStr || "00"}`;
    }
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12} ${suffix}`;
  };

  // Compute SVG coordinates for smooth Catmull-Rom / cubic bezier curve
  const chartGeometry = useMemo(() => {
    if (!slice.length) return null;
    const width = Math.max(820, slice.length * 56);
    const height = 165;
    const padLeft = 28;
    const padRight = 28;
    const padTop = 30;
    const padBottom = 26;
    const usableW = width - padLeft - padRight;
    const usableH = height - padTop - padBottom;

    const getPrimaryVal = (item) => {
      if (mode === "temp") return convertTempValue(item.temp, tempUnit);
      if (mode === "precip") return item.precipProb;
      if (mode === "wind") return Math.round(item.windSpeed);
      return Number(item.uvIndex.toFixed(1));
    };

    const getSecondaryVal = (item) => {
      if (mode === "temp") return convertTempValue(item.feelsLike, tempUnit);
      if (mode === "precip") return item.precipMm;
      if (mode === "wind") return Math.round(item.windGusts);
      return item.cloudCover;
    };

    const primaryVals = slice.map(getPrimaryVal);
    const secondaryVals = slice.map(getSecondaryVal);
    const allVals =
      mode === "temp" || mode === "wind"
        ? [...primaryVals, ...secondaryVals]
        : primaryVals;

    let minVal = Math.min(...allVals);
    let maxVal = Math.max(...allVals);
    if (mode === "precip") {
      minVal = 0;
      maxVal = 100;
    } else if (mode === "uv") {
      minVal = 0;
      maxVal = Math.max(11, maxVal);
    } else if (maxVal - minVal < 4) {
      maxVal += 2;
      minVal -= 2;
    }

    const getX = (i) =>
      padLeft + (slice.length > 1 ? (i / (slice.length - 1)) * usableW : usableW / 2);
    const getY = (val) =>
      padTop + usableH - ((val - minVal) / (maxVal - minVal || 1)) * usableH;

    const points = slice.map((item, i) => ({
      x: getX(i),
      y: getY(primaryVals[i]),
      y2: getY(secondaryVals[i]),
      val: primaryVals[i],
      val2: secondaryVals[i],
      item,
    }));

    const buildSmoothPath = (pts, yKey = "y") => {
      if (pts.length === 0) return "";
      if (pts.length === 1) return `M ${pts[0].x} ${pts[0][yKey]}`;
      let d = `M ${pts[0].x.toFixed(1)} ${pts[0][yKey].toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) / 6;

        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(
          1
        )} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2[yKey].toFixed(1)}`;
      }
      return d;
    };

    const linePath = buildSmoothPath(points, "y");
    const secondaryPath = buildSmoothPath(points, "y2");
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(
      1
    )} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

    return {
      width,
      height,
      points,
      linePath,
      secondaryPath,
      areaPath,
    };
  }, [slice, mode, tempUnit]);

  const activePoint =
    hoverIdx !== null && chartGeometry?.points?.[hoverIdx]
      ? chartGeometry.points[hoverIdx]
      : chartGeometry?.points?.[0];

  const modeColors = {
    temp: { stroke: "#38bdf8", stroke2: "#fbbf24", fill: "rgba(56, 189, 248, 0.24)" },
    precip: { stroke: "#0ea5e9", stroke2: "#6366f1", fill: "rgba(14, 165, 233, 0.28)" },
    wind: { stroke: "#2dd4bf", stroke2: "#f43f5e", fill: "rgba(45, 212, 191, 0.22)" },
    uv: { stroke: "#f59e0b", stroke2: "#a855f7", fill: "rgba(245, 158, 11, 0.25)" },
  };
  const currentPalette = modeColors[mode] || modeColors.temp;

  return (
    <section className="aether-card aether-hourly-section" aria-label="Hourly Forecast">
      <div className="aether-card-header hourly-header">
        <div className="hourly-title-group">
          <div className="aether-section-tag">
            <span className="tag-dot" /> HOUR-BY-HOUR WEATHER
          </div>
          <h3>
            {viewScope === "wholeday"
              ? `24-Hour Weather (${selectedDate || "Selected Date"})`
              : "Next 48 Hours Forecast"}
          </h3>
        </div>

        <div className="hourly-controls">
          <div className="aether-segmented-control" role="tablist">
            {[
              { id: "temp", label: "🌡️ Temperature" },
              { id: "precip", label: "🌧️ Rain Chance" },
              { id: "wind", label: "💨 Wind" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                className={mode === tab.id ? "is-active" : ""}
                onClick={() => setMode(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="aether-segmented-control horizon-toggle">
            <button
              type="button"
              className={viewScope === "wholeday" ? "is-active" : ""}
              onClick={() => setViewScope("wholeday")}
            >
              Full Day (24 Hours)
            </button>
            <button
              type="button"
              className={viewScope === "rolling48" ? "is-active" : ""}
              onClick={() => setViewScope("rolling48")}
            >
              Next 48 Hours
            </button>
          </div>
        </div>
      </div>

      {/* Live Hover Scrubber Readout */}
      {activePoint && (
        <div className="hourly-scrubber-banner">
          <div className="scrubber-time">
            <strong>{formatHourLabel(activePoint.item.time, activePoint.item.isNow)}</strong>
            <span>{activePoint.item.condition.label}</span>
          </div>
          <div className="scrubber-metrics">
            <span>
              🌡️ Temp: <strong>{formatTemp(activePoint.item.temp, tempUnit)}</strong> (Feels like{" "}
              {formatTemp(activePoint.item.feelsLike, tempUnit)})
            </span>
            <span>
              🌧️ Rain Chance: <strong>{activePoint.item.precipProb}%</strong>
            </span>
            <span>
              💨 Wind: <strong>{formatWind(activePoint.item.windSpeed, windUnit)}</strong>
            </span>
            <span>
              💧 Humidity: <strong>{activePoint.item.humidity}%</strong>
            </span>
          </div>
        </div>
      )}

      {/* Scrollable SVG Curve + Hourly Cards */}
      <div className="hourly-scroll-container">
        {chartGeometry && (
          <div
            className="hourly-chart-stage"
            style={{ width: `${chartGeometry.width}px` }}
          >
            <svg
              width={chartGeometry.width}
              height={chartGeometry.height}
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className="hourly-svg"
            >
              <defs>
                <linearGradient id={`hourlyAreaGrad-${mode}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={currentPalette.stroke} stopOpacity="0.38" />
                  <stop offset="100%" stopColor={currentPalette.stroke} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area under primary curve */}
              <path
                d={chartGeometry.areaPath}
                fill={`url(#hourlyAreaGrad-${mode})`}
              />

              {/* Secondary comparison curve (Feels Like or Wind Gusts) */}
              {(mode === "temp" || mode === "wind") && (
                <path
                  d={chartGeometry.secondaryPath}
                  fill="none"
                  stroke={currentPalette.stroke2}
                  strokeWidth="1.8"
                  strokeDasharray="5 4"
                  opacity="0.7"
                />
              )}

              {/* Primary spline curve */}
              <path
                d={chartGeometry.linePath}
                fill="none"
                stroke={currentPalette.stroke}
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Data points & labels */}
              {chartGeometry.points.map((pt, idx) => {
                const isHovered = hoverIdx === idx || (hoverIdx === null && idx === 0);
                return (
                  <g key={pt.item.time + idx}>
                    {isHovered && (
                      <line
                        x1={pt.x}
                        y1={12}
                        x2={pt.x}
                        y2={chartGeometry.height}
                        stroke="rgba(255,255,255,0.28)"
                        strokeDasharray="3 3"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5.5 : 3.2}
                      fill={isHovered ? "#ffffff" : currentPalette.stroke}
                      stroke={currentPalette.stroke}
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x}
                      y={pt.y - 11}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="11.5"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {mode === "temp"
                        ? `${pt.val}°`
                        : mode === "precip"
                        ? `${pt.val}%`
                        : mode === "wind"
                        ? `${pt.val}`
                        : `UV ${pt.val}`}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div
              className="hourly-cards-row"
              onMouseLeave={() => {
                setHoverIdx(null);
                if (onHoverHour) onHoverHour(null);
              }}
            >
              {slice.map((item, idx) => {
                const isSelected = hoverIdx === idx || (hoverIdx === null && idx === 0);
                return (
                  <div
                    key={item.time + idx}
                    className={`hourly-slot-card ${isSelected ? "is-selected" : ""}`}
                    onMouseEnter={() => {
                      setHoverIdx(idx);
                      if (onHoverHour) onHoverHour(item);
                    }}
                    onFocus={() => {
                      setHoverIdx(idx);
                      if (onHoverHour) onHoverHour(item);
                    }}
                    tabIndex={0}
                  >
                    <span className="slot-time">
                      {formatHourLabel(item.time, item.isNow)}
                    </span>
                    <div className="slot-icon">
                      <WeatherIcon type={item.condition.icon} size={32} />
                    </div>
                    <span className="slot-temp">
                      {formatTemp(item.temp, tempUnit)}
                    </span>
                    {mode === "wind" ? (
                      <span className="slot-sub wind-sub">
                        <span
                          className="wind-dir-arrow"
                          style={{
                            display: "inline-block",
                            transform: `rotate(${item.windDirection}deg)`,
                          }}
                        >
                          ↑
                        </span>{" "}
                        {getWindCardinal(item.windDirection)}
                      </span>
                    ) : mode === "uv" ? (
                      <span className="slot-sub uv-sub">
                        ☁ {item.cloudCover}%
                      </span>
                    ) : (
                      <span
                        className={`slot-sub ${
                          item.precipProb >= 30 ? "has-rain" : ""
                        }`}
                      >
                        💧 {item.precipProb}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="hourly-legend">
        {mode === "temp" && (
          <>
            <span>
              <i className="legend-line solid-blue" /> Temperature
            </span>
            <span>
              <i className="legend-line dashed-amber" /> Feels Like
            </span>
          </>
        )}
        {mode === "precip" && (
          <span>
            <i className="legend-line solid-sky" /> Chance of Rain (%)
          </span>
        )}
        {mode === "wind" && (
          <>
            <span>
              <i className="legend-line solid-teal" /> Wind Speed
            </span>
            <span>
              <i className="legend-line dashed-rose" /> Wind Gusts
            </span>
          </>
        )}
      </div>
    </section>
  );
}

