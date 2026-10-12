"""
Weather & Whole-Day Forecast Microservice (forecast-service v1.0.0)
Bounded Context:
- Live Current Weather
- Complete 24-Hour Whole-Day Weather (00:00 - 23:00)
- 14-Day Multi-Date Forecast & Custom Historical/Future Date Lookup
- Isolated Forecast Cache Store & Circuit Breaker
"""
import json
import time
import urllib.parse
import urllib.request
from .registry_service import (
    REGISTRY,
    IsolatedServiceStore,
    CircuitBreaker,
    create_envelope,
)

SERVICE_ID = "forecast-service"
SERVICE_VERSION = "1.0.0"

_store = IsolatedServiceStore(SERVICE_ID, default_ttl_sec=300)
_cb = CircuitBreaker(SERVICE_ID, failure_threshold=3, recovery_timeout_sec=15.0)

REGISTRY.register(
    service_id=SERVICE_ID,
    name="Weather & Whole-Day Forecast Microservice",
    version=SERVICE_VERSION,
    bounded_context="Live Weather, 24H Whole-Day & 14-Day Forecast",
    endpoints=[
        "GET /api/v1/forecast/current?lat=<lat>&lon=<lon>&tz=<tz>",
        "GET /api/v1/forecast/date?lat=<lat>&lon=<lon>&date=<YYYY-MM-DD>&tz=<tz>",
        "GET /api/v1/forecast/health",
    ],
    store=_store,
    circuit_breaker=_cb,
)


def _fetch_json(url: str, timeout: float = 6.0) -> dict:
    req = urllib.request.Request(
        url, headers={"User-Agent": "AETHER-Forecast-Microservice/1.0"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_forecast_handler(
    lat: float, lon: float, tz: str = "auto", correlation_id: str = None
) -> dict:
    t0 = time.time()
    cache_key = f"fc:{lat:.3f},{lon:.3f}"
    cached = _store.get(cache_key)
    if cached is not None:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(SERVICE_ID, dt, False)
        return create_envelope(SERVICE_ID, cached, correlation_id, False, dt)

    def _upstream():
        params = urllib.parse.urlencode(
            {
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
                "hourly": "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,shortwave_radiation",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
                "timezone": tz or "auto",
                "past_days": 2,
                "forecast_days": 14,
            }
        )
        return _fetch_json(f"https://api.open-meteo.com/v1/forecast?{params}")

    def _fallback():
        return {"fallback": True, "latitude": lat, "longitude": lon}

    raw, degraded = _cb.execute(_upstream, _fallback)
    if not degraded:
        _store.set(cache_key, raw, ttl_sec=300)
    dt = (time.time() - t0) * 1000
    REGISTRY.record_call(SERVICE_ID, dt, degraded)
    return create_envelope(SERVICE_ID, raw, correlation_id, degraded, dt)


def get_custom_date_handler(
    lat: float,
    lon: float,
    date_str: str,
    tz: str = "auto",
    correlation_id: str = None,
) -> dict:
    t0 = time.time()
    if not date_str or len(date_str) != 10 or date_str < "1950-01-01":
        raise ValueError(
            f"Unsupported date '{date_str}'. Historical reanalysis data is available starting from 1950-01-01."
        )
    today_utc = time.strftime("%Y-%m-%d", time.gmtime())
    max_future_utc = time.strftime(
        "%Y-%m-%d", time.gmtime(time.time() + 16 * 86400)
    )
    if date_str > max_future_utc:
        raise ValueError(
            f"Unsupported future date '{date_str}'. Forecast models only extend up to 16 days ahead ({max_future_utc})."
        )

    cache_key = f"date:{lat:.3f},{lon:.3f}:{date_str}"
    cached = _store.get(cache_key)
    if cached is not None:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(SERVICE_ID, dt, False)
        return create_envelope(SERVICE_ID, cached, correlation_id, False, dt)

    is_historical = date_str < time.strftime(
        "%Y-%m-%d", time.gmtime(time.time() - 5 * 86400)
    )

    def _upstream():
        if is_historical:
            params = urllib.parse.urlencode(
                {
                    "latitude": lat,
                    "longitude": lon,
                    "start_date": date_str,
                    "end_date": date_str,
                    "hourly": "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,shortwave_radiation",
                    "daily": "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
                    "timezone": tz or "auto",
                }
            )
            res = _fetch_json(
                f"https://archive-api.open-meteo.com/v1/archive?{params}"
            )
            res["dataSourceType"] = "historical_reanalysis_era5"
            return res

        params = urllib.parse.urlencode(
            {
                "latitude": lat,
                "longitude": lon,
                "start_date": date_str,
                "end_date": date_str,
                "hourly": "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,shortwave_radiation",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
                "timezone": tz or "auto",
            }
        )
        res = _fetch_json(f"https://api.open-meteo.com/v1/forecast?{params}")
        res["dataSourceType"] = "nwp_forecast"
        return res

    def _fallback():
        return {
            "fallback": True,
            "date": date_str,
            "dataSourceType": "historical_reanalysis_era5"
            if is_historical
            else "nwp_forecast",
        }

    raw, degraded = _cb.execute(_upstream, _fallback)
    if not degraded:
        _store.set(cache_key, raw, ttl_sec=600)
    dt = (time.time() - t0) * 1000
    REGISTRY.record_call(SERVICE_ID, dt, degraded)
    return create_envelope(SERVICE_ID, raw, correlation_id, degraded, dt)


def health_handler(correlation_id: str = None) -> dict:
    return create_envelope(
        SERVICE_ID,
        {
            "service": SERVICE_ID,
            "version": SERVICE_VERSION,
            "status": "UP",
            "store": _store.stats(),
            "circuitBreaker": _cb.status(),
        },
        correlation_id,
    )

