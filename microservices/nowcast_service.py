"""
Nowcast & AI Weather Brief Microservice (nowcast-brief-service v1.0.0)
Inspired by Google Pixel Weather AI Summary & AccuWeather 60-Minute MinuteCast:
Bounded Context:
- Natural-Language Conversational Daily Weather Brief (Pixel Weather style)
- Next-60-Minutes Hyperlocal Precipitation & Sky MinuteCast (Now, +15m, +30m, +45m, +60m)
- Apple iOS 18 Contextual "Feels Like" Explanation
- Isolated Nowcast Cache Store & Circuit Breaker
"""
import time
from .registry_service import (
    REGISTRY,
    IsolatedServiceStore,
    CircuitBreaker,
    create_envelope,
)

SERVICE_ID = "nowcast-brief-service"
SERVICE_VERSION = "1.0.0"

_store = IsolatedServiceStore(SERVICE_ID, default_ttl_sec=180)
_cb = CircuitBreaker(SERVICE_ID, failure_threshold=3, recovery_timeout_sec=10.0)

REGISTRY.register(
    service_id=SERVICE_ID,
    name="MinuteCast & AI Weather Brief Service",
    version=SERVICE_VERSION,
    bounded_context="60-Minute Rain Tracker & Natural-Language Daily Summary",
    endpoints=[
        "GET /api/v1/nowcast/brief?city=<name>&temp=<c>&feels=<c>&high=<c>&low=<c>&rain_prob=<pct>&wind=<kmh>&humidity=<rh>&cond=<label>",
        "GET /api/v1/nowcast/health",
    ],
    store=_store,
    circuit_breaker=_cb,
)


def get_nowcast_brief_handler(
    city: str = "Your Location",
    temp_c: float = 26.0,
    feels_c: float = 28.0,
    high_c: float = 30.0,
    low_c: float = 22.0,
    rain_prob: float = 15.0,
    precip_mm: float = 0.0,
    wind_kmh: float = 10.0,
    humidity: float = 65.0,
    cond_label: str = "Partly Cloudy",
    correlation_id: str = None,
) -> dict:
    t0 = time.time()
    cache_key = f"nc:{city}:{round(temp_c)}:{round(rain_prob)}:{cond_label}"
    cached = _store.get(cache_key)
    if cached is not None:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(SERVICE_ID, dt, False)
        return create_envelope(SERVICE_ID, cached, correlation_id, False, dt)

    def _compute():
        diff = round(feels_c - temp_c)
        if diff >= 2:
            feels_reason = f"Feels {diff}° warmer because of {round(humidity)}% humidity"
        elif diff <= -2:
            feels_reason = f"Feels {abs(diff)}° cooler due to a {round(wind_kmh)} km/h breeze"
        else:
            feels_reason = "Feels right around the actual temperature"

        # MinuteCast 60-minute 5-step projection (Now, +15m, +30m, +45m, +60m)
        offsets = [0, 15, 30, 45, 60]
        minutecast = []
        for m in offsets:
            slot_prob = max(
                0,
                min(
                    100,
                    int(
                        round(
                            rain_prob
                            + (4 if m in (30, 45) and rain_prob >= 25 else 0)
                        )
                    ),
                ),
            )
            if slot_prob >= 60 or precip_mm > 0.5:
                state = "Rain Likely"
                bar_pct = max(55, slot_prob)
            elif slot_prob >= 30:
                state = "Light Drop Chance"
                bar_pct = slot_prob
            else:
                state = "Dry Sky"
                bar_pct = max(8, slot_prob)

            minutecast.append(
                {
                    "label": "Now" if m == 0 else f"+{m} min",
                    "rainProb": slot_prob,
                    "state": state,
                    "barPct": bar_pct,
                }
            )

        if rain_prob >= 55 or precip_mm > 0.4:
            headline = "Rain expected in the area — keep an umbrella with you"
        elif rain_prob >= 30:
            headline = "Mostly dry right now, with a slight chance of passing showers"
        else:
            headline = "No rain expected in the next 60 minutes — clear to step outside"

        umbrella_tip = (
            "Carry an umbrella today."
            if rain_prob >= 40
            else "No umbrella needed."
        )
        wear_tip = (
            "Light breathable clothing is best."
            if temp_c >= 27
            else "Comfortable everyday wear works great."
            if temp_c >= 18
            else "Wear a cozy jacket or warm layer."
        )

        ai_brief = (
            f"In {city}, it is currently {round(temp_c)}°C with {cond_label.lower()} skies "
            f"({feels_reason.lower()}). Expect a daytime high of {round(high_c)}°C and a low of {round(low_c)}°C. "
            f"{headline}. {umbrella_tip} {wear_tip}"
        )

        return {
            "aiWeatherBrief": ai_brief,
            "feelsLikeContext": feels_reason,
            "minuteCastHeadline": headline,
            "minuteCastSlots": minutecast,
        }

    data, degraded = _cb.execute(_compute, _compute)
    _store.set(cache_key, data, ttl_sec=180)
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

