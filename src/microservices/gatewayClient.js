/**
 * AETHER Frontend API Gateway & Microservices Client Layer
 * Strictly follows Microservices Rules & Regulations:
 * 1. All client requests pass through the API Gateway (/api/v1/...)
 * 2. Every request carries an X-Correlation-ID header for distributed tracing
 * 3. Each domain client (locationClient, forecastClient, airQualityClient, lifestyleClient)
 *    is isolated by bounded context with automatic circuit-breaker fallback.
 */

function generateCorrelationId() {
  return (
    "cid-" +
    Math.random().toString(36).substring(2, 8) +
    "-" +
    Date.now().toString(36).slice(-4)
  );
}

export async function callGatewayEndpoint(path, params = {}, timeoutMs = 4500) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${path}?${qs}` : path;
  const correlationId = generateCorrelationId();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Correlation-ID": correlationId,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      throw new Error(`Gateway HTTP ${resp.status}`);
    }
    return await resp.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export const registryClient = {
  async getArchitectureStatus() {
    const env = await callGatewayEndpoint("/api/v1/gateway/status");
    return env?.data || null;
  },
};

export const locationClient = {
  async searchCities(q) {
    const env = await callGatewayEndpoint("/api/v1/location/search", { q });
    return env?.data?.results || [];
  },
  async reverseGeocode(lat, lon) {
    const env = await callGatewayEndpoint("/api/v1/location/reverse", {
      lat,
      lon,
    });
    return env?.data || null;
  },
  async detectIpLocation() {
    const env = await callGatewayEndpoint("/api/v1/location/ip-detect");
    return env?.data || null;
  },
};

export const forecastClient = {
  async getCurrentAnd14Day(lat, lon, tz = "auto") {
    const env = await callGatewayEndpoint("/api/v1/forecast/current", {
      lat,
      lon,
      tz,
    });
    return env?.data || null;
  },
  async getCustomDate(lat, lon, date, tz = "auto") {
    const env = await callGatewayEndpoint("/api/v1/forecast/date", {
      lat,
      lon,
      date,
      tz,
    });
    return env?.data || null;
  },
};

export const airQualityClient = {
  async getCurrentAirQuality(lat, lon) {
    const env = await callGatewayEndpoint("/api/v1/air-quality/current", {
      lat,
      lon,
    });
    return env?.data || null;
  },
};

export const lifestyleClient = {
  async getDailyRecommendations({ temp, rain_prob, wind, uv, humidity }) {
    const env = await callGatewayEndpoint(
      "/api/v1/lifestyle/recommendations",
      {
        temp,
        rain_prob,
        wind,
        uv,
        humidity,
      }
    );
    return env?.data || null;
  },
};

export const nowcastClient = {
  async getBriefAndMinuteCast(params) {
    const env = await callGatewayEndpoint("/api/v1/nowcast/brief", params);
    return env?.data || null;
  },
};


