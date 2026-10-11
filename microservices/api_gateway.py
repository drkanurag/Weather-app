"""
API Gateway & BFF (Backend-For-Frontend) Router (api-gateway v1.0.0)
Enforces Microservices Rules & Regulations:
- Single Unified Entry Point for Frontend Clients (/api/v1/...)
- Request Correlation ID Propagation (X-Correlation-ID)
- Decentralized Routing to Independent Domain Microservices:
  1. location-service
  2. forecast-service
  3. air-quality-service
  4. lifestyle-service
  5. registry-service
"""
import time
import uuid
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from .registry_service import REGISTRY, create_envelope
from . import (
    location_service,
    forecast_service,
    air_quality_service,
    lifestyle_service,
    nowcast_service,
)

GATEWAY_ID = "api-gateway"
GATEWAY_VERSION = "1.0.0"

# Shared ThreadPoolExecutor for BFF Parallel Scatter-Gather Fan-Out
_SCATTER_GATHER_POOL = ThreadPoolExecutor(max_workers=8)

REGISTRY.register(
    service_id=GATEWAY_ID,
    name="API Gateway & BFF Orchestrator",
    version=GATEWAY_VERSION,
    bounded_context="Token Bucket Rate Limiting, Consistent Hash Sharding & Scatter-Gather BFF",
    endpoints=[
        "GET /api/v1/gateway/status",
        "GET /api/v1/gateway/weather-bundle?lat=<lat>&lon=<lon>&tz=<tz>",
        "GET /api/v1/location/*",
        "GET /api/v1/forecast/*",
        "GET /api/v1/air-quality/*",
        "GET /api/v1/lifestyle/*",
        "GET /api/v1/nowcast/*",
    ],
)


