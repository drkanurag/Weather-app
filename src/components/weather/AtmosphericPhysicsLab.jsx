import React, { useEffect, useState, useMemo } from "react";
import { convertTempValue, formatTemp } from "../../services/weatherService";

// Client-side psychrometric fallback if running without Python backend
function computeClientPhysics(current, elevation = 0) {
  const t = Number(current?.temp ?? 22);
  const rh = Math.max(1, Math.min(100, Number(current?.humidity ?? 55)));
  const p = Number(current?.pressureMsl ?? 1013.25);
  const vMs = Math.max(0.1, Number(current?.windSpeed ?? 10) / 3.6);
  const rad = Math.max(0, Number(current?.solarRadiation ?? 200));

  const esKpa = 0.61078 * Math.exp((17.27 * t) / (t + 237.3));
  const eaKpa = esKpa * (rh / 100);
  const vpdKpa = Math.max(0, esKpa - eaKpa);

  const wetBulbC =
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(t + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;

  const globeTempC = t + (0.014 * rad) / (Math.pow(vMs, 0.4) + 0.5);
  const wbgtC = 0.7 * wetBulbC + 0.2 * globeTempC + 0.1 * t;

  let wbgtRisk = { level: "Low Stress", color: "#10b981" };
  if (wbgtC >= 31) wbgtRisk = { level: "Extreme Danger", color: "#ef4444" };
  else if (wbgtC >= 28) wbgtRisk = { level: "Very High Risk", color: "#f97316" };
  else if (wbgtC >= 25) wbgtRisk = { level: "High Thermal Load", color: "#eab308" };
  else if (wbgtC >= 21) wbgtRisk = { level: "Moderate Caution", color: "#38bdf8" };

  const dewC = Number(current?.dewPoint ?? t - (100 - rh) / 5);
  const lclMeters = Math.max(80, Math.round(125 * Math.max(0, t - dewC)));

  const pPa = p * 100;
  const eaPa = eaKpa * 1000;
  const tK = t + 273.15;
  const airDensity = (pPa - eaPa) / (287.058 * tK) + eaPa / (461.495 * tK);

  const isaTemp = 15 - 0.0065 * elevation;
  const pressureAltFt = elevation * 3.28084 + (1013.25 - p) * 27.3;
  const densityAltFt = Math.round(pressureAltFt + 118.8 * (t - isaTemp));
  const mixingRatio = 621.97 * (eaKpa / Math.max(1, p / 10 - eaKpa));
  const thetaK = tK * Math.pow(1000 / Math.max(200, p), 0.2854);
  const thetaEK = thetaK * Math.exp((2.5 * mixingRatio) / Math.max(200, tK));

  return {
    wetBulbC: Number(wetBulbC.toFixed(1)),
    wbgtC: Number(wbgtC.toFixed(1)),
    wbgtRisk,
    vpdKpa: Number(vpdKpa.toFixed(2)),
    esKpa: Number(esKpa.toFixed(2)),
    eaKpa: Number(eaKpa.toFixed(2)),
    lclMeters,
    airDensityKgM3: Number(airDensity.toFixed(3)),
    densityAltitudeFt: densityAltFt,
    mixingRatioGKg: Number(mixingRatio.toFixed(1)),
    thetaEKelvin: Number(thetaEK.toFixed(1)),
    engine: "Scientific Psychrometric Kernel",
  };
}

export default function AtmosphericPhysicsLab({ weather, tempUnit = "C" }) {
  const [physics, setPhysics] = useState(null);
  const [ensemble, setEnsemble] = useState(null);

  const location = weather?.location;
  const current = weather?.current;

  // 1. Fetch Python Scientific Psychrometrics (/api/physics with instant client fallback)
  useEffect(() => {
    if (!current || !location) return;
    let active = true;
    const params = new URLSearchParams({
      temp: current.temp,
      humidity: current.humidity,
      pressure: current.pressureMsl,
      wind: current.windSpeed,
      solar: current.solarRadiation || 0,
      elevation: location.elevation || 0,
    });

    fetch(`/api/physics?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("Fallback to client kernel");
        return r.json();
      })
      .then((data) => {
        if (active && data && data.wetBulbC !== undefined) {
          setPhysics(data);
        }
      })
      .catch(() => {
        if (active) {
          setPhysics(computeClientPhysics(current, location.elevation));
        }
      });

    return () => {
      active = false;
    };
  }, [current, location]);

  // 2. Fetch Multi-Model NWP Ensemble Comparison (ECMWF IFS vs NOAA GFS vs DWD ICON)
  useEffect(() => {
    if (!location) return;
    let active = true;
    const { latitude, longitude } = location;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&hourly=temperature_2m&models=ecmwf_ifs025,gfs_seamless,icon_seamless&forecast_days=2&timezone=auto`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!active || !data?.hourly) return;
        const times = (data.hourly.time || []).slice(0, 24);
        const ecmwf = (
          data.hourly.temperature_2m_ecmwf_ifs025 ||
          data.hourly.temperature_2m ||
          []
        ).slice(0, 24);
        const gfs = (
          data.hourly.temperature_2m_gfs_seamless ||
          data.hourly.temperature_2m ||
          []
        ).slice(0, 24);
        const icon = (
          data.hourly.temperature_2m_icon_seamless ||
          data.hourly.temperature_2m ||
          []
        ).slice(0, 24);

        if (times.length > 0 && ecmwf.length > 0) {
          // Compute mean spread across models
          let totalSpread = 0;
          let validCount = 0;
          for (let i = 0; i < times.length; i++) {
            const vals = [ecmwf[i], gfs[i], icon[i]].filter(
              (v) => v !== null && v !== undefined && !Number.isNaN(v)
            );
            if (vals.length >= 2) {
              totalSpread += Math.max(...vals) - Math.min(...vals);
              validCount += 1;
            }
          }
          const avgSpread = validCount > 0 ? totalSpread / validCount : 0.8;
          const confidence = Math.max(
            68,
            Math.min(99, Math.round(100 - avgSpread * 6.5))
          );

          setEnsemble({
            times,
            ecmwf,
            gfs,
            icon,
            avgSpread: Number(avgSpread.toFixed(1)),
            confidence,
          });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [location]);

  const activePhysics = useMemo(
    () => physics || computeClientPhysics(current, location?.elevation),
    [physics, current, location]
  );

  // Build SVG paths for the 3 NWP models
  const ensembleChart = useMemo(() => {
    if (!ensemble || !ensemble.times.length) return null;
    const w = 640;
    const h = 150;
    const padX = 24;
    const padY = 22;
    const uw = w - padX * 2;
    const uh = h - padY * 2;

    const conv = (arr) =>
      arr.map((v) => convertTempValue(v ?? current?.temp ?? 20, tempUnit));
    const eVals = conv(ensemble.ecmwf);
    const gVals = conv(ensemble.gfs);
    const iVals = conv(ensemble.icon);

    const all = [...eVals, ...gVals, ...iVals];
    let minV = Math.min(...all) - 1;
    let maxV = Math.max(...all) + 1;
    if (maxV - minV < 4) maxV = minV + 4;

    const toPath = (vals) =>
      vals
        .map((v, idx) => {
          const x = padX + (idx / Math.max(1, vals.length - 1)) * uw;
          const y = padY + uh - ((v - minV) / (maxV - minV)) * uh;
          return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");

    return {
      w,
      h,
      minV,
      maxV,
      ecmwfPath: toPath(eVals),
      gfsPath: toPath(gVals),
      iconPath: toPath(iVals),
      eNow: eVals[0],
      gNow: gVals[0],
      iNow: iVals[0],
    };
  }, [ensemble, tempUnit, current]);

  // Export Telemetry to CSV or JSON
  const handleExport = (format = "json") => {
    if (!weather) return;
    const slug = (weather.location.name || "station")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

    if (format === "json") {
      const payload = JSON.stringify(
        {
          exportedBy: "AETHER Global Atmospheric Intelligence Platform",
          exportedAt: new Date().toISOString(),
          thermodynamics: activePhysics,
          ensembleConfidence: ensemble
            ? {
                confidencePct: ensemble.confidence,
                meanSpreadC: ensemble.avgSpread,
              }
            : null,
          ...weather,
        },
        null,
        2
      );
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aether-telemetry-${slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = [
        "Time_ISO",
        "Temp_C",
        "FeelsLike_C",
        "Humidity_Pct",
        "DewPoint_C",
        "PrecipProb_Pct",
        "Precip_mm",
        "WindSpeed_kmh",
        "WindGusts_kmh",
        "WindDir_deg",
        "Pressure_hPa",
        "CloudCover_Pct",
        "UV_Index",
      ];
      const rows = (weather.hourly || []).map((h) =>
        [
          h.time,
          h.temp,
          h.feelsLike,
          h.humidity,
          h.dewPoint,
          h.precipProb,
          h.precipMm,
          h.windSpeed,
          h.windGusts,
          h.windDirection,
          h.pressure,
          h.cloudCover,
          h.uvIndex,
        ].join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aether-48h-hourly-${slug}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (!weather) return null;

  return (
    <section
      className="aether-card aether-physics-lab"
      aria-label="Scientific Atmospheric Thermodynamics & Multi-Model NWP Ensemble Lab"
    >
      <div className="aether-card-header">
        <div>
          <div className="aether-section-tag">
            <span className="tag-dot live-pulse" /> {activePhysics.engine} •
            SUPERCOMPUTER ENSEMBLE
          </div>
          <h3>
            Atmospheric Thermodynamics, Psychrometrics & NWP Model Convergence
          </h3>
        </div>

        <div className="physics-export-actions">
          <button
            type="button"
            className="aether-ctrl-btn"
            onClick={() => handleExport("csv")}
            title="Download 48-hour station telemetry as CSV"
          >
            ⬇ Export CSV
          </button>
          <button
            type="button"
            className="aether-ctrl-btn"
            onClick={() => handleExport("json")}
            title="Download complete meteorological & thermodynamic report as JSON"
          >
            ⬇ Export JSON
          </button>
        </div>
      </div>

      <div className="physics-lab-grid">
        {/* LEFT: 6 SCIENTIFIC PSYCHROMETRIC & AVIATION THERMODYNAMIC READOUTS */}
        <div className="psychrometric-cards-grid">
          <div className="psychro-cell">
            <span className="psychro-label">WET-BULB TEMP (Tw)</span>
            <strong className="psychro-val">
              {formatTemp(activePhysics.wetBulbC, tempUnit)}
            </strong>
            <small>Evaporative cooling threshold (Stull 2011)</small>
          </div>

          <div className="psychro-cell">
            <span className="psychro-label">ISO WBGT HEAT STRESS</span>
            <strong
              className="psychro-val"
              style={{ color: activePhysics.wbgtRisk?.color }}
            >
              {formatTemp(activePhysics.wbgtC, tempUnit)}
            </strong>
            <small>{activePhysics.wbgtRisk?.level} (Solar + Humidity load)</small>
          </div>

          <div className="psychro-cell">
            <span className="psychro-label">VAPOR PRESSURE DEFICIT</span>
            <strong className="psychro-val">{activePhysics.vpdKpa} kPa</strong>
            <small>
              es: {activePhysics.esKpa} kPa • ea: {activePhysics.eaKpa} kPa
            </small>
          </div>

          <div className="psychro-cell">
            <span className="psychro-label">CUMULUS CLOUD BASE (LCL)</span>
            <strong className="psychro-val">{activePhysics.lclMeters} m</strong>
            <small>Lifted Condensation Level above ground</small>
          </div>

          <div className="psychro-cell">
            <span className="psychro-label">AVIATION DENSITY ALTITUDE</span>
            <strong className="psychro-val">
              {activePhysics.densityAltitudeFt.toLocaleString()} ft
            </strong>
            <small>Moist Air Density: {activePhysics.airDensityKgM3} kg/m³</small>
          </div>

          <div className="psychro-cell">
            <span className="psychro-label">EQUIVALENT POTENTIAL (θe)</span>
            <strong className="psychro-val">{activePhysics.thetaEKelvin} K</strong>
            <small>Mixing Ratio: {activePhysics.mixingRatioGKg} g/kg</small>
          </div>
        </div>

        {/* RIGHT: MULTI-MODEL SUPERCOMPUTER ENSEMBLE CONVERGENCE (ECMWF vs GFS vs ICON) */}
        <div className="ensemble-convergence-box">
          <div className="ensemble-box-top">
            <div>
              <strong>24H Multi-Model Supercomputer Convergence</strong>
              <span>ECMWF IFS (EU) vs NOAA GFS (US) vs DWD ICON (DE)</span>
            </div>
            {ensemble && (
              <div className="ensemble-confidence-badge">
                <span>Ensemble Confidence</span>
                <strong>
                  {ensemble.confidence}% (±{ensemble.avgSpread}°C spread)
                </strong>
              </div>
            )}
          </div>

          {ensembleChart ? (
            <div className="ensemble-svg-wrap">
              <svg
                width="100%"
                height="150"
                viewBox={`0 0 ${ensembleChart.w} ${ensembleChart.h}`}
              >
                <line
                  x1="24"
                  y1="30"
                  x2={ensembleChart.w - 24}
                  y2="30"
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="3 3"
                />
                <line
                  x1="24"
                  y1="75"
                  x2={ensembleChart.w - 24}
                  y2="75"
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="3 3"
                />
                <line
                  x1="24"
                  y1="120"
                  x2={ensembleChart.w - 24}
                  y2="120"
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="3 3"
                />

                {/* DWD ICON */}
                <path
                  d={ensembleChart.iconPath}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="2.2"
                  opacity="0.85"
                />
                {/* NOAA GFS */}
                <path
                  d={ensembleChart.gfsPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.2"
                  strokeDasharray="5 3"
                  opacity="0.9"
                />
                {/* ECMWF IFS */}
                <path
                  d={ensembleChart.ecmwfPath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.8"
                />
              </svg>

              <div className="ensemble-legend-row">
                <span>
                  <i style={{ background: "#38bdf8" }} /> ECMWF IFS (Now:{" "}
                  {ensembleChart.eNow}°)
                </span>
                <span>
                  <i style={{ background: "#10b981" }} /> NOAA GFS (Now:{" "}
                  {ensembleChart.gNow}°)
                </span>
                <span>
                  <i style={{ background: "#a855f7" }} /> DWD ICON (Now:{" "}
                  {ensembleChart.iNow}°)
                </span>
              </div>
            </div>
          ) : (
            <div className="ensemble-loading">
              Synchronizing ECMWF, NOAA GFS, and DWD ICON ensemble members...
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

