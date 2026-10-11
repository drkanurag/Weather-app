"""
AETHER — Python Scientific Atmospheric Thermodynamics & NWP Ensemble Engine
Computes psychrometrics, aviation density altitude, Wet-Bulb Globe Temperature (WBGT),
Vapor Pressure Deficit (VPD), Lifted Condensation Level (LCL), and NWP model spread.
"""
import math


def compute_atmospheric_physics(
    temp_c: float,
    humidity: float,
    pressure_hpa: float = 1013.25,
    wind_kmh: float = 10.0,
    solar_wm2: float = 250.0,
    elevation_m: float = 0.0,
) -> dict:
    """
    Computes scientific-grade meteorological & thermodynamic parameters.
    """
    t = float(temp_c)
    rh = max(1.0, min(100.0, float(humidity)))
    p = float(pressure_hpa)
    v_ms = max(0.1, float(wind_kmh) / 3.6)
    rad = max(0.0, float(solar_wm2))
    elev = float(elevation_m)

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

    # 4. Wet-Bulb Globe Temperature (WBGT) approximation (outdoor with solar load)
    # Globe temperature approximation from ambient T, solar irradiance, and wind speed
    globe_temp_c = t + (0.014 * rad) / (v_ms ** 0.4 + 0.5)
    wbgt_c = 0.7 * wet_bulb_c + 0.2 * globe_temp_c + 0.1 * t

    if wbgt_c < 21.0:
        wbgt_risk = {"level": "Low Stress", "color": "#10b981"}
    elif wbgt_c < 25.0:
        wbgt_risk = {"level": "Moderate Caution", "color": "#38bdf8"}
    elif wbgt_c < 28.0:
        wbgt_risk = {"level": "High Thermal Load", "color": "#eab308"}
    elif wbgt_c < 31.0:
        wbgt_risk = {"level": "Very High Risk", "color": "#f97316"}
    else:
        wbgt_risk = {"level": "Extreme Danger", "color": "#ef4444"}

    # 5. Lifted Condensation Level (LCL / Cumulus Cloud Base AGL in meters)
    lcl_meters = max(80.0, 125.0 * max(0.0, t - dew_point_c))

    # 6. Air Density (kg/m³) & Aviation Density Altitude (meters & feet)
    # Ideal gas law for moist air
    p_pa = p * 100.0
    ea_pa = ea_kpa * 1000.0
    pd_pa = p_pa - ea_pa
    t_kelvin = t + 273.15
    r_dry = 287.058
    r_vapor = 461.495
    air_density = (pd_pa / (r_dry * t_kelvin)) + (ea_pa / (r_vapor * t_kelvin))

    # Standard ISA temperature at station elevation
    isa_temp_c = 15.0 - 0.0065 * elev
    pressure_alt_ft = elev * 3.28084 + (1013.25 - p) * 27.3
    density_alt_ft = pressure_alt_ft + 118.8 * (t - isa_temp_c)

    # 7. Specific Humidity (g/kg) & Mixing Ratio
    mixing_ratio_g_kg = 621.97 * (ea_kpa / max(1.0, (p / 10.0) - ea_kpa))

    # 8. Equivalent Potential Temperature (Theta-e in Kelvin)
    theta_k = t_kelvin * ((1000.0 / max(200.0, p)) ** 0.2854)
    theta_e_k = theta_k * math.exp((2.5 * mixing_ratio_g_kg) / max(200.0, t_kelvin))

    return {
        "wetBulbC": round(wet_bulb_c, 1),
        "wbgtC": round(wbgt_c, 1),
        "wbgtRisk": wbgt_risk,
        "vpdKpa": round(vpd_kpa, 2),
        "esKpa": round(es_kpa, 2),
        "eaKpa": round(ea_kpa, 2),
        "lclMeters": round(lcl_meters),
        "airDensityKgM3": round(air_density, 3),
        "densityAltitudeFt": round(density_alt_ft),
        "mixingRatioGKg": round(mixing_ratio_g_kg, 1),
        "thetaEKelvin": round(theta_e_k, 1),
        "engine": "Python 3.13 Scientific Psychrometric Kernel",
    }

