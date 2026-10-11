"""
Location & Geolocation Microservice (location-service v1.0.0)
Bounded Context:
- Global City Search & Autocomplete
- Coordinate Reverse Geocoding
- Live Network IP Geolocation Detection
- Isolated Location Cache Store & Circuit Breaker
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

SERVICE_ID = "location-service"
SERVICE_VERSION = "1.0.0"

_store = IsolatedServiceStore(SERVICE_ID, default_ttl_sec=900)
_cb = CircuitBreaker(SERVICE_ID, failure_threshold=3, recovery_timeout_sec=15.0)

FALLBACK_CITIES = [
    {
        "id": "manipal-in",
        "name": "Manipal",
        "admin1": "Karnataka",
        "country": "India",
        "countryCode": "IN",
        "latitude": 13.3525,
        "longitude": 74.7928,
        "timezone": "Asia/Kolkata",
    },
    {
        "id": "udupi-in",
        "name": "Udupi",
        "admin1": "Karnataka",
        "country": "India",
        "countryCode": "IN",
        "latitude": 13.3409,
        "longitude": 74.7421,
        "timezone": "Asia/Kolkata",
    },
    {
        "id": "bengaluru-in",
        "name": "Bengaluru",
        "admin1": "Karnataka",
        "country": "India",
        "countryCode": "IN",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "timezone": "Asia/Kolkata",
    },
    {
        "id": "mumbai-in",
        "name": "Mumbai",
        "admin1": "Maharashtra",
        "country": "India",
        "countryCode": "IN",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "timezone": "Asia/Kolkata",
    },
    {
        "id": "new-york-us",
        "name": "New York",
        "admin1": "New York",
        "country": "United States",
        "countryCode": "US",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "timezone": "America/New_York",
    },
    {
        "id": "london-gb",
        "name": "London",
        "admin1": "England",
        "country": "United Kingdom",
        "countryCode": "GB",
        "latitude": 51.5074,
        "longitude": -0.1278,
        "timezone": "Europe/London",
    },
    {
        "id": "tokyo-jp",
        "name": "Tokyo",
        "admin1": "Tokyo",
        "country": "Japan",
        "countryCode": "JP",
        "latitude": 35.6762,
        "longitude": 139.6503,
        "timezone": "Asia/Tokyo",
    },
]


class _PrefixTrieNode:
    __slots__ = ("children", "items")

    def __init__(self):
        self.children = {}
        self.items = []


class PrefixTrie:
    """O(L) Prefix Tree for sub-millisecond city autocomplete."""

    def __init__(self):
        self.root = _PrefixTrieNode()

    def insert(self, city_obj: dict):
        name = (city_obj.get("name") or "").strip().lower()
        if not name:
            return
        node = self.root
        for ch in name:
            if ch not in node.children:
                node.children[ch] = _PrefixTrieNode()
            node = node.children[ch]
            if len(node.items) < 8 and not any(
                x.get("name") == city_obj.get("name")
                and x.get("countryCode") == city_obj.get("countryCode")
                for x in node.items
            ):
                node.items.append(city_obj)

    def search_prefix(self, prefix: str) -> list:
        clean = (prefix or "").strip().lower()
        if not clean:
            return []
        node = self.root
        for ch in clean:
            if ch not in node.children:
                return []
            node = node.children[ch]
        return list(node.items)


_CITY_TRIE = PrefixTrie()
for _c in FALLBACK_CITIES:
    _CITY_TRIE.insert(_c)

REGISTRY.register(
    service_id=SERVICE_ID,
    name="Location & Geolocation Microservice",
    version=SERVICE_VERSION,
    bounded_context="O(L) Prefix Trie Search, O(log N) Reverse Geocoding & Live IP Location",
    endpoints=[
        "GET /api/v1/location/search?q=<city>",
        "GET /api/v1/location/reverse?lat=<lat>&lon=<lon>",
        "GET /api/v1/location/ip-detect",
        "GET /api/v1/location/health",
    ],
    store=_store,
    circuit_breaker=_cb,
)


def _fetch_json(url: str, timeout: float = 4.5) -> dict:
    req = urllib.request.Request(
        url, headers={"User-Agent": "AETHER-Location-Microservice/1.0"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search_cities_handler(query: str, correlation_id: str = None) -> dict:
    t0 = time.time()
    q = (query or "").strip()
    if len(q) < 2:
        return create_envelope(SERVICE_ID, {"results": []}, correlation_id, False, 0.2)

    cache_key = f"search:{q.lower()}"
    cached = _store.get(cache_key)
    if cached is not None:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(SERVICE_ID, dt, False)
        return create_envelope(
            SERVICE_ID,
            {"results": cached, "cached": True, "algorithm": "O(1) LRU Cache Hit"},
            correlation_id,
            False,
            dt,
        )

    trie_hits = _CITY_TRIE.search_prefix(q)

    def _upstream():
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(q)}&count=8&language=en&format=json"
        raw = _fetch_json(url)
        items = raw.get("results") or []
        results = list(trie_hits)
        for r in items:
            entry = {
                "id": f"{r.get('latitude')},{r.get('longitude')}",
                "name": r.get("name"),
                "admin1": r.get("admin1") or "",
                "country": r.get("country") or "",
                "countryCode": (r.get("country_code") or "GL").upper(),
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude"),
                "elevation": r.get("elevation") or 0,
                "timezone": r.get("timezone") or "auto",
            }
            _CITY_TRIE.insert(entry)
            if not any(
                x.get("name") == entry["name"]
                and x.get("countryCode") == entry["countryCode"]
                for x in results
            ):
                results.append(entry)
        return results

    def _fallback():
        if trie_hits:
            return trie_hits
        ql = q.lower()
        return [
            c
            for c in FALLBACK_CITIES
            if ql in c["name"].lower() or ql in c["country"].lower()
        ] or FALLBACK_CITIES[:4]

    results, degraded = _cb.execute(_upstream, _fallback)
    _store.set(cache_key, results)
    dt = (time.time() - t0) * 1000
    REGISTRY.record_call(SERVICE_ID, dt, degraded)
    return create_envelope(
        SERVICE_ID,
        {"results": results, "cached": False, "algorithm": "O(L) Prefix Trie + Upstream"},
        correlation_id,
        degraded,
        dt,
    )


def reverse_geocode_handler(lat: float, lon: float, correlation_id: str = None) -> dict:
    t0 = time.time()
    cache_key = f"rev:{lat:.3f},{lon:.3f}"
    cached = _store.get(cache_key)
    if cached is not None:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(SERVICE_ID, dt, False)
        return create_envelope(SERVICE_ID, cached, correlation_id, False, dt)

    def _upstream():
        url = (
            f"https://api.bigdatacloud.net/data/reverse-geocode-client"
            f"?latitude={lat}&longitude={lon}&localityLanguage=en"
        )
        raw = _fetch_json(url)
        name = (
            raw.get("city")
            or raw.get("locality")
            or raw.get("principalSubdivision")
            or "Selected Location"
        )
        return {
            "id": f"{lat:.4f},{lon:.4f}",
            "name": name,
            "admin1": raw.get("principalSubdivision") or "",
            "country": raw.get("countryName") or "",
            "countryCode": (raw.get("countryCode") or "GL").upper(),
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
        }

    def _fallback():
        return {
            "id": f"{lat:.4f},{lon:.4f}",
            "name": f"Location ({lat:.2f}°, {lon:.2f}°)",
            "admin1": "",
            "country": "",
            "countryCode": "GL",
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
        }

    loc, degraded = _cb.execute(_upstream, _fallback)
    _store.set(cache_key, loc)
    dt = (time.time() - t0) * 1000
    REGISTRY.record_call(SERVICE_ID, dt, degraded)
    return create_envelope(SERVICE_ID, loc, correlation_id, degraded, dt)


def ip_detect_handler(correlation_id: str = None) -> dict:
    t0 = time.time()
    cached = _store.get("ip_live_location")
    if cached is not None:
        dt = (time.time() - t0) * 1000
        REGISTRY.record_call(SERVICE_ID, dt, False)
        return create_envelope(SERVICE_ID, cached, correlation_id, False, dt)

    def _upstream():
        raw = _fetch_json("https://ipwho.is/")
        if not raw.get("success", True) or not raw.get("latitude"):
            raise ValueError("IP lookup failed")
        return {
            "id": f"{raw['latitude']:.4f},{raw['longitude']:.4f}",
            "name": raw.get("city") or "Current Location",
            "admin1": raw.get("region") or "",
            "country": raw.get("country") or "",
            "countryCode": (raw.get("country_code") or "GL").upper(),
            "latitude": float(raw["latitude"]),
            "longitude": float(raw["longitude"]),
            "timezone": (raw.get("timezone") or {}).get("id") or "auto",
            "source": "Live Network Location",
        }

    def _fallback():
        return {**FALLBACK_CITIES[0], "source": "Default Location"}

    loc, degraded = _cb.execute(_upstream, _fallback)
    _store.set("ip_live_location", loc, ttl_sec=300)
    dt = (time.time() - t0) * 1000
    REGISTRY.record_call(SERVICE_ID, dt, degraded)
    return create_envelope(SERVICE_ID, loc, correlation_id, degraded, dt)


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

