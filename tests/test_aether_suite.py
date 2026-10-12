"""
AETHER — Automated Unit, Integration & Fault-Isolation Test Suite
Run with:
    python -m unittest discover -s tests -v
"""
import math
import os
import re
import time
import unittest

from atmospheric_engine import compute_atmospheric_physics
from microservices.registry_service import (
    IsolatedServiceStore,
    CircuitBreaker,
    TokenBucketRateLimiter,
    ConsistentHashRing,
)
from microservices.api_gateway import route_microservice_request


class TestAtmosphericEngine(unittest.TestCase):
    """Validates thermodynamic accuracy, physical invariants, WBGT disclaimers, and input validation."""

    def test_standard_conditions_and_wbgt_estimate_metadata(self):
        res = compute_atmospheric_physics(
            temp_c=28.0,
            humidity=65.0,
            pressure_hpa=1013.25,
            wind_kmh=12.0,
            solar_wm2=450.0,
            elevation_m=100.0,
        )
        # Physical invariant: Dew Point <= Wet Bulb <= Dry Bulb Temperature
        self.assertLessEqual(res["dewPointC"], res["wetBulbC"])
        self.assertLessEqual(res["wetBulbC"], 28.0)
        self.assertGreater(res["vpdKpa"], 0.0)
        self.assertGreater(res["airDensityKgM3"], 1.0)
        self.assertLess(res["airDensityKgM3"], 1.35)

        # WBGT must be explicitly marked as an estimate with disclaimer
        self.assertTrue(res["wbgtIsEstimate"])
        self.assertIn("Estimated", res["wbgtDisclaimer"])
        self.assertTrue(res["wbgtRisk"]["isEstimate"])

    def test_saturated_air_invariants(self):
        res = compute_atmospheric_physics(temp_c=20.0, humidity=100.0)
        self.assertAlmostEqual(res["dewPointC"], 20.0, delta=0.2)
        self.assertAlmostEqual(res["wetBulbC"], 20.0, delta=0.4)
        self.assertAlmostEqual(res["vpdKpa"], 0.0, delta=0.05)

    def test_input_validation_rejects_impossible_values(self):
        with self.assertRaises(ValueError):
            compute_atmospheric_physics(temp_c=120.0, humidity=50.0)
        with self.assertRaises(ValueError):
            compute_atmospheric_physics(temp_c=-110.0, humidity=50.0)
        with self.assertRaises(ValueError):
            compute_atmospheric_physics(temp_c=25.0, humidity=-5.0)
        with self.assertRaises(ValueError):
            compute_atmospheric_physics(temp_c=25.0, humidity=105.0)
        with self.assertRaises(ValueError):
            compute_atmospheric_physics(temp_c=25.0, humidity=50.0, pressure_hpa=100.0)
        with self.assertRaises(ValueError):
            compute_atmospheric_physics(temp_c=float("nan"), humidity=50.0)
        with self.assertRaises(ValueError):
            compute_atmospheric_physics(temp_c=None, humidity=50.0)


