import React, { useEffect, useState, useCallback, useRef } from "react";
import Search from "../search";
import WeatherCanvas from "./WeatherCanvas";
import { WeatherIcon } from "./WeatherIcons";
import HourlyForecast from "./HourlyForecast";
import DailyForecast from "./DailyForecast";
import MetricsGrid from "./MetricsGrid";
import WeatherMap from "./WeatherMap";
import SmartAdvisor from "./SmartAdvisor";
import WholeDayExplorer from "./WholeDayExplorer";
import LocationGateModal from "./LocationGateModal";
import {
  DEFAULT_FAVORITE_CITIES,
  fetchCompleteWeather,
  fetchSpecificDateWeather,
  fetchQuickCitySummaries,
  reverseGeocode,
  detectIpLiveLocation,
  formatTemp,
  formatWind,
  getAqiMeta,
  getUvMeta,
} from "../../services/weatherService";
import { soundEngine } from "../../services/soundEngine";
import { nowcastClient } from "../../microservices/gatewayClient";

function buildLocalNowcastBrief(effectiveDayWeather, selectedDayRecord, isViewingToday, formatTempFn, tempUnit) {
  if (!effectiveDayWeather?.current) return null;
  const cur = effectiveDayWeather.current;
  const temp = Number(cur.temp ?? 24);
  const feels = Number(cur.feelsLike ?? temp);
  const high = Number(cur.tempMaxToday ?? temp + 3);
  const low = Number(cur.tempMinToday ?? temp - 3);
  const humidity = Number(cur.humidity ?? 55);
  const wind = Number(cur.windSpeed ?? 10);
  const uv = Number(cur.uvIndex ?? 3);
  const precipProb = Math.max(
    Number(cur.precipProb || 0),
    Number(selectedDayRecord?.summary?.precipProbMax || 0)
  );
  const precipMm = Number(cur.precipitation || 0);
  const condLabel = cur.condition?.label || "Clear Sky";

  // 1. Apple Weather (iOS 18) Contextual "Feels Like" explanation
  const diff = Math.round(feels - temp);
  let feelsLikeReason = "Feels right around the actual temperature outside.";
  if (diff >= 2) {
    feelsLikeReason =
      humidity >= 60
        ? `Humidity makes it feel ${diff}° warmer than the actual temperature.`
        : `Direct sun warmth makes it feel ${diff}° warmer outside.`;
  } else if (diff <= -2) {
    feelsLikeReason =
      wind >= 12
        ? `A steady breeze makes it feel ${Math.abs(diff)}° cooler than the actual temperature.`
        : `Cool air makes it feel ${Math.abs(diff)}° cooler outside.`;
  } else if (wind >= 18) {
    feelsLikeReason = "A noticeable breeze keeps the air feeling fresh and comfortable.";
  }

  // 2. Google Pixel Weather "AI Daily Weather Brief"
  const skyPart = `${isViewingToday ? "Right now it's" : "On this date it's"} ${formatTempFn(temp, tempUnit)} with ${condLabel.toLowerCase()} (high of ${formatTempFn(high, tempUnit)}, low of ${formatTempFn(low, tempUnit)}).`;
  const rainPart =
    precipMm > 0.3 || precipProb >= 55
      ? "Rain is likely — keep an umbrella handy before heading out."
      : precipProb >= 30
      ? "There's a passing chance of light showers later in the day."
      : "Skies look dry with no rain interruptions expected.";
  const comfortPart =
    uv >= 6
      ? "Afternoon sunshine is strong, so sunglasses and sunscreen will help."
      : temp >= 29
      ? "Light, breathable clothes and staying hydrated are recommended."
      : temp <= 13
      ? "Bring a warm jacket or layer up for cooler hours."
      : "Overall, very comfortable weather for walking, errands, or outdoor plans.";

  // 3. AccuWeather "Next 60 Minutes MinuteCast®"
  const offsets = [0, 15, 30, 45, 60];
  const slots = offsets.map((min, idx) => {
    const label = min === 0 ? "Now" : `+${min}m`;
    if (precipMm > 0.2 || precipProb >= 60) {
      return {
        label,
        status: idx % 2 === 0 ? "Light Rain" : "Passing Shower",
        icon: "🌧️",
        intensity: "wet",
      };
    }
    if (precipProb >= 35) {
      return {
        label,
        status: idx >= 2 ? "Spotty Drops" : "Clouds",
        icon: idx >= 2 ? "🌦️" : "⛅",
        intensity: idx >= 2 ? "spotty" : "dry",
      };
    }
    return {
      label,
      status: cur.isDay === false ? "Clear & Dry" : "Dry Sky",
      icon: cur.isDay === false ? "🌙" : "☀️",
      intensity: "dry",
    };
  });

  const minuteCastHeadline =
    precipMm > 0.2 || precipProb >= 60
      ? "Light rain expected in the next 60 minutes — grab an umbrella."
      : precipProb >= 35
      ? "Mostly dry right now, with a slight chance of brief drops within the hour."
      : "No rain expected for the next 60 minutes — clear for outdoor walks & errands.";

  return {
    aiDailyBrief: `${skyPart} ${rainPart} ${comfortPart}`,
    feelsLikeContext: {
      diff,
      reason: feelsLikeReason,
    },
    minuteCast60m: {
      headline: minuteCastHeadline,
      slots,
    },
  };
}

