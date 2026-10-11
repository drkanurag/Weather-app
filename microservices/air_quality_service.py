"""
Air Quality & UV Health Microservice (air-quality-service v1.0.0)
Bounded Context:
- Real-Time Air Quality Index (US AQI / Clean Air Status)
- Everyday Breathability & Outdoor Health Guidance
- Isolated Air Quality Store & Circuit Breaker
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

SERVICE_ID = "air-quality-service"
SERVICE_VERSION = "1.0.0"

_store = IsolatedServiceStore(SERVICE_ID, default_ttl_sec=600)
_cb = CircuitBreaker(SERVICE_ID, failure_threshold=3, recovery_timeout_sec=15.0)

REGISTRY.register(
    service_id=SERVICE_ID,
    name="Air Quality & UV Health Microservice",
    version=SERVICE_VERSION,
    bounded_context="Air Quality Status & Clean Air Guidance",
    endpoints=[
        "GET /api/v1/air-quality/current?lat=<lat>&lon=<lon>",
        "GET /api/v1/air-quality/health",
    ],
    store=_store,
    circuit_breaker=_cb,
)


def _fetch_json(url: str, timeout: float = 4.5) -> dict:
    req = urllib.request.Request(
        url, headers={"User-Agent": "AETHER-AirQuality-Microservice/1.0"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_air_quality_handler(
    lat: float, lon: float, correlation_id: str = None
) -> dict:
    t0 = time.time()
    cache_key = f"aq:{lat:.2f},{lon:.2f}"
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
                "current": "us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
            }
        )
        raw = _fetch_json(
            f"https://air-quality-api.open-meteo.com/v1/air-quality?{params}"
        )
        cur = raw.get("current") or {}
        us_aqi = int(cur.get("us_aqi") or 32)
        if us_aqi <= 50:
            label = "Good"
            advice = "Air is clean and fresh — ideal for outdoor walks and activities."
        elif us_aqi <= 100:
            label = "Moderate"
            advice = "Air quality is acceptable for most people."
        else:
            label = "Sensitive"
            advice = "Sensitive individuals should reduce prolonged outdoor exertion."

        return {
            "usAqi": us_aqi,
            "euAqi": int(cur.get("european_aqi") or 25),
            "label": label,
            "advice": advice,
            "pm2_5": float(cur.get("pm2_5") or 8.0),
            "pm10": float(cur.get("pm10") or 15.0),
        }

    def _fallback():
        return {
            "usAqi": 32,
            "euAqi": 24,
            "label": "Good",
            "advice": "Air is clean and fresh — ideal for outdoor walks and activities.",
            "pm2_5": 7.5,
            "pm10": 14.0,
        }

    data, degraded = _cb.execute(_upstream, _fallback)
    _store.set(cache_key, data, ttl_sec=600)
    dt = (time.time() - t0) * 1000
    REGISTRY.record_call(SERVICE_ID, dt, degraded)
    return create_envelope(SERVICE_ID, data, correlation_id, degraded, dt)


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

