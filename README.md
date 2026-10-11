# 🌤️ AETHER — Live Weather, Full-Day Forecast & Microservices Platform

<div align="center">

### 🌐 **[👉 CLICK HERE TO OPEN THE LIVE WEBSITE (http://localhost:3000) 👈](http://localhost:3000)**

[![Open Live Website](https://img.shields.io/badge/🌐_OPEN_LIVE_WEBSITE-http%3A%2F%2Flocalhost%3A3000-0ea5e9?style=for-the-badge&logoColor=white)](http://localhost:3000)
[![Open on Local Network](https://img.shields.io/badge/📱_LAN_ACCESS-http%3A%2F%2F10.13.7.234%3A3000-10b981?style=for-the-badge&logoColor=white)](http://10.13.7.234:3000)
[![Microservices Status](https://img.shields.io/badge/⚡_MICROSERVICES_GATEWAY-6%2F6_ONLINE-6366f1?style=for-the-badge&logoColor=white)](http://localhost:3000/api/v1/gateway/status)

</div>

---

## 🔗 Quick Clickable Links to Access the Website & Microservices

| Access Point | Clickable URL | Description |
| :--- | :--- | :--- |
| **🌍 Main Weather Website (Local)** | **[http://localhost:3000](http://localhost:3000)** | Primary live weather dashboard, full-day explorer & interactive map |
| **🖥️ Direct Loopback URL** | **[http://127.0.0.1:3000](http://127.0.0.1:3000)** | Alternate direct local link for any browser |
| **📱 Local Network / Wi-Fi Link** | **[http://10.13.7.234:3000](http://10.13.7.234:3000)** | Open from any phone, tablet, or laptop on the same Wi-Fi network |
| **⚡ API Gateway & Registry Status** | **[http://localhost:3000/api/v1/gateway/status](http://localhost:3000/api/v1/gateway/status)** | Live health, cache stats & circuit breaker states for all 6 microservices |
| **✨ AI Weather Brief & 60-Min Nowcast** | **[http://localhost:3000/api/v1/nowcast/brief?city=Udupi&temp=29&feels=32&rain_prob=20](http://localhost:3000/api/v1/nowcast/brief?city=Udupi&temp=29&feels=32&rain_prob=20)** | Google Pixel Weather AI Daily Brief + AccuWeather 60-Min MinuteCast® |
| **📍 Location & GPS Microservice** | **[http://localhost:3000/api/v1/location/health](http://localhost:3000/api/v1/location/health)** | City search, reverse geocoding & live network IP location service |
| **🌤️ Forecast & Multi-Date Microservice** | **[http://localhost:3000/api/v1/forecast/health](http://localhost:3000/api/v1/forecast/health)** | Live weather, 24-hour full-day & 14-day forecast microservice |
| **🍃 Air Quality & UV Microservice** | **[http://localhost:3000/api/v1/air-quality/health](http://localhost:3000/api/v1/air-quality/health)** | Clean air status & outdoor breathing comfort microservice |
| **👕 Daily Comfort & Wardrobe Service** | **[http://localhost:3000/api/v1/lifestyle/health](http://localhost:3000/api/v1/lifestyle/health)** | Plain-English umbrella check, clothing guide & activity scores |

---

## ✨ Key User-Friendly Capabilities

1. **🎨 Live Reactive Weather Sky Background (`WeatherCanvas.jsx`)**
   - Automatically changes in real time according to the live weather and time of day (Sunny Noon, Golden Sunset, Starlit Night, Rain Showers, Thunderstorm with Lightning, Snowfall, or Misty Fog).
   - Includes a **Preview Sky** bar in the header so you can test any weather background on demand.

2. **📍 Live Location Access & Custom Location Picker (`LocationGateModal.jsx` & `Search/index.jsx`)**
   - **Grant Live GPS Access**: Uses your device's live GPS sensor (`watchPosition`) or falls back to **Live Network IP Location** when indoors.
   - **Search Any City or Click Any Point on the Map**: Search any city, town, or PIN code worldwide, use quick **🏠 Home / 🎓 Campus / 🏢 Work / ✈️ Travel** tags, or click anywhere on the interactive map.

3. **🕒 Live Time & Full Date Banner + Whole-Day Weather for Any Date (`WholeDayExplorer.jsx`)**
   - Displays a prominent **Live Digital Clock (with seconds)** and **Full Calendar Date** at the top of the screen.
   - Select **any date** (14-day live forecast strip or any custom historical/future date from `1950` to `2026+`) to view the **entire 24-hour day (`00:00` to `23:00`)** broken down into **🌅 Morning**, **☀️ Afternoon**, **🌇 Evening**, and **🌙 Night**.

4. **✨ World-Class Features Inspired by Apple Weather, Google Pixel Weather & AccuWeather**
   - **Google Pixel Weather "AI Daily Weather Brief"**: Conversational, plain-English summary of current conditions, highs/lows, rain outlook, and what to wear.
   - **AccuWeather "Next-60-Minutes MinuteCast®" Bar**: 5-slot timeline (`Now`, `+15m`, `+30m`, `+45m`, `+60m`) showing immediate rain or dry-sky expectations.
   - **Apple Weather (iOS 18) "Feels Like" Explanation Pill**: Explains in everyday words *why* it feels warmer or cooler (e.g., humidity or breeze).

5. **⚡ Built on Strict Microservices Rules & Regulations (`microservices/`)**
   - **Single Responsibility & Bounded Context**: 6 independent domain services (`api-gateway`, `location-service`, `forecast-service`, `air-quality-service`, `lifestyle-service`, `nowcast-brief-service`).
   - **Decentralized Data Management**: Each microservice owns its own private `IsolatedServiceStore` in-memory TTL cache.
   - **Fault Isolation & Observability**: Per-service `CircuitBreaker` state machines, `/health` endpoints, and `X-Correlation-ID` distributed tracing headers.

---

## 🚀 How to Start the Server

### Option 1: Instant Python Microservices Gateway Server (Recommended)
```bash
python dev_server.py
```
Then click **[http://localhost:3000](http://localhost:3000)** to open the application in your browser.

### Option 2: Standard Node.js / Create React App
```bash
npm install
npm start
```
Then click **[http://localhost:3000](http://localhost:3000)** to open the application.
