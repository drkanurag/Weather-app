import React, { useState, useEffect, useRef } from "react";
import {
  searchCities,
  reverseGeocode,
  detectIpLiveLocation,
  CURATED_LOCATION_DIRECTORY,
} from "../../services/weatherService";

export default function LocationGateModal({
  isOpen,
  canClose = false,
  onClose,
  onSelectLocation,
  currentLocation = null,
  liveTrackingActive = false,
  onToggleLiveTracking,
  gpsAccuracy = null,
  locationSource = "",
}) {
  const [activeTab, setActiveTab] = useState("live"); // 'live' | 'search' | 'map' | 'coords'
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Live GPS / Network state
  const [gpsStatus, setGpsStatus] = useState("idle"); // 'idle' | 'requesting' | 'success' | 'error'
  const [gpsMessage, setGpsMessage] = useState("");
  const [permissionState, setPermissionState] = useState("prompt"); // 'granted' | 'prompt' | 'denied'
  const [detectedPreview, setDetectedPreview] = useState(null);

  // Coordinate inputs
  const [latInput, setLatInput] = useState(
    currentLocation?.latitude ? String(currentLocation.latitude.toFixed(4)) : "13.3525"
  );
  const [lonInput, setLonInput] = useState(
    currentLocation?.longitude ? String(currentLocation.longitude.toFixed(4)) : "74.7928"
  );
  const [coordLoading, setCoordLoading] = useState(false);

  // Interactive Map Picker refs
  const mapBoxRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [mapPinLoc, setMapPinLoc] = useState(null);
  const [mapPinLoading, setMapPinLoading] = useState(false);

  // Query Browser Geolocation Permission API
  useEffect(() => {
    if (!isOpen) return;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((res) => {
          setPermissionState(res.state);
          res.onchange = () => setPermissionState(res.state);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Debounced city search
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const list = await searchCities(query);
      if (!cancelled) {
        setResults(list);
        setIsSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Initialize interactive Leaflet map when user opens the "Map Pin" tab
  useEffect(() => {
    if (!isOpen || activeTab !== "map") return;
    const L = window.L;
    if (!L || !mapBoxRef.current) return;

    const startLat = currentLocation?.latitude ?? 13.3525;
    const startLon = currentLocation?.longitude ?? 74.7928;

    if (!mapInstanceRef.current) {
      const map = L.map(mapBoxRef.current, {
        center: [startLat, startLon],
        zoom: currentLocation ? 9 : 5,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer(
        "https://{s}.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
        {
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
          maxZoom: 20,
        }
      ).addTo(map);

      const pinIcon = L.divIcon({
        className: "aether-location-pin-marker",
        html: `<div class="radar-pulse-ring"></div><div class="radar-core-dot"></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([startLat, startLon], { icon: pinIcon }).addTo(map);
      markerRef.current = marker;
      mapInstanceRef.current = map;

      // Initial pin details
      if (currentLocation) {
        setMapPinLoc(currentLocation);
      } else {
        reverseGeocode(startLat, startLon).then((loc) => setMapPinLoc(loc));
      }

      map.on("click", async (e) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        setMapPinLoading(true);
        const resolved = await reverseGeocode(lat, lng);
        setMapPinLoc({
          ...resolved,
          source: "Interactive Map Pin",
        });
        setMapPinLoading(false);
      });
    } else {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 80);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isOpen, activeTab, currentLocation]);

  if (!isOpen) return null;

  // Request Browser HTML5 Live GPS Location
  const handleGrantBrowserGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      setGpsMessage(
        "HTML5 Geolocation is not supported in this browser. Try Live Network Location or search your city."
      );
      return;
    }

    setGpsStatus("requesting");
    setGpsMessage(
      "Requesting live GPS coordinates from your device... Please click 'Allow' if prompted by your browser."
    );

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsMessage("Resolving your exact coordinates to local weather station...");
        const loc = await reverseGeocode(latitude, longitude);
        const enriched = {
          ...loc,
          accuracy: Math.round(accuracy || 0),
          source: "Live GPS Telemetry",
          isLiveGps: true,
        };
        setDetectedPreview(enriched);
        setGpsStatus("success");
        setGpsMessage(
          `Live GPS locked: ${enriched.name} (${latitude.toFixed(4)}°N, ${longitude.toFixed(
            4
          )}°E · ±${Math.round(accuracy || 15)}m)`
        );
        onSelectLocation(enriched);
      },
      async (err) => {
        if (err.code === 1) {
          // PERMISSION_DENIED
          setPermissionState("denied");
          setGpsStatus("error");
          setGpsMessage(
            "Browser location permission was denied. Allow location access in your browser's address bar, or click 'Use Live Network Location' below."
          );
        } else {
          // POSITION_UNAVAILABLE or TIMEOUT — automatically try Live IP Geolocation
          setGpsMessage(
            "Hardware GPS sensor timed out; switching to Live Network Geolocation..."
          );
          try {
            const netLoc = await detectIpLiveLocation();
            setDetectedPreview(netLoc);
            setGpsStatus("success");
            setGpsMessage(
              `Live Network Location detected: ${netLoc.name}, ${netLoc.country}`
            );
            onSelectLocation(netLoc);
          } catch (netErr) {
            setGpsStatus("error");
            setGpsMessage(
              "Could not acquire hardware GPS or network location. Please select your city or click on the map."
            );
          }
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Live Network / IP Location Detection
  const handleDetectNetworkLocation = async () => {
    setGpsStatus("requesting");
    setGpsMessage("Detecting your live location via network telemetry...");
    try {
      const netLoc = await detectIpLiveLocation();
      setDetectedPreview(netLoc);
      setGpsStatus("success");
      setGpsMessage(
        `Live Network Location locked: ${netLoc.name}, ${netLoc.admin1 || netLoc.country}`
      );
      onSelectLocation(netLoc);
    } catch (e) {
      setGpsStatus("error");
      setGpsMessage(
        "Network geolocation unavailable. Please search and select your city below."
      );
    }
  };

  // Handle exact coordinate submission
  const handleApplyCoordinates = async (e) => {
    e.preventDefault();
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setGpsStatus("error");
      setGpsMessage("Please enter a valid Latitude (-90 to 90) and Longitude (-180 to 180).");
      return;
    }
    setCoordLoading(true);
    const loc = await reverseGeocode(lat, lon);
    setCoordLoading(false);
    onSelectLocation({
      ...loc,
      source: "Custom Coordinates",
    });
  };

  return (
    <div className="aether-loc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose Your Location">
      <div className="aether-loc-modal glass-panel">
        {/* Top Modal Header */}
        <div className="loc-modal-header">
          <div className="loc-modal-brand">
            <span className="loc-modal-badge">
              <i className="live-dot" /> CHOOSE YOUR LOCATION
            </span>
            <h2>Where would you like to check the weather?</h2>
            <p>
              Allow <strong>Live Location Access</strong> to automatically detect where you are, or{" "}
              <strong>search and select any city</strong> around the world.
            </p>
          </div>
          {canClose && (
            <button
              type="button"
              className="loc-modal-close"
              onClick={onClose}
              aria-label="Close location selector"
              title="Keep current location"
            >
              ✕
            </button>
          )}
        </div>

        {/* Current Active Location Banner (if already selected) */}
        {currentLocation && (
          <div className="loc-active-status-bar">
            <div className="loc-active-info">
              <span className="loc-active-tag">CURRENT LOCATION</span>
              <strong>
                📍 {currentLocation.name}
                {currentLocation.admin1 ? `, ${currentLocation.admin1}` : ""}
                {currentLocation.country ? ` (${currentLocation.country})` : ""}
              </strong>
            </div>
            {onToggleLiveTracking && (
              <button
                type="button"
                className={`loc-watch-toggle ${liveTrackingActive ? "is-active" : ""}`}
                onClick={onToggleLiveTracking}
              >
                <span className="pulse-indicator" />
                {liveTrackingActive
                  ? "Auto-Update Location: ON"
                  : "Auto-Update My Location"}
              </button>
            )}
          </div>
        )}

        {/* Mode Switcher Tabs */}
        <div className="loc-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "live"}
            className={`loc-tab-btn ${activeTab === "live" ? "is-active" : ""}`}
            onClick={() => setActiveTab("live")}
          >
            📍 Use Live Location
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "search"}
            className={`loc-tab-btn ${activeTab === "search" ? "is-active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
            🔍 Search City
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "map"}
            className={`loc-tab-btn ${activeTab === "map" ? "is-active" : ""}`}
            onClick={() => setActiveTab("map")}
          >
            🗺️ Pick on Map
          </button>
        </div>

        {/* TAB 1: LIVE LOCATION ACCESS + QUICK CITY SELECTION */}
        {activeTab === "live" && (
          <div className="loc-tab-content">
            <div className="live-access-hero-grid">
              {/* Primary Browser GPS Permission Card */}
              <div className="live-access-card primary-gps-card">
                <div className="live-card-top">
                  <div className="live-radar-icon" aria-hidden="true">
                    <div className="radar-sweep" />
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                      <circle cx="12" cy="12" r="8" />
                    </svg>
                  </div>
                  <span className={`perm-status-pill perm-${permissionState}`}>
                    {permissionState === "granted"
                      ? "✓ Location Allowed"
                      : permissionState === "denied"
                      ? "⚠ Location Blocked"
                      : "● Ready"}
                  </span>
                </div>

                <h3>Use My Current Live Location</h3>
                <p>
                  Automatically find your current city and show live local weather for where you are right now.
                </p>

                <div className="live-card-actions">
                  <button
                    type="button"
                    className="grant-gps-primary-btn"
                    onClick={handleGrantBrowserGps}
                    disabled={gpsStatus === "requesting"}
                  >
                    {gpsStatus === "requesting"
                      ? "Finding Your Location..."
                      : "📍 Allow Live Location Access"}
                  </button>

                  <button
                    type="button"
                    className="grant-network-secondary-btn"
                    onClick={handleDetectNetworkLocation}
                    disabled={gpsStatus === "requesting"}
                  >
                    🌐 Detect My City Automatically
                  </button>
                </div>

                {gpsMessage && (
                  <div className={`gps-feedback-banner status-${gpsStatus}`}>
                    {gpsMessage}
                  </div>
                )}
              </div>

              {/* Instant Search + Quick Pick Side Panel */}
              <div className="live-access-card quick-search-card">
                <h3>Or Search &amp; Select Your Location</h3>
                <p>
                  Type any city, town, university campus, or airport to inspect its full-day weather:
                </p>

                <div className="modal-inline-search">
                  <input
                    type="text"
                    placeholder="Type city or place name (e.g., Manipal, Mumbai, London)..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      type="button"
                      className="modal-search-clear"
                      onClick={() => setQuery("")}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {query.trim().length >= 2 ? (
                  <div className="modal-search-results-list">
                    {isSearching ? (
                      <div className="modal-search-empty">
                        Scanning global stations...
                      </div>
                    ) : results.length === 0 ? (
                      <div className="modal-search-empty">
                        No locations found for &ldquo;{query}&rdquo;.
                      </div>
                    ) : (
                      results.slice(0, 6).map((item, i) => (
                        <button
                          key={item.id + i}
                          type="button"
                          className="modal-search-result-btn"
                          onClick={() =>
                            onSelectLocation({
                              ...item,
                              source: "User Selected Location",
                            })
                          }
                        >
                          <div className="res-left">
                            <span className="res-cc">{item.countryCode || "GL"}</span>
                            <div>
                              <strong>{item.name}</strong>
                              <span>
                                {[item.admin1, item.country].filter(Boolean).join(", ")}
                              </span>
                            </div>
                          </div>
                          <span className="res-coords">
                            {item.latitude.toFixed(2)}°, {item.longitude.toFixed(2)}°
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="curated-regions-wrap">
                    {Object.entries(CURATED_LOCATION_DIRECTORY).map(
                      ([groupName, cities]) => (
                        <div key={groupName} className="curated-group">
                          <span className="curated-group-label">{groupName}</span>
                          <div className="curated-chips">
                            {cities.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className="curated-city-chip"
                                onClick={() =>
                                  onSelectLocation({
                                    ...c,
                                    source: "User Selected Location",
                                  })
                                }
                              >
                                <span className="chip-cc">{c.countryCode}</span>
                                <span>{c.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEDICATED GLOBAL LOCATION SEARCH */}
        {activeTab === "search" && (
          <div className="loc-tab-content">
            <div className="dedicated-search-box">
              <div className="modal-inline-search large">
                <input
                  type="text"
                  autoFocus
                  placeholder="Search any city, town, district, postal code, or 'lat, lon'..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    className="modal-search-clear"
                    onClick={() => setQuery("")}
                  >
                    ✕
                  </button>
                )}
              </div>

              {query.trim().length >= 2 ? (
                <div className="modal-search-results-list expanded">
                  {isSearching ? (
                    <div className="modal-search-empty">
                      Searching global meteorological directory...
                    </div>
                  ) : results.length === 0 ? (
                    <div className="modal-search-empty">
                      No matching stations found for &ldquo;{query}&rdquo;. Try another spelling or pick on the map.
                    </div>
                  ) : (
                    results.map((item, i) => (
                      <button
                        key={item.id + i}
                        type="button"
                        className="modal-search-result-btn"
                        onClick={() =>
                          onSelectLocation({
                            ...item,
                            source: "User Selected Location",
                          })
                        }
                      >
                        <div className="res-left">
                          <span className="res-cc">{item.countryCode || "GL"}</span>
                          <div>
                            <strong>{item.name}</strong>
                            <span>
                              {[item.admin1, item.country].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        </div>
                        <div className="res-right-meta">
                          <span className="res-coords">
                            {item.latitude.toFixed(3)}°N, {item.longitude.toFixed(3)}°E
                          </span>
                          {item.elevation ? (
                            <span className="res-elev">{item.elevation}m ASL</span>
                          ) : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="curated-regions-wrap expanded">
                  {Object.entries(CURATED_LOCATION_DIRECTORY).map(
                    ([groupName, cities]) => (
                      <div key={groupName} className="curated-group">
                        <span className="curated-group-label">{groupName}</span>
                        <div className="curated-chips">
                          {cities.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="curated-city-chip"
                              onClick={() =>
                                onSelectLocation({
                                  ...c,
                                  source: "User Selected Location",
                                })
                              }
                            >
                              <span className="chip-cc">{c.countryCode}</span>
                              <span>{c.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: INTERACTIVE WORLD MAP PIN PICKER */}
        {activeTab === "map" && (
          <div className="loc-tab-content">
            <div className="loc-map-picker-wrap">
              <div className="loc-map-instructions">
                <span>
                  Click anywhere on the interactive map to drop a weather station pin at your exact location:
                </span>
                {mapPinLoc && (
                  <button
                    type="button"
                    className="confirm-map-pin-btn"
                    disabled={mapPinLoading}
                    onClick={() =>
                      onSelectLocation({
                        ...mapPinLoc,
                        source: "Interactive Map Selection",
                      })
                    }
                  >
                    {mapPinLoading
                      ? "Resolving place..."
                      : `✓ Confirm ${mapPinLoc.name} (${mapPinLoc.latitude.toFixed(
                          2
                        )}°, ${mapPinLoc.longitude.toFixed(2)}°)`}
                  </button>
                )}
              </div>
              <div ref={mapBoxRef} className="loc-picker-leaflet-canvas" />
            </div>
          </div>
        )}

        {/* TAB 4: EXACT LATITUDE & LONGITUDE COORDINATES */}
        {activeTab === "coords" && (
          <div className="loc-tab-content">
            <form className="loc-coords-form" onSubmit={handleApplyCoordinates}>
              <p className="coords-helper">
                Enter exact geographical coordinates (decimal degrees) to lock onto any land, ocean, or mountain station on Earth:
              </p>
              <div className="coords-inputs-row">
                <label className="coord-field">
                  <span>Latitude (-90° to +90°)</span>
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    placeholder="e.g. 13.3525"
                    required
                  />
                </label>
                <label className="coord-field">
                  <span>Longitude (-180° to +180°)</span>
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={lonInput}
                    onChange={(e) => setLonInput(e.target.value)}
                    placeholder="e.g. 74.7928"
                    required
                  />
                </label>
              </div>
              <button
                type="submit"
                className="grant-gps-primary-btn"
                disabled={coordLoading}
              >
                {coordLoading
                  ? "Resolving Coordinates..."
                  : "🧭 Lock Weather Telemetry to Coordinates"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