class TestMicroservicesResilienceAndDSA(unittest.TestCase):
    """Validates O(1) LRU cache expiry, Circuit Breaker state machine recovery, and API Gateway routing."""

    def test_lru_cache_hit_miss_and_ttl_expiry(self):
        store = IsolatedServiceStore("test-service", default_ttl_sec=1, max_capacity=3)
        store.set("k1", {"temp": 25}, ttl_sec=1)
        self.assertEqual(store.get("k1"), {"temp": 25})
        self.assertIsNone(store.get("nonexistent"))

        # Capacity eviction of LRU item
        store.set("k2", {"temp": 26})
        store.set("k3", {"temp": 27})
        store.set("k4", {"temp": 28})
        self.assertEqual(store.stats()["cachedKeys"], 3)
        self.assertGreaterEqual(store.stats()["evictions"], 1)

    def test_circuit_breaker_fault_isolation_and_recovery(self):
        cb = CircuitBreaker("test-cb", failure_threshold=2, recovery_timeout_sec=0.15)
        self.assertEqual(cb.state, "CLOSED")

        def failing_call():
            raise RuntimeError("Simulated upstream timeout")

        def safe_fallback():
            return {"fallback": True}

        # 1st failure -> still CLOSED
        val1, deg1 = cb.execute(failing_call, safe_fallback)
        self.assertTrue(deg1)
        self.assertEqual(val1, {"fallback": True})
        self.assertEqual(cb.state, "CLOSED")

        # 2nd failure -> trips to OPEN
        val2, deg2 = cb.execute(failing_call, safe_fallback)
        self.assertTrue(deg2)
        self.assertEqual(cb.state, "OPEN")

        # Wait for recovery_timeout_sec -> transitions to HALF_OPEN then CLOSED on success
        time.sleep(0.2)
        val3, deg3 = cb.execute(lambda: {"ok": True}, safe_fallback)
        self.assertFalse(deg3)
        self.assertEqual(val3, {"ok": True})
        self.assertEqual(cb.state, "CLOSED")

    def test_token_bucket_and_consistent_hash_ring(self):
        limiter = TokenBucketRateLimiter(capacity=5, refill_rate_per_sec=10.0)
        allowed, rem = limiter.allow_request(1.0)
        self.assertTrue(allowed)
        self.assertLessEqual(rem, 4)

        ring = ConsistentHashRing(["node-a", "node-b", "node-c"], replicas=16)
        shard1 = ring.get_node("12.97,77.59")
        shard2 = ring.get_node("12.97,77.59")
        self.assertEqual(shard1, shard2)
        self.assertIn(shard1, ["node-a", "node-b", "node-c"])

    def test_gateway_health_and_domain_endpoints(self):
        endpoints = [
            "/api/v1/gateway/status",
            "/api/v1/location/health",
            "/api/v1/forecast/health",
            "/api/v1/air-quality/health",
            "/api/v1/lifestyle/health",
            "/api/v1/nowcast/health",
        ]
        for ep in endpoints:
            status, body, headers = route_microservice_request(
                ep, "", {"X-Correlation-ID": "test-cid-123"}
            )
            self.assertEqual(status, 200, f"Endpoint {ep} failed with {status}")
            self.assertEqual(headers.get("X-Correlation-ID"), "test-cid-123")
            self.assertEqual(body.get("meta", {}).get("correlationId"), "test-cid-123")
            self.assertIn("data", body)

    def test_lifestyle_and_nowcast_domain_services(self):
        status, body, _ = route_microservice_request(
            "/api/v1/lifestyle/recommendations",
            "temp=29&rain_prob=70&wind=15&uv=7&humidity=75",
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["data"]["umbrellaAdvice"], "Take an Umbrella")

        status2, body2, _ = route_microservice_request(
            "/api/v1/nowcast/brief",
            "city=Manipal&temp=28&feels=31&high=31&low=24&rain_prob=65&cond=Rain",
        )
        self.assertEqual(status2, 200)
        self.assertIn("aiWeatherBrief", body2["data"])
        self.assertEqual(len(body2["data"]["minuteCastSlots"]), 5)

    def test_forecast_date_validation_returns_400_on_unsupported_dates(self):
        # Date prior to 1950-01-01 must return 400 Bad Request
        status_old, body_old, _ = route_microservice_request(
            "/api/v1/forecast/date", "lat=12.97&lon=77.59&date=1920-05-01"
        )
        self.assertEqual(status_old, 400)
        self.assertEqual(body_old["data"]["code"], "BAD_REQUEST")

        # Date far beyond 16-day forecast limit must return 400 Bad Request
        status_fut, body_fut, _ = route_microservice_request(
            "/api/v1/forecast/date", "lat=12.97&lon=77.59&date=2099-01-01"
        )
        self.assertEqual(status_fut, 400)
        self.assertEqual(body_fut["data"]["code"], "BAD_REQUEST")


class TestRepositorySecurityHygiene(unittest.TestCase):
    """Ensures no hardcoded private API keys or credentials exist in source files."""

    def test_no_hardcoded_secret_keys(self):
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        secret_pattern = re.compile(r"(AIza[0-9A-Za-z\-_]{35}|sk-[0-9A-Za-z]{32,})")
        for subdir in ["src", "microservices"]:
            target = os.path.join(root_dir, subdir)
            for dirpath, _, filenames in os.walk(target):
                for fn in filenames:
                    if fn.endswith((".js", ".jsx", ".py")):
                        full_path = os.path.join(dirpath, fn)
                        with open(full_path, "r", encoding="utf-8") as f:
                            content = f.read()
                        self.assertIsNone(
                            secret_pattern.search(content),
                            f"Potential hardcoded secret detected in {full_path}",
                        )


if __name__ == "__main__":
    unittest.main()
