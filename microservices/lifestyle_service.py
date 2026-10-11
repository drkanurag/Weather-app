"""
Lifestyle, Wardrobe & Daily Comfort Microservice (lifestyle-service v1.0.0)
Bounded Context:
- Human-Understandable Daily Advice (Umbrella Check, What to Wear, Sun Care, Outdoor Plans)
- Activity Suitability Scores (Walking/Running, Driving, Outdoor Dining, Photography)
- Isolated Lifestyle Cache Store & Circuit Breaker
"""
import time
from .registry_service import (
    REGISTRY,
    IsolatedServiceStore,
    CircuitBreaker,
    create_envelope,
)

SERVICE_ID = "lifestyle-service"
SERVICE_VERSION = "1.0.0"

_store = IsolatedServiceStore(SERVICE_ID, default_ttl_sec=300)
_cb = CircuitBreaker(SERVICE_ID, failure_threshold=3, recovery_timeout_sec=10.0)

REGISTRY.register(
    service_id=SERVICE_ID,
    name="Lifestyle, Wardrobe & Daily Comfort Microservice",
    version=SERVICE_VERSION,
    bounded_context="Umbrella Check, Clothing Guide & Outdoor Activity Advice",
    endpoints=[
        "GET /api/v1/lifestyle/recommendations?temp=<c>&rain_prob=<pct>&wind=<kmh>&uv=<uv>&humidity=<rh>",
        "GET /api/v1/lifestyle/health",
    ],
    store=_store,
    circuit_breaker=_cb,
)


def get_recommendations_handler(
    temp_c: float = 25.0,
    rain_prob: float = 15.0,
    wind_kmh: float = 10.0,
    uv_index: float = 4.0,
    humidity: float = 60.0,
    correlation_id: str = None,
) -> dict:
    t0 = time.time()
    cache_key = f"life:{round(temp_c)}:{round(rain_prob)}:{round(wind_kmh)}:{round(uv_index)}"
    cached = _store.get(cache_key)
    if cached is not None:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(SERVICE_ID, dt, False)
        return create_envelope(SERVICE_ID, cached, correlation_id, False, dt)

    def _compute():
        umbrella = (
            "Take an Umbrella"
            if rain_prob >= 40
            else "No Umbrella Needed"
        )
        if temp_c >= 28:
            clothing = "Light Cotton Clothes"
        elif temp_c >= 19:
            clothing = "Comfortable Casual Wear"
        elif temp_c >= 11:
            clothing = "Light Jacket or Hoodie"
        else:
            clothing = "Warm Coat & Layers"

        if uv_index >= 6:
            sun_care = "Wear Sunscreen & Sunglasses"
        elif uv_index >= 3:
            sun_care = "Sunglasses Recommended"
        else:
            sun_care = "Low UV — Safe Outside"

        if rain_prob >= 55:
            outdoor = "Better for Indoor Plans"
        elif 16 <= temp_c <= 31 and wind_kmh < 30:
            outdoor = "Great Weather to Go Out"
        else:
            outdoor = "Fair Outdoor Weather"

        return {
            "umbrellaAdvice": umbrella,
            "clothingAdvice": clothing,
            "sunCareAdvice": sun_care,
            "outdoorAdvice": outdoor,
            "summary": f"{clothing} recommended today. {umbrella}. {sun_care}.",
            "inputs": {
                "tempC": temp_c,
                "rainProb": rain_prob,
                "windKmh": wind_kmh,
                "uvIndex": uv_index,
                "humidity": humidity,
            },
        }

    data, degraded = _cb.execute(_compute, _compute)
    _store.set(cache_key, data, ttl_sec=300)
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

