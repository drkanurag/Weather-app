"""
AETHER — Python Scientific Atmospheric Thermodynamics & Psychrometric Engine

References & Valid Operating Ranges:
1. Saturation & Actual Vapor Pressure (es, ea) & Dew Point (Td):
   - Formula: Magnus-Tetens approximation (Murray 1967 / Alduchov & Eskridge 1996).
   - Valid range: -45°C to +60°C; Units: kPa, °C.
2. Wet-Bulb Temperature (Tw):
   - Formula: Roland Stull (2011), "Wet-Bulb Temperature from Relative Humidity and Air Temperature",
     Journal of Applied Meteorology and Climatology, 50(11), 2267–2269.
   - Valid range: -20°C <= T <= 50°C, 5% <= RH <= 99% at standard sea-level pressure.
3. Wet-Bulb Globe Temperature (WBGT) — ESTIMATED APPROXIMATION:
   - IMPORTANT DISCLAIMER: True WBGT requires a physical 150 mm black-globe thermometer and natural
     wet-bulb sensor. This module computes an empirical meteorological *estimate* from ambient air
     temperature, Stull wet-bulb temperature, shortwave solar irradiance (W/m²), and 10m wind speed.
   - Do NOT treat this value as a direct physical measurement or use it as the sole basis for
     safety-critical occupational, military, or athletic heat-stress decisions.
4. Lifted Condensation Level (LCL):
   - Formula: Espy's approximation (LCL_m ≈ 125 * (T - Td)).
5. Moist Air Density & Aviation Density Altitude:
   - Ideal gas law for moist air (R_d = 287.058 J/(kg·K), R_v = 461.495 J/(kg·K)) & ICAO ISA profile.
"""
import math
from typing import Any, Dict

VALID_BOUNDS = {
    "temp_c": (-90.0, 65.0, "°C"),
    "humidity": (0.0, 100.0, "%"),
    "pressure_hpa": (300.0, 1100.0, "hPa"),
    "wind_kmh": (0.0, 450.0, "km/h"),
    "solar_wm2": (0.0, 1500.0, "W/m²"),
    "elevation_m": (-500.0, 9000.0, "m"),
}

WBGT_ESTIMATE_DISCLAIMER = (
    "Estimated from meteorological inputs (air temperature, humidity, wind speed, and solar irradiance) "
    "rather than a physical black-globe thermometer. For informational guidance only; do not use as the "
    "sole basis for safety-critical decisions."
)


def _validate_float(name: str, val: Any) -> float:
    """Validates that an input is a finite float within physically realistic terrestrial bounds."""
    if val is None or isinstance(val, bool):
        raise ValueError(f"Invalid {name}: expected a numeric value, got {val!r}.")
    try:
        num = float(val)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {name}: could not convert {val!r} to float.") from exc

    if math.isnan(num) or math.isinf(num):
        raise ValueError(f"Invalid {name}: value must be finite, got {num}.")

    low, high, unit = VALID_BOUNDS[name]
    if num < low or num > high:
        raise ValueError(
            f"Out-of-range {name}: {num} {unit} is outside valid physical bounds [{low}, {high}] {unit}."
        )
    return num


