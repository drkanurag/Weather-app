import React, { useEffect, useRef, useState } from "react";
import { formatTemp, formatWind } from "../../services/weatherService";

/**
 * Combined Open-Source & Google Maps Tile Providers (Zero API Key Required):
 * 1. OpenStreetMap (OSM) — Open-source community street & city map
 * 2. OpenTopoMap — Open-source topographic & elevation map
 * 3. CARTO Dark Matter — Open-source high-contrast dark radar basemap
 * 4. Google Hybrid Satellite — Satellite + street labels
 * 5. Google Road Map — Detailed street & landmark map
 */
const MAP_TILE_STYLES = {
  osm: {
    id: "osm",
    label: "🌍 OpenStreetMap",
    provider: "OpenStreetMap (Open Source)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    embedType: "m",
  },
  hybrid: {
    id: "hybrid",
    label: "🛰️ Google Hybrid",
    provider: "Google Maps Hybrid",
    url: "https://{s}.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    embedType: "h",
  },
  roadmap: {
    id: "roadmap",
    label: "🗺️ Google Road",
    provider: "Google Maps Road",
    url: "https://{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    embedType: "m",
  },
  opentopo: {
    id: "opentopo",
    label: "⛰️ OpenTopoMap",
    provider: "OpenTopoMap (Open Source)",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    embedType: "p",
  },
  dark: {
    id: "dark",
    label: "🌑 Dark Radar",
    provider: "CARTO Open Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: ["a", "b", "c", "d"],
    embedType: "k",
  },
};