export default function Weather() {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [locatingGps, setLocatingGps] = useState(false);

  // User Location Access & Selection Modal State
  // Opens on launch so the user can grant Live Location Access or select their preferred location
  const [showLocationModal, setShowLocationModal] = useState(true);
  const [locationSource, setLocationSource] = useState("Awaiting User Selection");
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [liveTrackingActive, setLiveTrackingActive] = useState(false);
  const watchIdRef = useRef(null);

  // Multi-Date Whole-Day State
  const [selectedDate, setSelectedDate] = useState("");
  const [customDateRecords, setCustomDateRecords] = useState({});
  const [loadingCustomDate, setLoadingCustomDate] = useState(false);
  const [activePhaseId, setActivePhaseId] = useState(null);

  // User Preferences (persisted in localStorage)
  const [tempUnit, setTempUnit] = useState(
    () => localStorage.getItem("aether_temp_unit") || "C"
  );
  const [windUnit, setWindUnit] = useState(
    () => localStorage.getItem("aether_wind_unit") || "km/h"
  );
  const [pressureUnit, setPressureUnit] = useState(
    () => localStorage.getItem("aether_pressure_unit") || "hPa"
  );
  const [timeFormat, setTimeFormat] = useState(
    () => localStorage.getItem("aether_time_format") || "12h"
  );

  // Sky Simulation Studio override ('auto' or manual theme)
  const [skyOverride, setSkyOverride] = useState("auto");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [zenSkyMode, setZenSkyMode] = useState(false);

  // Pinned Favorite Cities
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("aether_favorites_v1");
      return saved ? JSON.parse(saved) : DEFAULT_FAVORITE_CITIES;
    } catch (e) {
      return DEFAULT_FAVORITE_CITIES;
    }
  });
  const [favoriteSummaries, setFavoriteSummaries] = useState([]);

  // Live clock for selected city's timezone
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Save preferences
  useEffect(() => {
    localStorage.setItem("aether_temp_unit", tempUnit);
  }, [tempUnit]);
  useEffect(() => {
    localStorage.setItem("aether_wind_unit", windUnit);
  }, [windUnit]);
  useEffect(() => {
    localStorage.setItem("aether_pressure_unit", pressureUnit);
  }, [pressureUnit]);
  useEffect(() => {
    localStorage.setItem("aether_time_format", timeFormat);
  }, [timeFormat]);
  useEffect(() => {
    try {
      localStorage.setItem("aether_favorites_v1", JSON.stringify(favorites));
    } catch (e) {}
  }, [favorites]);

  // Load weather for a city object or search query string
  const loadWeather = useCallback(async (target, sourceLabel) => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCompleteWeather(target);
      setWeatherData(data);
      setSelectedDate(data.todayDate || data.daily?.[0]?.date || "");
      setCustomDateRecords({});
      setHoveredHour(null);
      setActivePhaseId(null);
      if (sourceLabel || target?.source) {
        setLocationSource(sourceLabel || target.source);
      }
      if (target?.accuracy) {
        setGpsAccuracy(target.accuracy);
      } else if (!target?.isLiveGps) {
        setGpsAccuracy(null);
      }
      setLoading(false);
    } catch (err) {
      setError(
        err?.message || "Unable to fetch meteorological data for that location."
      );
      setLoading(false);
    }
  }, []);

  // Initial startup: load saved user location (or background preview) while presenting the Location Access & Selection Gate
  useEffect(() => {
    let savedLoc = null;
    try {
      const raw = localStorage.getItem("aether_selected_location_v1");
      if (raw) savedLoc = JSON.parse(raw);
    } catch (e) {}

    if (savedLoc && savedLoc.latitude && savedLoc.longitude) {
      loadWeather(savedLoc, savedLoc.source || "Saved User Location");
    } else {
      loadWeather(DEFAULT_FAVORITE_CITIES[0], "Preview Station");
    }

    // If browser geolocation permission is already 'granted', automatically acquire live GPS in background
    if (navigator.permissions && navigator.permissions.query && navigator.geolocation) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((perm) => {
          if (perm.state === "granted") {
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                const loc = await reverseGeocode(latitude, longitude);
                const enriched = {
                  ...loc,
                  accuracy: Math.round(accuracy || 0),
                  source: "Live GPS Telemetry",
                  isLiveGps: true,
                };
                setSearch(enriched.name);
                loadWeather(enriched, "Live GPS Telemetry");
              },
              () => {},
              { enableHighAccuracy: true, timeout: 8000 }
            );
          }
        })
        .catch(() => {});
    }
  }, [loadWeather]);

  // Continuous Live GPS Watch (watchPosition)
  useEffect(() => {
    if (!liveTrackingActive) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setLiveTrackingActive(false);
      return;
    }

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsAccuracy(Math.round(accuracy || 0));
        const loc = await reverseGeocode(latitude, longitude);
        const enriched = {
          ...loc,
          accuracy: Math.round(accuracy || 0),
          source: "Live GPS Tracking",
          isLiveGps: true,
        };
        setSearch(enriched.name);
        loadWeather(enriched, "Live GPS Tracking");
      },
      () => {
        setLiveTrackingActive(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 15000,
      }
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [liveTrackingActive, loadWeather]);

  // Handler when user selects a location or grants live location from modal/search/map
  const handleUserChosenLocation = useCallback(
    async (loc, explicitSource) => {
      if (!loc) return;
      const src = explicitSource || loc.source || "User Selected Location";
      const enriched = { ...loc, source: src };
      try {
        localStorage.setItem(
          "aether_selected_location_v1",
          JSON.stringify(enriched)
        );
      } catch (e) {}
      if (enriched.name) setSearch(enriched.name);
      setShowLocationModal(false);
      await loadWeather(enriched, src);
    },
    [loadWeather]
  );

  // Refresh quick summaries for pinned cities
  useEffect(() => {
    let active = true;
    fetchQuickCitySummaries(favorites).then((res) => {
      if (active) setFavoriteSummaries(res);
    });
    return () => {
      active = false;
    };
  }, [favorites]);

  // Automatic 60-second live meteorological satellite refresh for everyday weather
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date());
  useEffect(() => {
    if (!weatherData?.location) return;
    const interval = setInterval(() => {
      fetchCompleteWeather(weatherData.location)
        .then((fresh) => {
          setWeatherData(fresh);
          setLastSyncedAt(new Date());
        })
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [weatherData?.location]);

  const handleManualRefresh = useCallback(async () => {
    if (!weatherData?.location) return;
    await loadWeather(weatherData.location, locationSource);
    setLastSyncedAt(new Date());
  }, [weatherData?.location, loadWeather, locationSource]);

  const [hoveredHour, setHoveredHour] = useState(null);
  const [scrubbedHourIndex, setScrubbedHourIndex] = useState(null);

  // Compute current live hour (0..23) in the selected station's timezone
  const getLiveStationHour = () => {
    const tz = weatherData?.location?.timezone || "UTC";
    try {
      const hrStr = nowTick.toLocaleTimeString("en-US", {
        timeZone: tz,
        hour: "2-digit",
        hour12: false,
      });
      const parsed = parseInt(hrStr, 10);
      if (!Number.isNaN(parsed)) return parsed % 24;
    } catch (e) {}
    return nowTick.getHours();
  };

  const liveClockHour = getLiveStationHour();
  const activeHourIndex =
    hoveredHour?.hourNumber ??
    (scrubbedHourIndex !== null ? scrubbedHourIndex : liveClockHour);

  // Resolve active Whole-Day Record for selectedDate
  const selectedDayRecord =
    (selectedDate && weatherData?.daysByDate?.[selectedDate]) ||
    (selectedDate && customDateRecords[selectedDate]) ||
    (weatherData?.todayDate && weatherData?.daysByDate?.[weatherData.todayDate]) ||
    weatherData?.allDays?.[0] ||
    null;

  const isViewingOtherDate =
    Boolean(selectedDate && weatherData?.todayDate) &&
    selectedDate !== weatherData.todayDate;

  // Resolve the live hour slot for whichever day is selected (Today, Past, or Forecast Day)
  const activeDayHourSlot =
    hoveredHour ||
    selectedDayRecord?.hours?.[activeHourIndex] ||
    selectedDayRecord?.hours?.[liveClockHour] ||
    selectedDayRecord?.hours?.[12] ||
    null;

  const useLiveCurrentSnapshot =
    !isViewingOtherDate && !hoveredHour && scrubbedHourIndex === null;

  // Handle user picking any date from strip, calendar input, or 14-day forecast
  const handleSelectDate = async (newDate) => {
    if (!newDate || !weatherData) return;
    setSelectedDate(newDate);
    setHoveredHour(null);
    setActivePhaseId(null);

    if (weatherData.daysByDate?.[newDate] || customDateRecords[newDate]) {
      return;
    }

    // Fetch custom date outside the 19-day preloaded window
    setLoadingCustomDate(true);
    setError(null);
    try {
      const customRec = await fetchSpecificDateWeather(
        weatherData.location,
        newDate,
        weatherData.todayDate
      );
      setCustomDateRecords((prev) => ({
        ...prev,
        [newDate]: customRec,
      }));
      setLoadingCustomDate(false);
    } catch (err) {
      setLoadingCustomDate(false);
      setError(
        err?.message || `Could not retrieve full-day weather for ${newDate}.`
      );
    }
  };

  const activeSkyTheme =
    skyOverride !== "auto"
      ? skyOverride
      : useLiveCurrentSnapshot
      ? weatherData?.current?.skyTheme || "clear-day"
      : activeDayHourSlot?.condition?.skyTheme ||
        selectedDayRecord?.summary?.condition?.skyTheme ||
        weatherData?.current?.skyTheme ||
        "clear-day";

  const liveSkyTelemetry = {
    skyTheme: activeSkyTheme,
    weatherCode: useLiveCurrentSnapshot
      ? weatherData?.current?.weatherCode ?? 0
      : activeDayHourSlot?.weatherCode ??
        selectedDayRecord?.summary?.weatherCode ??
        weatherData?.current?.weatherCode ??
        0,
    isDay:
      skyOverride === "clear-night"
        ? false
        : skyOverride === "clear-day" || skyOverride === "golden-hour"
        ? true
        : useLiveCurrentSnapshot
        ? Boolean(weatherData?.current?.isDay ?? true)
        : activeDayHourSlot
        ? Boolean(activeDayHourSlot.isDay)
        : Boolean(weatherData?.current?.isDay ?? true),
    temp: useLiveCurrentSnapshot
      ? weatherData?.current?.temp ?? 22
      : activeDayHourSlot?.temp ??
        selectedDayRecord?.summary?.tempMax ??
        weatherData?.current?.temp ??
        22,
    cloudCover: useLiveCurrentSnapshot
      ? weatherData?.current?.cloudCover ?? 25
      : activeDayHourSlot?.cloudCover ??
        selectedDayRecord?.summary?.cloudCoverAvg ??
        weatherData?.current?.cloudCover ??
        25,
    windSpeed: useLiveCurrentSnapshot
      ? weatherData?.current?.windSpeed ?? 12
      : activeDayHourSlot?.windSpeed ??
        selectedDayRecord?.summary?.windSpeedMax ??
        weatherData?.current?.windSpeed ??
        12,
    windDirection: useLiveCurrentSnapshot
      ? weatherData?.current?.windDirection ?? 90
      : activeDayHourSlot?.windDirection ??
        selectedDayRecord?.summary?.windDirectionDominant ??
        weatherData?.current?.windDirection ??
        90,
    precipitation: useLiveCurrentSnapshot
      ? weatherData?.current?.precipitation ?? 0
      : activeDayHourSlot?.precipMm ??
        selectedDayRecord?.summary?.precipSum ??
        weatherData?.current?.precipitation ??
        0,
    visibility: useLiveCurrentSnapshot
      ? weatherData?.current?.visibility ?? 10000
      : activeDayHourSlot?.visibility ??
        selectedDayRecord?.summary?.visibilityAvg ??
        weatherData?.current?.visibility ??
        10000,
    solarProgress: useLiveCurrentSnapshot
      ? weatherData?.astronomy?.solar?.progress ?? 0.5
      : Math.max(0.08, Math.min(0.92, (activeHourIndex - 6) / 12)),
  };

  // Construct an effective weatherData object synced to the selected day & live hour
  // so Hero Card, MetricsGrid, WeatherMap, and AtmosphericPhysicsLab all reflect live weather for EVERY day
  const effectiveDayWeather = weatherData
    ? useLiveCurrentSnapshot
      ? weatherData
      : {
          ...weatherData,
          current: {
            ...weatherData.current,
            temp:
              activeDayHourSlot?.temp ??
              selectedDayRecord?.summary?.tempAvg ??
              weatherData.current.temp,
            feelsLike:
              activeDayHourSlot?.feelsLike ??
              selectedDayRecord?.summary?.feelsLikeMax ??
              weatherData.current.feelsLike,
            humidity:
              activeDayHourSlot?.humidity ??
              selectedDayRecord?.summary?.humidityAvg ??
              weatherData.current.humidity,
            dewPoint:
              activeDayHourSlot?.dewPoint ?? weatherData.current.dewPoint,
            windSpeed:
              activeDayHourSlot?.windSpeed ??
              selectedDayRecord?.summary?.windSpeedMax ??
              weatherData.current.windSpeed,
            windDirection:
              activeDayHourSlot?.windDirection ??
              selectedDayRecord?.summary?.windDirectionDominant ??
              weatherData.current.windDirection,
            windGusts:
              activeDayHourSlot?.windGusts ??
              selectedDayRecord?.summary?.windGustsMax ??
              weatherData.current.windGusts,
            pressureMsl:
              activeDayHourSlot?.pressure ??
              selectedDayRecord?.summary?.pressureAvg ??
              weatherData.current.pressureMsl,
            pressureSurface:
              activeDayHourSlot?.pressure ??
              selectedDayRecord?.summary?.pressureAvg ??
              weatherData.current.pressureSurface,
            uvIndex:
              activeDayHourSlot?.uvIndex ??
              selectedDayRecord?.summary?.uvMax ??
              weatherData.current.uvIndex,
            visibility:
              activeDayHourSlot?.visibility ??
              selectedDayRecord?.summary?.visibilityAvg ??
              weatherData.current.visibility,
            cloudCover:
              activeDayHourSlot?.cloudCover ??
              selectedDayRecord?.summary?.cloudCoverAvg ??
              weatherData.current.cloudCover,
            precipitation:
              activeDayHourSlot?.precipMm ??
              selectedDayRecord?.summary?.precipSum ??
              0,
            isDay: activeDayHourSlot?.isDay ?? 1,
            weatherCode:
              activeDayHourSlot?.weatherCode ??
              selectedDayRecord?.summary?.weatherCode ??
              weatherData.current.weatherCode,
            condition:
              activeDayHourSlot?.condition ||
              selectedDayRecord?.summary?.condition ||
              weatherData.current.condition,
            skyTheme: activeSkyTheme,
            tempMaxToday:
              selectedDayRecord?.summary?.tempMax ??
              weatherData.current.tempMaxToday,
            tempMinToday:
              selectedDayRecord?.summary?.tempMin ??
              weatherData.current.tempMinToday,
          },
          astronomy: {
            ...weatherData.astronomy,
            sunrise:
              selectedDayRecord?.summary?.sunrise ||
              weatherData.astronomy.sunrise,
            sunset:
              selectedDayRecord?.summary?.sunset ||
              weatherData.astronomy.sunset,
            daylightSeconds:
              selectedDayRecord?.summary?.daylightSeconds ||
              weatherData.astronomy.daylightSeconds,
            solar: {
              ...weatherData.astronomy.solar,
              isDaylight: Boolean(activeDayHourSlot?.isDay ?? true),
              progress: Math.max(0, Math.min(1, (activeHourIndex - 6) / 12)),
            },
          },
        }
    : null;

  const nowcastBrief = buildLocalNowcastBrief(
    effectiveDayWeather,
    selectedDayRecord,
    Boolean(selectedDayRecord?.isToday),
    formatTemp,
    tempUnit
  );

  // Sync with nowcast-brief-service microservice via API Gateway
  useEffect(() => {
    if (!effectiveDayWeather?.current) return;
    nowcastClient
      .getBriefAndMinuteCast({
        temp: effectiveDayWeather.current.temp,
        feelsLike: effectiveDayWeather.current.feelsLike,
        tempMax: effectiveDayWeather.current.tempMaxToday,
        tempMin: effectiveDayWeather.current.tempMinToday,
        humidity: effectiveDayWeather.current.humidity,
        windSpeed: effectiveDayWeather.current.windSpeed,
        uvIndex: effectiveDayWeather.current.uvIndex,
        precipProb: Math.max(
          effectiveDayWeather.current.precipProb || 0,
          selectedDayRecord?.summary?.precipProbMax || 0
        ),
        precipMm: effectiveDayWeather.current.precipitation || 0,
        condition: effectiveDayWeather.current.condition?.label || "Clear Sky",
        city: weatherData?.location?.name || "Your Location",
        isDay: effectiveDayWeather.current.isDay !== false,
      })
      .catch(() => {});
  }, [
    effectiveDayWeather?.current?.temp,
    selectedDayRecord?.date,
    weatherData?.location?.name,
  ]);

  // Sync ambient sound engine when theme changes
  useEffect(() => {
    if (soundEnabled) {
      soundEngine.updateTheme(activeSkyTheme);
    }
  }, [activeSkyTheme, soundEnabled]);

  const toggleSound = () => {
    if (soundEnabled) {
      soundEngine.stop();
      setSoundEnabled(false);
    } else {
      const started = soundEngine.start(activeSkyTheme);
      if (started) setSoundEnabled(true);
    }
  };

  const handleSearch = async (overrideQuery) => {
    const q = typeof overrideQuery === "string" ? overrideQuery : search;
    if (!q || !q.trim()) return;
    await loadWeather(q.trim(), "User Search Selection");
  };

  const handleLocateMe = () => {
    setLocatingGps(true);
    setError(null);

    if (!navigator.geolocation) {
      detectIpLiveLocation()
        .then((netLoc) => {
          handleUserChosenLocation(netLoc, "Live Network Geolocation");
          setLocatingGps(false);
        })
        .catch(() => {
          setLocatingGps(false);
          setShowLocationModal(true);
        });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const loc = await reverseGeocode(latitude, longitude);
        const enriched = {
          ...loc,
          accuracy: Math.round(accuracy || 0),
          source: "Live GPS Telemetry",
          isLiveGps: true,
        };
        await handleUserChosenLocation(enriched, "Live GPS Telemetry");
        setLocatingGps(false);
      },
      async (err) => {
        if (err.code === 1) {
          // Permission denied — open the Location Access & Selection Modal so user can grant via network or pick city
          setLocatingGps(false);
          setShowLocationModal(true);
          setError(
            "Browser GPS permission was blocked. Use 'Detect Live Location via Network IP' or select your location in the Location Hub."
          );
        } else {
          // Hardware sensor timeout/unavailable — seamlessly fall back to Live Network Geolocation
          try {
            const netLoc = await detectIpLiveLocation();
            await handleUserChosenLocation(netLoc, "Live Network Geolocation");
            setLocatingGps(false);
          } catch (netErr) {
            setLocatingGps(false);
            setShowLocationModal(true);
          }
        }
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
    );
  };

  const handleInspectCoordinates = async (lat, lon) => {
    const loc = await reverseGeocode(lat, lon);
    await handleUserChosenLocation(
      { ...loc, source: "Interactive Radar Pin" },
      "Interactive Radar Pin"
    );
  };

  // Pin / Unpin current location
  const isCurrentPinned = weatherData?.location
    ? favorites.some(
        (f) =>
          f.id === weatherData.location.id ||
          (Math.abs(f.latitude - weatherData.location.latitude) < 0.08 &&
            Math.abs(f.longitude - weatherData.location.longitude) < 0.08)
      )
    : false;

  const togglePinCurrent = () => {
    if (!weatherData?.location) return;
    const loc = weatherData.location;
    if (isCurrentPinned) {
      setFavorites((prev) =>
        prev.filter(
          (f) =>
            f.id !== loc.id &&
            !(
              Math.abs(f.latitude - loc.latitude) < 0.08 &&
              Math.abs(f.longitude - loc.longitude) < 0.08
            )
        )
      );
    } else {
      setFavorites((prev) => [loc, ...prev.slice(0, 9)]);
    }
  };

  // Format live date & clock in target city's IANA timezone
  const getCityLiveDateTime = () => {
    const tz = weatherData?.location?.timezone || "UTC";
    try {
      const dateStr = nowTick.toLocaleDateString("en-US", {
        timeZone: tz,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const shortDateStr = nowTick.toLocaleDateString("en-US", {
        timeZone: tz,
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timeStr = nowTick.toLocaleTimeString("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: timeFormat === "12h",
      });
      return { dateStr, shortDateStr, timeStr };
    } catch (e) {
      return {
        dateStr: nowTick.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        shortDateStr: nowTick.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        timeStr: nowTick.toLocaleTimeString(),
      };
    }
  };

  const formatSelectedFullDate = (dStr) => {
    if (!dStr) return dateStr;
    const [y, m, d] = dStr.split("-").map(Number);
    if (!y || !m || !d) return dStr;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatActiveSlotClock = (hr) => {
    const h = Number(hr) || 0;
    if (timeFormat === "24h") {
      return `${String(h).padStart(2, "0")}:00`;
    }
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00 ${suffix}`;
  };

  const { dateStr, shortDateStr, timeStr } = getCityLiveDateTime();
  const activeFullDateStr = isViewingOtherDate
    ? formatSelectedFullDate(selectedDate)
    : dateStr;
  const aqiMeta = getAqiMeta(weatherData?.airQuality?.usAqi);
  const uvMeta = getUvMeta(weatherData?.current?.uvIndex);

  return (
    <div className={`aether-shell theme-${activeSkyTheme}`}>
      {/* 60FPS Procedural Atmospheric Sky & Particle Canvas */}
      <WeatherCanvas {...liveSkyTelemetry} />

      {/* User Location Access & Selection Gate Modal */}
      <LocationGateModal
        isOpen={showLocationModal}
        canClose={Boolean(weatherData)}
        onClose={() => setShowLocationModal(false)}
        onSelectLocation={(loc) => handleUserChosenLocation(loc, loc.source)}
        currentLocation={weatherData?.location}
        liveTrackingActive={liveTrackingActive}
        onToggleLiveTracking={() => setLiveTrackingActive((v) => !v)}
        gpsAccuracy={gpsAccuracy}
        locationSource={locationSource}
      />

      <div className="aether-container">
        {/* TOP LIVE DATE, TIME & LOCATION RIBBON (ABOVE EVERYTHING) */}
        <div className="aether-top-datetime-banner" role="region" aria-label="Live Date and Time">
          <div className="top-dt-left">
            <span className="top-dt-live-badge">
              <i className="live-dot" /> LIVE
            </span>
            <span className="top-dt-date">
              📅 <strong>{activeFullDateStr}</strong>
              {isViewingOtherDate && (
                <em className="top-dt-selected-tag"> (Selected Date)</em>
              )}
            </span>
            <span className="top-dt-divider">|</span>
            <span className="top-dt-clock">
              🕒 Time: <strong>{timeStr}</strong>
            </span>
          </div>

          <div className="top-dt-right">
            {weatherData?.location && (
              <span className="top-dt-tz">
                📍 {weatherData.location.name}
                {weatherData.location.country
                  ? `, ${weatherData.location.country}`
                  : ""}
              </span>
            )}
            <label className="top-dt-quick-date" title="Pick any date">
              <span>📅 Pick Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) handleSelectDate(e.target.value);
                }}
              />
            </label>
          </div>
        </div>

        {/* TOP COMMAND HEADER */}
        <header className="aether-topbar">
          <div className="aether-brand">
            <div className="brand-emblem" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" stroke="url(#brandGrad)" strokeWidth="2.5" />
                <path
                  d="M8 19C10.5 14 14 11 18.5 11C22 11 24.5 13.5 24.5 16.5C24.5 19.5 22 21 19 21H9.5"
                  stroke="#38BDF8"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="11" r="2.5" fill="#FACC15" />
                <defs>
                  <linearGradient id="brandGrad" x1="0" y1="0" x2="32" y2="32">
                    <stop stopColor="#38BDF8" />
                    <stop offset="1" stopColor="#818CF8" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="brand-titles">
              <h1>AETHER</h1>
              <span>LIVE WEATHER &amp; DAILY FORECAST</span>
            </div>
            <span className="telemetry-live-pill">
              <i className="live-dot" /> {shortDateStr} • {timeStr}
            </span>
          </div>

          {/* Global Autocomplete Search + GPS */}
          <Search
            search={search}
            setSearch={setSearch}
            handleSearch={handleSearch}
            onSelectLocation={(loc) =>
              handleUserChosenLocation(loc, "Selected Location")
            }
            onLocateMe={handleLocateMe}
            locatingGps={locatingGps}
          />

          {/* Unit & Controls */}
          <div className="aether-header-controls">
            {/* Open Location Access & Selection Hub */}
            <button
              type="button"
              className="aether-ctrl-btn location-hub-btn"
              onClick={() => setShowLocationModal(true)}
              title="Select your city or use your live location"
            >
              📍 Change Location
            </button>

            {/* Ambient Weather Sound */}
            <button
              type="button"
              className={`aether-ctrl-btn sound-btn ${
                soundEnabled ? "is-active" : ""
              }`}
              onClick={toggleSound}
              title="Play soothing weather sounds matching the current sky"
            >
              {soundEnabled ? "🔊 Weather Sound On" : "🔈 Weather Sound"}
            </button>

            {/* Temperature Unit Toggle */}
            <div className="aether-unit-pill">
              <button
                type="button"
                className={tempUnit === "C" ? "is-active" : ""}
                onClick={() => setTempUnit("C")}
              >
                °C
              </button>
              <button
                type="button"
                className={tempUnit === "F" ? "is-active" : ""}
                onClick={() => setTempUnit("F")}
              >
                °F
              </button>
            </div>

            {/* Wind Unit Cycle */}
            <button
              type="button"
              className="aether-ctrl-btn"
              onClick={() =>
                setWindUnit((u) => (u === "km/h" ? "mph" : "km/h"))
              }
              title="Switch wind speed unit"
            >
              {windUnit}
            </button>

            {/* Clock Format Toggle */}
            <button
              type="button"
              className="aether-ctrl-btn"
              onClick={() => setTimeFormat((f) => (f === "12h" ? "24h" : "12h"))}
              title="Switch between 12-hour and 24-hour clock"
            >
              {timeFormat}
            </button>
          </div>
        </header>

        {/* SAVED CITIES RIBBON */}
        <nav className="aether-favorites-ribbon" aria-label="Saved Cities">
          <button
            type="button"
            className="favorite-city-pill live-gps-ribbon-pill"
            onClick={handleLocateMe}
            title="Use my current live location"
          >
            <span className="fav-country-code">🛰️</span>
            <span className="fav-city-name">
              {locatingGps ? "Finding Location..." : "Use My Live Location"}
            </span>
          </button>

          <button
            type="button"
            className="favorite-city-pill choose-loc-ribbon-pill"
            onClick={() => setShowLocationModal(true)}
            title="Search for a city, pick on map, or use GPS"
          >
            <span className="fav-country-code">📍</span>
            <span className="fav-city-name">Choose Location...</span>
          </button>

          {(favoriteSummaries.length > 0 ? favoriteSummaries : favorites).map(
            (city) => {
              const isSelected =
                weatherData?.location?.id === city.id ||
                weatherData?.location?.name?.toLowerCase() ===
                  city.name?.toLowerCase();
              return (
                <button
                  key={city.id}
                  type="button"
                  className={`favorite-city-pill ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onClick={() => {
                    handleUserChosenLocation(city, "Selected Location");
                  }}
                >
                  <span className="fav-country-code">
                    {city.countryCode || "GL"}
                  </span>
                  <span className="fav-city-name">{city.name}</span>
                  {city.temp !== undefined && (
                    <span className="fav-city-temp">
                      {formatTemp(city.temp, tempUnit)}
                    </span>
                  )}
                </button>
              );
            }
          )}
        </nav>

        {/* USER-FRIENDLY QUICK-JUMP NAVIGATION DOCK */}
        <div className="aether-quick-nav-dock" role="navigation" aria-label="Quick Navigation">
          <div className="quick-nav-pills-wrap">
            {[
              { id: "sec-hero", label: "🌤️ Current Weather" },
              { id: "sec-wholeday", label: "📅 Whole-Day & Dates" },
              { id: "sec-hourly", label: "⏰ Hourly Forecast" },
              { id: "sec-daily-map", label: "📆 14-Day & Map" },
              { id: "sec-gauges", label: "🌬️ Today's Details" },
              { id: "sec-lifestyle", label: "👕 Activities & Clothing" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className="quick-nav-pill"
                onClick={() => {
                  setZenSkyMode(false);
                  setTimeout(() => {
                    document
                      .getElementById(item.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 40);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`zen-cinema-btn ${zenSkyMode ? "is-active" : ""}`}
            onClick={() => setZenSkyMode((z) => !z)}
            title="Full-screen live weather sky view"
          >
            {zenSkyMode ? "✦ Back to Weather Details" : "🎬 Full-Screen Sky View"}
          </button>
        </div>

        {/* LIVE WEATHER BACKGROUND THEME BAR */}
        <div className="aether-live-sky-hud">
          <div className="sky-hud-status">
            <span className="tag-dot live-pulse" />
            <strong>LIVE WEATHER BACKGROUND:</strong>
            <span>
              {skyOverride !== "auto"
                ? `Previewing ${skyOverride.replace("-", " ")} sky`
                : `Matching live weather in ${
                    weatherData?.location?.name || "your location"
                  } (${
                    effectiveDayWeather?.current?.condition?.label || "Clear"
                  })`}
            </span>
          </div>

          <div className="sky-hud-pills">
            {[
              { id: "auto", label: "🔄 Match Live Weather" },
              { id: "clear-day", label: "☀️ Sunny" },
              { id: "golden-hour", label: "🌅 Sunset" },
              { id: "clear-night", label: "🌙 Night" },
              { id: "rain", label: "🌧️ Rain" },
              { id: "storm", label: "⛈️ Storm" },
              { id: "snow", label: "❄️ Snow" },
              { id: "fog", label: "🌫️ Fog" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`sky-morph-pill ${
                  skyOverride === p.id ? "is-active" : ""
                }`}
                onClick={() => setSkyOverride(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ERROR BANNER */}
        {error && (
          <div className="aether-alert-banner alert-warning" role="alert">
            <div className="alert-content">
              <strong>Notice:</strong> {error}
            </div>
            <button
              type="button"
              className="alert-dismiss"
              onClick={() => setError(null)}
            >
              Close
            </button>
          </div>
        )}

        {/* WEATHER ALERTS */}
        {weatherData?.insights?.alerts?.length > 0 && (
          <div className="aether-alerts-stack">
            {weatherData.insights.alerts.map((al, i) => (
              <div
                key={al.title + i}
                className={`aether-alert-banner alert-${al.level}`}
              >
                <span className="alert-badge">
                  {al.level === "severe" ? "⚠️ WEATHER ALERT" : "⚡ WEATHER NOTE"}
                </span>
                <div className="alert-text">
                  <strong>{al.title}:</strong> {al.description}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FULL-SCREEN SKY SHOWCASE MODE */}
        {zenSkyMode && effectiveDayWeather && (
          <div className="aether-zen-cinema-stage">
            <div className="zen-cinema-glass-pod">
              <div className="zen-pod-top">
                <span className="zen-live-tag">● LIVE WEATHER SKY</span>
                <button
                  type="button"
                  className="zen-exit-btn"
                  onClick={() => setZenSkyMode(false)}
                >
                  ✕ Back to Dashboard
                </button>
              </div>
              <div className="zen-pod-clock">{timeStr}</div>
              <div className="zen-pod-date">📅 {activeFullDateStr}</div>
              <div className="zen-pod-weather">
                <span className="zen-pod-temp">
                  {formatTemp(effectiveDayWeather.current.temp, tempUnit)}
                </span>
                <span className="zen-pod-cond">
                  {effectiveDayWeather.current.condition.label}
                </span>
              </div>
              <h2 className="zen-pod-city">
                📍 {weatherData.location.name}
                {weatherData.location.country
                  ? `, ${weatherData.location.country}`
                  : ""}
              </h2>
              <p className="zen-pod-hint">
                Feels like{" "}
                {formatTemp(effectiveDayWeather.current.feelsLike, tempUnit)} •
                High{" "}
                {formatTemp(
                  effectiveDayWeather.current.tempMaxToday,
                  tempUnit
                )}{" "}
                • Low{" "}
                {formatTemp(effectiveDayWeather.current.tempMinToday, tempUnit)}
              </p>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        {!zenSkyMode &&
          (loading && !weatherData ? (
            <div className="aether-loading-state loading">
              <div className="loading-orbital" />
              <p>Loading live weather for your location...</p>
            </div>
          ) : (
            weatherData &&
            effectiveDayWeather && (
              <main className="aether-main-grid">
                {/* HERO CURRENT / SELECTED DATE WEATHER CARD */}
                <section
                  id="sec-hero"
                  className="aether-card aether-hero-card"
                >
                  <div className="hero-left">
                    {/* PROMINENT TOP DATE & LIVE TIME BAR */}
                    <div className="hero-top-datetime-showcase">
                      <div className="hero-dt-badge-group">
                        <span className="hero-dt-pill date-pill">
                          📅 <strong>{activeFullDateStr}</strong>
                        </span>
                        <span className="hero-dt-pill time-pill">
                          🕒 Live Time: <strong>{timeStr}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="hero-station-meta">
                      <span className="station-source-pill">
                        {locationSource.includes("Live")
                          ? "🛰️ Your Live Location"
                          : "📍 Selected Location"}
                      </span>
                      <button
                        type="button"
                        className="pin-station-btn change-loc-hero-btn"
                        onClick={() => setShowLocationModal(true)}
                      >
                        📍 Change Location
                      </button>
                      <button
                        type="button"
                        className={`pin-station-btn ${
                          isCurrentPinned ? "is-pinned" : ""
                        }`}
                        onClick={togglePinCurrent}
                      >
                        {isCurrentPinned ? "★ Saved City" : "☆ Save City"}
                      </button>
                      {isViewingOtherDate && (
                        <button
                          type="button"
                          className="pin-station-btn is-pinned"
                          onClick={() =>
                            handleSelectDate(weatherData.todayDate)
                          }
                        >
                          ⚡ Back to Today&apos;s Weather
                        </button>
                      )}
                    </div>

                    <div className="city-name hero-city-title">
                      <h2>
                        {weatherData.location.name}
                        {weatherData.location.country ? (
                          <span>, {weatherData.location.country}</span>
                        ) : null}
                      </h2>
                      {weatherData.location.admin1 &&
                        weatherData.location.admin1 !==
                          weatherData.location.name && (
                          <p className="hero-admin-region">
                            {weatherData.location.admin1}
                          </p>
                        )}
                    </div>

                    <div className="hero-temp-row">
                      <div className="hero-icon-stage">
                        <WeatherIcon
                          type={effectiveDayWeather.current.condition.icon}
                          size={96}
                        />
                      </div>
                      <div className="temp hero-giant-temp">
                        {formatTemp(effectiveDayWeather.current.temp, tempUnit)}
                      </div>
                      <div className="hero-cond-summary">
                        <p className="description hero-cond-label">
                          {effectiveDayWeather.current.condition.label}
                        </p>
                        <p className="hero-feels-like">
                          Feels like{" "}
                          <strong>
                            {formatTemp(
                              effectiveDayWeather.current.feelsLike,
                              tempUnit
                            )}
                          </strong>{" "}
                          • High{" "}
                          <strong>
                            {formatTemp(
                              effectiveDayWeather.current.tempMaxToday,
                              tempUnit
                            )}
                          </strong>{" "}
                          • Low{" "}
                          <strong>
                            {formatTemp(
                              effectiveDayWeather.current.tempMinToday,
                              tempUnit
                            )}
                          </strong>
                        </p>
                        <p className="hero-cond-detail">
                          {effectiveDayWeather.current.condition.detail}
                        </p>
                        {nowcastBrief?.feelsLikeContext?.reason && (
                          <div className="ios-feels-reason-pill">
                            <span>🌡️ Why it feels this way:</span>{" "}
                            <strong>{nowcastBrief.feelsLikeContext.reason}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* GOOGLE PIXEL WEATHER: AI DAILY WEATHER BRIEF + ACCUWEATHER 60-MIN MINUTECAST */}
                    {nowcastBrief && (
                      <div className="hero-worldclass-nowcast-grid">
                        <div className="pixel-ai-brief-box">
                          <div className="pixel-ai-brief-header">
                            <span className="pixel-ai-sparkle">✨</span>
                            <span>AI DAILY WEATHER BRIEF</span>
                            <span className="pixel-ai-badge">Plain-English Summary</span>
                          </div>
                          <p className="pixel-ai-brief-text">
                            {nowcastBrief.aiDailyBrief}
                          </p>
                        </div>

                        <div className="minutecast-60m-strip">
                          <div className="minutecast-60m-header">
                            <span>⏱️ NEXT 60 MINUTES • MINUTECAST® SKY CHECK</span>
                            <strong>{nowcastBrief.minuteCast60m.headline}</strong>
                          </div>
                          <div className="minutecast-slots-row">
                            {nowcastBrief.minuteCast60m.slots.map((slot) => (
                              <div
                                key={slot.label}
                                className={`minutecast-slot intensity-${slot.intensity}`}
                              >
                                <span className="mc-time">{slot.label}</span>
                                <span className="mc-icon">{slot.icon}</span>
                                <strong className="mc-status">{slot.status}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* EASY-TO-UNDERSTAND DAILY HELPFUL TIPS */}
                    <div className="hero-human-comfort-strip">
                      <div className="comfort-chip">
                        <span>☂️ UMBRELLA</span>
                        <strong>
                          {effectiveDayWeather.current.precipitation > 0.2 ||
                          (selectedDayRecord?.summary?.precipProbMax ?? 0) >= 40
                            ? "Take an Umbrella"
                            : "No Umbrella Needed"}
                        </strong>
                      </div>
                      <div className="comfort-chip">
                        <span>👕 WHAT TO WEAR</span>
                        <strong>
                          {effectiveDayWeather.current.temp >= 28
                            ? "Light Cotton Clothes"
                            : effectiveDayWeather.current.temp >= 19
                            ? "Comfortable Casual Wear"
                            : effectiveDayWeather.current.temp >= 11
                            ? "Light Jacket or Hoodie"
                            : "Warm Coat & Layers"}
                        </strong>
                      </div>
                      <div className="comfort-chip">
                        <span>🕶️ SUN PROTECTION</span>
                        <strong>
                          {effectiveDayWeather.current.uvIndex >= 6
                            ? "Wear Sunscreen & Sunglasses"
                            : effectiveDayWeather.current.uvIndex >= 3
                            ? "Sunglasses Recommended"
                            : "Low UV — Safe Outside"}
                        </strong>
                      </div>
                      <div className="comfort-chip">
                        <span>🏃 OUTDOOR PLANS</span>
                        <strong>
                          {effectiveDayWeather.current.precipitation > 1
                            ? "Better for Indoor Plans"
                            : effectiveDayWeather.current.temp >= 16 &&
                              effectiveDayWeather.current.temp <= 31
                            ? "Great Weather to Go Out"
                            : "Fair Outdoor Weather"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* HERO RIGHT: 4 SIMPLE EVERYDAY WEATHER STATS */}
                  <div className="weather-info hero-kpi-grid">
                    <div className="column hero-kpi-box">
                      <span className="kpi-icon">🌧️</span>
                      <div>
                        <p className="kpi-value">
                          {Math.max(
                            effectiveDayWeather.current.precipProb || 0,
                            selectedDayRecord?.summary?.precipProbMax || 0
                          )}
                          %
                        </p>
                        <p className="kpi-title">Chance of Rain</p>
                      </div>
                    </div>

                    <div className="column hero-kpi-box">
                      <span className="kpi-icon">💨</span>
                      <div>
                        <p className="wind kpi-value">
                          {formatWind(
                            effectiveDayWeather.current.windSpeed,
                            windUnit
                          )}
                        </p>
                        <p className="kpi-title">Wind Speed</p>
                      </div>
                    </div>

                    <div className="column hero-kpi-box">
                      <span className="kpi-icon">💧</span>
                      <div>
                        <p className="humidity kpi-value">
                          {effectiveDayWeather.current.humidity}%
                        </p>
                        <p className="kpi-title">Humidity</p>
                      </div>
                    </div>

                    <div className="column hero-kpi-box">
                      <span className="kpi-icon">🍃</span>
                      <div>
                        <p
                          className="kpi-value"
                          style={{ color: aqiMeta.color }}
                        >
                          {aqiMeta.label}
                        </p>
                        <p className="kpi-title">Air Quality</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* WHOLE-DAY WEATHER & MULTI-DATE SELECTOR */}
                <div id="sec-wholeday">
                  <WholeDayExplorer
                    allDays={weatherData.allDays || []}
                    selectedDate={selectedDate}
                    selectedDayRecord={selectedDayRecord}
                    todayDate={weatherData.todayDate}
                    loadingCustomDate={loadingCustomDate}
                    tempUnit={tempUnit}
                    windUnit={windUnit}
                    timeFormat={timeFormat}
                    liveTimeStr={timeStr}
                    onSelectDate={handleSelectDate}
                    activePhaseId={activePhaseId}
                    activeHourIndex={activeHourIndex}
                    onSelectHourIndex={(idxOrFn) => {
                      setHoveredHour(null);
                      setScrubbedHourIndex((prev) =>
                        typeof idxOrFn === "function"
                          ? idxOrFn(prev !== null ? prev : liveClockHour)
                          : idxOrFn
                      );
                    }}
                    liveClockHour={liveClockHour}
                    isSyncedToLiveClock={
                      scrubbedHourIndex === null && !hoveredHour
                    }
                    onResetToLiveClock={() => {
                      setScrubbedHourIndex(null);
                      setHoveredHour(null);
                      setActivePhaseId(null);
                    }}
                    onManualRefresh={handleManualRefresh}
                    onSelectPhaseHour={(repHour, phaseId) => {
                      setHoveredHour(repHour || null);
                      setActivePhaseId(phaseId || null);
                    }}
                  />
                </div>

                {/* 24-HOUR HOURLY FORECAST */}
                <div id="sec-hourly">
                  <HourlyForecast
                    hourly={weatherData.hourly}
                    wholeDayHours={selectedDayRecord?.hours || []}
                    selectedDate={selectedDate}
                    tempUnit={tempUnit}
                    windUnit={windUnit}
                    timeFormat={timeFormat}
                    onHoverHour={setHoveredHour}
                  />
                </div>

                {/* 14-DAY FORECAST + LIVE WEATHER MAP */}
                <div id="sec-daily-map" className="aether-split-row">
                  <DailyForecast
                    daily={weatherData.daily}
                    daysByDate={weatherData.daysByDate}
                    liveClockHour={liveClockHour}
                    dailyBounds={weatherData.dailyBounds}
                    currentTemp={weatherData.current.temp}
                    selectedDate={selectedDate}
                    onSelectDate={handleSelectDate}
                    tempUnit={tempUnit}
                    windUnit={windUnit}
                  />

                  <WeatherMap
                    location={weatherData.location}
                    current={effectiveDayWeather.current}
                    tempUnit={tempUnit}
                    windUnit={windUnit}
                    onInspectCoordinates={handleInspectCoordinates}
                  />
                </div>

                {/* TODAY'S ESSENTIAL WEATHER DETAILS (6 EASY-TO-READ CARDS) */}
                <div id="sec-gauges">
                  <MetricsGrid
                    weather={effectiveDayWeather}
                    tempUnit={tempUnit}
                    windUnit={windUnit}
                  />
                </div>

                {/* DAILY ACTIVITIES, CLOTHING & SAVED CITIES */}
                <div id="sec-lifestyle">
                  <SmartAdvisor
                    insights={weatherData.insights}
                    favoriteSummaries={favoriteSummaries}
                    currentLocationId={weatherData.location.id}
                    tempUnit={tempUnit}
                    windUnit={windUnit}
                    onSelectCity={(city) => {
                      handleUserChosenLocation(city, "Selected Location");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </div>
              </main>
            )
          ))}

        {/* SIMPLE FOOTER */}
        <footer className="aether-footer">
          <div>
            <strong>AETHER Live Weather</strong> • Live Local Time, Whole-Day
            Forecast &amp; 14-Day Outlook
          </div>
          <div className="footer-shortcuts">
            <span>
              Press <kbd>/</kbd> to search any city
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