def compute_atmospheric_physics(
    temp_c: float,
    humidity: float,
    pressure_hpa: float = 1013.25,
    wind_kmh: float = 10.0,
    solar_wm2: float = 250.0,
    elevation_m: float = 0.0,
) -> Dict[str, Any]:
    """
    Computes validated meteorological & thermodynamic parameters with explicit uncertainty
    and estimation metadata.
    """
    t = _validate_float("temp_c", temp_c)
    rh_raw = _validate_float("humidity", humidity)
    p = _validate_float("pressure_hpa", pressure_hpa)
    wind = _validate_float("wind_kmh", wind_kmh)
    rad = _validate_float("solar_wm2", solar_wm2)
    elev = _validate_float("elevation_m", elevation_m)

    # Clamp RH away from 0% for logarithm stability in Magnus-Tetens equation
    rh = max(1.0, min(100.0, rh_raw))
    v_ms = max(0.1, wind / 3.6)

    # 1. Saturation Vapor Pressure (es) & Actual Vapor Pressure (ea) in kPa (Magnus-Tetens)
    es_kpa = 0.61078 * math.exp((17.27 * t) / (t + 237.3))
    ea_kpa = es_kpa * (rh / 100.0)
    vpd_kpa = max(0.0, es_kpa - ea_kpa)

    # 2. Dew Point Temperature (Td) in °C
    alpha = ((17.27 * t) / (237.3 + t)) + math.log(rh / 100.0)
    dew_point_c = (237.3 * alpha) / (17.27 - alpha)

    # 3. Wet-Bulb Temperature (Tw) in °C (Roland Stull 2011 empirical formula)
    wet_bulb_c = (
        t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
        + math.atan(t + rh)
        - math.atan(rh - 1.676331)
        + 0.00391838 * (rh ** 1.5) * math.atan(0.023101 * rh)
        - 4.686035
    )
    # Physical constraint: wet-bulb cannot exceed dry-bulb temperature or fall below dew point
    wet_bulb_c = min(t, max(dew_point_c, wet_bulb_c))

    # 4. Estimated Wet-Bulb Globe Temperature (WBGT) approximation (outdoor with solar load)
    globe_temp_c = t + (0.014 * rad) / (v_ms ** 0.4 + 0.5)
    wbgt_c = 0.7 * wet_bulb_c + 0.2 * globe_temp_c + 0.1 * t

    if wbgt_c < 21.0:
        wbgt_risk = {"level": "Low Stress (Estimated)", "color": "#10b981", "isEstimate": True}
    elif wbgt_c < 25.0:
        wbgt_risk = {"level": "Moderate Caution (Estimated)", "color": "#38bdf8", "isEstimate": True}
    elif wbgt_c < 28.0:
        wbgt_risk = {"level": "High Thermal Load (Estimated)", "color": "#eab308", "isEstimate": True}
    elif wbgt_c < 31.0:
        wbgt_risk = {"level": "Very High Risk (Estimated)", "color": "#f97316", "isEstimate": True}
    else:
        wbgt_risk = {"level": "Extreme Danger (Estimated)", "color": "#ef4444", "isEstimate": True}

    # 5. Lifted Condensation Level (LCL / Cumulus Cloud Base AGL in meters)
    lcl_meters = max(80.0, 125.0 * max(0.0, t - dew_point_c))

    # 6. Air Density (kg/m³) & Aviation Density Altitude (feet)
    p_pa = p * 100.0
    ea_pa = ea_kpa * 1000.0
    pd_pa = max(0.0, p_pa - ea_pa)
    t_kelvin = t + 273.15
    r_dry = 287.058
    r_vapor = 461.495
    air_density = (pd_pa / (r_dry * t_kelvin)) + (ea_pa / (r_vapor * t_kelvin))

    # Standard ISA temperature at station elevation
    isa_temp_c = 15.0 - 0.0065 * elev
    pressure_alt_ft = elev * 3.28084 + (1013.25 - p) * 27.3
    density_alt_ft = pressure_alt_ft + 118.8 * (t - isa_temp_c)

    # 7. Specific Humidity / Mixing Ratio (g/kg)
    mixing_ratio_g_kg = 621.97 * (ea_kpa / max(1.0, (p / 10.0) - ea_kpa))

    # 8. Equivalent Potential Temperature (Theta-e in Kelvin)
    theta_k = t_kelvin * ((1000.0 / max(200.0, p)) ** 0.2854)
    theta_e_k = theta_k * math.exp((2.5 * mixing_ratio_g_kg) / max(200.0, t_kelvin))

    stull_in_optimal_domain = (-20.0 <= t <= 50.0) and (5.0 <= rh_raw <= 99.0)

    return {
        "dewPointC": round(dew_point_c, 1),
        "wetBulbC": round(wet_bulb_c, 1),
        "wbgtC": round(wbgt_c, 1),
        "wbgtIsEstimate": True,
        "wbgtDisclaimer": WBGT_ESTIMATE_DISCLAIMER,
        "wbgtRisk": wbgt_risk,
        "vpdKpa": round(vpd_kpa, 2),
        "esKpa": round(es_kpa, 2),
        "eaKpa": round(ea_kpa, 2),
        "lclMeters": round(lcl_meters),
        "airDensityKgM3": round(air_density, 3),
        "densityAltitudeFt": round(density_alt_ft),
        "mixingRatioGKg": round(mixing_ratio_g_kg, 1),
        "thetaEKelvin": round(theta_e_k, 1),
        "stullDomainValid": stull_in_optimal_domain,
        "engine": "Python Scientific Psychrometric Kernel (Validated)",
    }