export default function WeatherMap({
  location,
  current,
  tempUnit = "C",
  windUnit = "km/h",
  onInspectCoordinates,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseTileLayerRef = useRef(null);
  const markerRef = useRef(null);
  const radarLayerRef = useRef(null);

  // Active tile style: 'osm' | 'hybrid' | 'roadmap' | 'opentopo' | 'dark'
  const [mapStyle, setMapStyle] = useState("hybrid");
  // Active engine mode: 'interactive' (Leaflet + OpenStreetMap/Google + RainViewer Radar) | 'windy' (Windy.com Open Weather Map) | 'gmaps' (Google Maps Embed)
  const [mapEngineMode, setMapEngineMode] = useState("interactive");

  const [radarFrames, setRadarFrames] = useState([]);
  const [satFrames, setSatFrames] = useState([]);
  const [radarHost, setRadarHost] = useState("https://tilecache.rainviewer.com");
  const [frameIdx, setFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [overlayType, setOverlayType] = useState("radar"); // 'radar' | 'satellite' | 'none'
  const [radarOpacity, setRadarOpacity] = useState(0.72);

  // Fetch live global radar & satellite timestamps from RainViewer Open Weather API
  useEffect(() => {
    let mounted = true;
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted || !data) return;
        if (data.host) setRadarHost(data.host);
        const past = data.radar?.past || [];
        const nowcast = data.radar?.nowcast || [];
        const combined = [...past, ...nowcast];
        setRadarFrames(combined);
        if (combined.length > 0) {
          setFrameIdx(Math.max(0, past.length - 1));
        }
        if (data.satellite?.infrared) {
          setSatFrames(data.satellite.infrared);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize Interactive Leaflet Map Engine (OpenStreetMap + Google Maps + RainViewer)
  useEffect(() => {
    if (mapEngineMode !== "interactive") return;
    const L = window.L;
    if (!L || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [location?.latitude || 12.9716, location?.longitude || 77.5946],
        zoom: 8,
        zoomControl: true,
        attributionControl: false,
      });

      const styleCfg = MAP_TILE_STYLES[mapStyle] || MAP_TILE_STYLES.osm;
      baseTileLayerRef.current = L.tileLayer(styleCfg.url, {
        subdomains: styleCfg.subdomains,
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (e) => {
        if (onInspectCoordinates && e.latlng) {
          onInspectCoordinates(e.latlng.lat, e.latlng.lng);
        }
      });

      mapInstanceRef.current = map;

      // Ensure map container dimensions are recalculated after layout
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 120);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        baseTileLayerRef.current = null;
        markerRef.current = null;
        radarLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEngineMode]);

  // Switch Base Map Tile Layer (OpenStreetMap, Google Hybrid, Google Road, OpenTopoMap, Dark)
  useEffect(() => {
    if (mapEngineMode !== "interactive") return;
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    const styleCfg = MAP_TILE_STYLES[mapStyle] || MAP_TILE_STYLES.osm;
    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
    }
    baseTileLayerRef.current = L.tileLayer(styleCfg.url, {
      subdomains: styleCfg.subdomains,
      maxZoom: 19,
      zIndex: 1,
    }).addTo(map);
  }, [mapStyle, mapEngineMode]);

  // Fly to selected city & update pulsing weather pin
  useEffect(() => {
    if (mapEngineMode !== "interactive") return;
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map || !location) return;

    const { latitude, longitude, name, country } = location;
    map.invalidateSize();
    map.flyTo([latitude, longitude], Math.max(map.getZoom(), 8), {
      duration: 1.2,
    });

    if (markerRef.current) {
      markerRef.current.remove();
    }

    const customIcon = L.divIcon({
      className: "aether-map-pin-wrapper",
      html: `
        <div class="aether-map-pin">
          <span class="pin-pulse"></span>
          <span class="pin-core"></span>
          <div class="pin-badge">
            <strong>${name}</strong>
            <span>${formatTemp(current?.temp, tempUnit)} • ${
        current?.condition?.shortLabel || ""
      }</span>
          </div>
        </div>
      `,
      iconSize: [140, 46],
      iconAnchor: [70, 23],
    });

    markerRef.current = L.marker([latitude, longitude], {
      icon: customIcon,
    })
      .addTo(map)
      .bindPopup(
        `<div style="font-family: Inter, sans-serif; color: #0f172a; padding: 2px;">
          <strong>${name}${country ? `, ${country}` : ""}</strong><br/>
          Temp: <b>${formatTemp(current?.temp, tempUnit)}</b> (${
          current?.condition?.label || ""
        })<br/>
          Wind: <b>${formatWind(current?.windSpeed, windUnit)}</b> • Humidity: <b>${
          current?.humidity ?? "--"
        }%</b>
        </div>`
      );
  }, [location, current, tempUnit, windUnit, mapEngineMode]);

  // Update RainViewer Open Radar / Satellite Tile Layer
  useEffect(() => {
    if (mapEngineMode !== "interactive") return;
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    if (radarLayerRef.current) {
      map.removeLayer(radarLayerRef.current);
      radarLayerRef.current = null;
    }

    if (overlayType === "none") return;

    const frames = overlayType === "satellite" ? satFrames : radarFrames;
    const activeFrame = frames[Math.min(frameIdx, Math.max(0, frames.length - 1))];
    if (!activeFrame || !activeFrame.path) return;

    const tileUrl =
      overlayType === "satellite"
        ? `${radarHost}${activeFrame.path}/256/{z}/{x}/{y}/0/0_0.png`
        : `${radarHost}${activeFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;

    radarLayerRef.current = L.tileLayer(tileUrl, {
      opacity: radarOpacity,
      zIndex: 10,
    }).addTo(map);
  }, [
    overlayType,
    frameIdx,
    radarFrames,
    satFrames,
    radarHost,
    radarOpacity,
    mapEngineMode,
  ]);

  // Radar animation loop
  useEffect(() => {
    if (!isPlaying || mapEngineMode !== "interactive") return;
    const frames = overlayType === "satellite" ? satFrames : radarFrames;
    if (frames.length <= 1) return;

    const interval = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % frames.length);
    }, 650);

    return () => clearInterval(interval);
  }, [isPlaying, overlayType, radarFrames, satFrames, mapEngineMode]);

  const activeFrames = overlayType === "satellite" ? satFrames : radarFrames;
  const currentFrameObj =
    activeFrames[Math.min(frameIdx, Math.max(0, activeFrames.length - 1))];

  const formatFrameTimestamp = (unixSec) => {
    if (!unixSec) return "Live Feed";
    const d = new Date(unixSec * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const lat = location?.latitude ?? 12.9716;
  const lon = location?.longitude ?? 77.5946;
  const embedMapType = MAP_TILE_STYLES[mapStyle]?.embedType || "h";
  const googleMapsEmbedUrl = `https://maps.google.com/maps?q=${lat},${lon}&t=${embedMapType}&z=11&ie=UTF8&iwloc=&output=embed`;
  const windyEmbedUrl = `https://embed.windy.com/embed2.html?lat=${lat.toFixed(
    3
  )}&lon=${lon.toFixed(3)}&detailLat=${lat.toFixed(3)}&detailLon=${lon.toFixed(
    3
  )}&zoom=7&level=surface&overlay=wind&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=${
    windUnit === "mph" ? "mph" : "km%2Fh"
  }&metricTemp=%C2%B0${tempUnit}`;
  const openStreetMapExternalUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=11/${lat}/${lon}`;
  const googleMapsExternalUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

  return (
    <section
      className="aether-card aether-radar-section"
      aria-label="Live Weather & Radar Map"
    >
      <div className="aether-card-header radar-header">
        <div>
          <div className="aether-section-tag">
            <span className="tag-dot live-pulse" /> OPEN-SOURCE &amp; GOOGLE WEATHER MAP
          </div>
          <h3>Live Rain, Wind &amp; Cloud Map</h3>
        </div>

        <div className="radar-layer-pills">
          {[
            { id: "radar", label: "🌧️ Rain Radar" },
            { id: "satellite", label: "☁️ Clouds" },
            { id: "none", label: "🗺️ Map Only" },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              className={
                mapEngineMode === "interactive" && overlayType === btn.id
                  ? "is-active"
                  : ""
              }
              onClick={() => {
                setMapEngineMode("interactive");
                setOverlayType(btn.id);
                setFrameIdx(0);
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* OPEN-SOURCE & GOOGLE MAPS LAYER SWITCHER */}
      <div className="gmaps-controls-subbar">
        <div className="gmaps-style-pills">
          {Object.values(MAP_TILE_STYLES).map((st) => (
            <button
              key={st.id}
              type="button"
              className={`gmaps-style-btn ${
                mapEngineMode === "interactive" && mapStyle === st.id
                  ? "is-active"
                  : ""
              }`}
              onClick={() => {
                setMapEngineMode("interactive");
                setMapStyle(st.id);
              }}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="gmaps-mode-actions">
          <button
            type="button"
            className={`gmaps-mode-btn ${
              mapEngineMode === "windy" ? "is-active" : ""
            }`}
            onClick={() =>
              setMapEngineMode((m) => (m === "windy" ? "interactive" : "windy"))
            }
            title="Live animated wind & rain map powered by Windy.com"
          >
            {mapEngineMode === "windy" ? "⚡ Back to Radar Pin" : "🌬️ Live Wind Map"}
          </button>

          <button
            type="button"
            className={`gmaps-mode-btn ${
              mapEngineMode === "gmaps" ? "is-active" : ""
            }`}
            onClick={() =>
              setMapEngineMode((m) => (m === "gmaps" ? "interactive" : "gmaps"))
            }
            title="Switch to embedded Google Maps view"
          >
            {mapEngineMode === "gmaps" ? "⚡ Back to Radar Pin" : "📍 Google Embed"}
          </button>

          <a
            href={openStreetMapExternalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gmaps-open-link"
            title="Open in OpenStreetMap"
          >
            OSM ↗
          </a>

          <a
            href={googleMapsExternalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gmaps-open-link"
            title="Open in Google Maps"
          >
            Google Maps ↗
          </a>
        </div>
      </div>

      <div className="aether-map-viewport">
        {mapEngineMode === "interactive" ? (
          <>
            <div ref={mapContainerRef} className="aether-leaflet-canvas" />
            <div className="map-floating-coords">
              <span>
                📍 <strong>{location?.name || "Selected Location"}</strong> (
                {lat.toFixed(3)}°, {lon.toFixed(3)}°) •{" "}
                {MAP_TILE_STYLES[mapStyle]?.provider}
              </span>
              <span className="map-click-tip">
                💡 Click any place on the map to check its live weather
              </span>
            </div>
          </>
        ) : mapEngineMode === "windy" ? (
          <div className="gmaps-iframe-wrapper">
            <iframe
              title={`Live Wind & Weather Map - ${location?.name || "Location"}`}
              src={windyEmbedUrl}
              className="aether-gmaps-iframe"
              loading="lazy"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="gmaps-iframe-wrapper">
            <iframe
              title={`Google Maps - ${location?.name || "Weather Location"}`}
              src={googleMapsEmbedUrl}
              className="aether-gmaps-iframe"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        )}
      </div>

      {/* Radar Playback Controls & dBZ Legend */}
      {mapEngineMode === "interactive" &&
        overlayType !== "none" &&
        activeFrames.length > 0 && (
          <div className="radar-timeline-bar">
            <button
              type="button"
              className="radar-play-btn"
              onClick={() => setIsPlaying((p) => !p)}
            >
              {isPlaying ? "⏸ Pause" : "▶ Animate"}
            </button>

            <div className="radar-scrubber-wrap">
              <input
                type="range"
                min={0}
                max={Math.max(0, activeFrames.length - 1)}
                value={Math.min(frameIdx, Math.max(0, activeFrames.length - 1))}
                onChange={(e) => {
                  setIsPlaying(false);
                  setFrameIdx(Number(e.target.value));
                }}
                aria-label="Radar timeline scrubber"
              />
              <span className="radar-frame-time">
                {formatFrameTimestamp(currentFrameObj?.time)}
              </span>
            </div>

            <div className="radar-opacity-wrap">
              <span>Layer</span>
              <input
                type="range"
                min="0.2"
                max="0.95"
                step="0.05"
                value={radarOpacity}
                onChange={(e) => setRadarOpacity(Number(e.target.value))}
                aria-label="Radar layer opacity"
              />
            </div>

            <div
              className="radar-dbz-scale"
              title="Radar reflectivity scale (Light to Extreme)"
            >
              <span>Light</span>
              <i className="dbz-gradient" />
              <span>Severe</span>
            </div>
          </div>
        )}
    </section>
  );
}