def route_microservice_request(path: str, query_string: str, headers: dict = None):
    """
    Routes any /api/v1/* request through the API Gateway to its owning microservice.
    Enforces Token Bucket Rate Limiting, Consistent Hash Ring Sharding, and Bulkhead Isolation.
    """
    if not path.startswith("/api/v1/"):
        return None

    t0 = time.time()
    qs = urllib.parse.parse_qs(query_string or "")
    correlation_id = (
        (headers or {}).get("X-Correlation-ID")
        or (qs.get("cid", [None])[0])
        or f"cid-{uuid.uuid4().hex[:10]}"
    )

    # 1. System Design: O(1) Token Bucket Rate Limiter
    allowed, remaining_tokens = REGISTRY.rate_limiter.allow_request(1.0)
    shard_key = f"{path}:{query_string or ''}"
    shard_node = REGISTRY.hash_ring.get_node(shard_key)

    resp_headers = {
        "X-Correlation-ID": correlation_id,
        "X-API-Gateway": f"{GATEWAY_ID}/{GATEWAY_VERSION}",
        "X-Consistent-Hash-Shard": shard_node,
        "X-RateLimit-Limit": str(REGISTRY.rate_limiter.capacity),
        "X-RateLimit-Remaining": str(remaining_tokens),
        "X-RateLimit-Policy": "TokenBucket;burst=120;rate=25/s",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    }

    if not allowed:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(GATEWAY_ID, dt, True)
        return (
            429,
            create_envelope(
                GATEWAY_ID,
                {"error": "Rate limit exceeded (Token Bucket). Please retry shortly."},
                correlation_id,
                True,
                dt,
            ),
            resp_headers,
        )

    # 2. System Design: Bulkhead Concurrency Pool
    if not REGISTRY.bulkhead.acquire():
        dt = (time.time() - t0) * 1000
        return (
            503,
            create_envelope(
                GATEWAY_ID,
                {"error": "Bulkhead concurrency pool saturated."},
                correlation_id,
                True,
                dt,
            ),
            resp_headers,
        )

    try:
        # 1. Gateway Status & Service Registry Discovery
        if path in (
            "/api/v1/gateway/status",
            "/api/v1/registry/services",
            "/api/v1/registry/health",
        ):
            snap = REGISTRY.get_registry_snapshot()
            dt = (time.time() - t0) * 1000
            REGISTRY.record_call(GATEWAY_ID, dt, False)
            resp_headers["X-Routed-Service"] = "registry-service"
            return (
                200,
                create_envelope(GATEWAY_ID, snap, correlation_id, False, dt),
                resp_headers,
            )

        # 2. Location Microservice Routes
        if path == "/api/v1/location/search":
            q = qs.get("q", qs.get("name", [""]))[0]
            res = location_service.search_cities_handler(q, correlation_id)
            REGISTRY.record_call(GATEWAY_ID, (time.time() - t0) * 1000, False)
            resp_headers["X-Routed-Service"] = location_service.SERVICE_ID
            return 200, res, resp_headers

        if path == "/api/v1/location/reverse":
            lat = float(qs.get("lat", [13.3525])[0])
            lon = float(qs.get("lon", [74.7928])[0])
            res = location_service.reverse_geocode_handler(lat, lon, correlation_id)
            REGISTRY.record_call(GATEWAY_ID, (time.time() - t0) * 1000, False)
            resp_headers["X-Routed-Service"] = location_service.SERVICE_ID
            return 200, res, resp_headers

        if path == "/api/v1/location/ip-detect":
            res = location_service.ip_detect_handler(correlation_id)
            REGISTRY.record_call(GATEWAY_ID, (time.time() - t0) * 1000, False)
            resp_headers["X-Routed-Service"] = location_service.SERVICE_ID
            return 200, res, resp_headers

        if path == "/api/v1/location/health":
            res = location_service.health_handler(correlation_id)
            resp_headers["X-Routed-Service"] = location_service.SERVICE_ID
            return 200, res, resp_headers

        # 3. Forecast Microservice Routes
        if path == "/api/v1/forecast/current":
            lat = float(qs.get("lat", [13.3525])[0])
            lon = float(qs.get("lon", [74.7928])[0])
            tz = qs.get("tz", ["auto"])[0]
            res = forecast_service.get_forecast_handler(lat, lon, tz, correlation_id)
            REGISTRY.record_call(GATEWAY_ID, (time.time() - t0) * 1000, False)
            resp_headers["X-Routed-Service"] = forecast_service.SERVICE_ID
            return 200, res, resp_headers

        if path == "/api/v1/forecast/date":
            lat = float(qs.get("lat", [13.3525])[0])
            lon = float(qs.get("lon", [74.7928])[0])
            date_str = qs.get("date", [""])[0]
            tz = qs.get("tz", ["auto"])[0]
            res = forecast_service.get_custom_date_handler(
                lat, lon, date_str, tz, correlation_id
            )
            REGISTRY.record_call(GATEWAY_ID, (time.time() - t0) * 1000, False)
            resp_headers["X-Routed-Service"] = forecast_service.SERVICE_ID
            return 200, res, resp_headers

        if path == "/api/v1/forecast/health":
            res = forecast_service.health_handler(correlation_id)
            resp_headers["X-Routed-Service"] = forecast_service.SERVICE_ID
            return 200, res, resp_headers

        # 4. Air Quality Microservice Routes
        if path == "/api/v1/air-quality/current":
            lat = float(qs.get("lat", [13.3525])[0])
            lon = float(qs.get("lon", [74.7928])[0])
            res = air_quality_service.get_air_quality_handler(lat, lon, correlation_id)
            REGISTRY.record_call(GATEWAY_ID, (time.time() - t0) * 1000, False)
            resp_headers["X-Routed-Service"] = air_quality_service.SERVICE_ID
            return 200, res, resp_headers

        if path == "/api/v1/air-quality/health":
            res = air_quality_service.health_handler(correlation_id)
            resp_headers["X-Routed-Service"] = air_quality_service.SERVICE_ID
            return 200, res, resp_headers

        # 5. Lifestyle & Wardrobe Microservice Routes
        if path == "/api/v1/lifestyle/recommendations":
            temp = float(qs.get("temp", [25.0])[0])
            rain_prob = float(qs.get("rain_prob", [15.0])[0])
            wind = float(qs.get("wind", [10.0])[0])
            uv = float(qs.get("uv", [4.0])[0])
            humidity = float(qs.get("humidity", [60.0])[0])
            res = lifestyle_service.get_recommendations_handler(
                temp, rain_prob, wind, uv, humidity, correlation_id
            )
            REGISTRY.record_call(GATEWAY_ID, (time.time() - t0) * 1000, False)
            resp_headers["X-Routed-Service"] = lifestyle_service.SERVICE_ID
            return 200, res, resp_headers

        if path == "/api/v1/lifestyle/health":
            res = lifestyle_service.health_handler(correlation_id)
            resp_headers["X-Routed-Service"] = lifestyle_service.SERVICE_ID
            return 200, res, resp_headers

        # 6. Nowcast & AI Weather Brief Microservice Routes (Pixel Weather AI Brief + MinuteCast)
        if path == "/api/v1/nowcast/brief":
            city = qs.get("city", ["Your Location"])[0]
            temp = float(qs.get("temp", [26.0])[0])
            feels = float(qs.get("feels", [28.0])[0])
            high = float(qs.get("high", [30.0])[0])
            low = float(qs.get("low", [22.0])[0])
            rain_prob = float(qs.get("rain_prob", [15.0])[0])
            precip_mm = float(qs.get("precip_mm", [0.0])[0])
            wind = float(qs.get("wind", [10.0])[0])
            humidity = float(qs.get("humidity", [65.0])[0])
            cond = qs.get("cond", ["Partly Cloudy"])[0]
            res = nowcast_service.get_nowcast_brief_handler(
                city=city,
                temp_c=temp,
                feels_c=feels,
                high_c=high,
                low_c=low,
                rain_prob=rain_prob,
                precip_mm=precip_mm,
                wind_kmh=wind,
                humidity=humidity,
                cond_label=cond,
                correlation_id=correlation_id,
            )
            REGISTRY.record_call(GATEWAY_ID, (time.time() - t0) * 1000, False)
            resp_headers["X-Routed-Service"] = nowcast_service.SERVICE_ID
            return 200, res, resp_headers

        if path == "/api/v1/nowcast/health":
            res = nowcast_service.health_handler(correlation_id)
            resp_headers["X-Routed-Service"] = nowcast_service.SERVICE_ID
            return 200, res, resp_headers

        # 7. Gateway BFF Composite Weather Bundle (Parallel Scatter-Gather Fan-Out)
        if path == "/api/v1/gateway/weather-bundle":
            lat = float(qs.get("lat", [13.3525])[0])
            lon = float(qs.get("lon", [74.7928])[0])
            tz = qs.get("tz", ["auto"])[0]

            # Parallel Scatter-Gather Fan-Out across Forecast & Air Quality microservices
            fc_future = _SCATTER_GATHER_POOL.submit(
                forecast_service.get_forecast_handler, lat, lon, tz, correlation_id
            )
            aq_future = _SCATTER_GATHER_POOL.submit(
                air_quality_service.get_air_quality_handler, lat, lon, correlation_id
            )
            fc_env = fc_future.result(timeout=6.0)
            aq_env = aq_future.result(timeout=6.0)

            fc_cur = (fc_env.get("data") or {}).get("current") or {}
            temp_c = float(fc_cur.get("temperature_2m") or 25.0)
            wind_kmh = float(fc_cur.get("wind_speed_10m") or 10.0)
            humidity = float(fc_cur.get("relative_humidity_2m") or 60.0)

            life_env = lifestyle_service.get_recommendations_handler(
                temp_c=temp_c,
                rain_prob=20.0,
                wind_kmh=wind_kmh,
                uv_index=4.0,
                humidity=humidity,
                correlation_id=correlation_id,
            )

            dt = (time.time() - t0) * 1000
            REGISTRY.record_call(GATEWAY_ID, dt, False)
            resp_headers["X-Routed-Service"] = (
                "forecast-service,air-quality-service,lifestyle-service"
            )
            return (
                200,
                create_envelope(
                    GATEWAY_ID,
                    {
                        "shardNode": shard_node,
                        "executionMode": "Parallel Scatter-Gather Fan-Out",
                        "forecastService": fc_env,
                        "airQualityService": aq_env,
                        "lifestyleService": life_env,
                    },
                    correlation_id,
                    False,
                    dt,
                ),
                resp_headers,
            )

        return (
            404,
            create_envelope(
                GATEWAY_ID,
                {"error": f"Unknown microservice route: {path}"},
                correlation_id,
                True,
                (time.time() - t0) * 1000,
            ),
            resp_headers,
        )

    except Exception as exc:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(GATEWAY_ID, dt, True)
        return (
            500,
            create_envelope(
                GATEWAY_ID,
                {"error": str(exc)},
                correlation_id,
                True,
                dt,
            ),
            resp_headers,
        )
    finally:
        REGISTRY.bulkhead.release()

