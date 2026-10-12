# 🌤️ AETHER — Live Weather, Full-Day Forecast & Interactive Map

<div align="center">

## 🌍 **[👉 CLICK HERE TO OPEN THE LIVE WEBSITE (https://drkanurag.github.io/Weather-app/) 👈](https://drkanurag.github.io/Weather-app/)**

[![Open Live Website 24/7](https://img.shields.io/badge/🌍_OPEN_LIVE_WEBSITE_(24/7_PUBLIC)-drkanurag.github.io%2FWeather--app-0ea5e9?style=for-the-badge&logoColor=white)](https://drkanurag.github.io/Weather-app/)
[![Cloudflare CDN Mirror](https://img.shields.io/badge/⚡_INSTANT_CDN_MIRROR-raw.githack.com-10b981?style=for-the-badge&logoColor=white)](https://raw.githack.com/drkanurag/Weather-app/main/index.html)
[![Local Dev Server](https://img.shields.io/badge/💻_LOCAL_SERVER-http%3A%2F%2Flocalhost%3A3000-6366f1?style=for-the-badge&logoColor=white)](http://localhost:3000)

</div>

---

## 🔗 Live Clickable Links (Works 24/7 for Anyone, Anytime, Anywhere)

| Access Type | Clickable Live Link | Who Can Use It? |
| :--- | :--- | :--- |
| **🌍 Primary 24/7 Public Live Website (GitHub Pages)** | **[https://drkanurag.github.io/Weather-app/](https://drkanurag.github.io/Weather-app/)** | **Anyone on the internet** (Phone, Tablet, or Laptop — no setup or server required) |
| **⚡ Instant Cloudflare CDN Live Mirror** | **[https://raw.githack.com/drkanurag/Weather-app/main/index.html](https://raw.githack.com/drkanurag/Weather-app/main/index.html)** | **Anyone on the internet** (Global CDN mirror) |
| **💻 Local Development URL** | **[http://localhost:3000](http://localhost:3000)** | Local machine when running `python dev_server.py` |

---

## ✨ Key User-Friendly Capabilities

1. **🎨 Live Reactive Weather Sky Background (`WeatherCanvas.jsx`)**
   - Automatically changes in real time according to the live weather and time of day (Sunny Noon, Golden Sunset, Starlit Night, Rain Showers, Thunderstorm with Lightning, Snowfall, or Misty Fog).
   - Includes a **Preview Sky** bar in the header so you can test any weather background on demand.

2. **📍 Live Location Access & Custom Location Picker (`LocationGateModal.jsx` & `Search/index.jsx`)**
   - **Grant Live GPS Access**: Uses your device's live GPS sensor (`watchPosition`) or falls back to **Live Network IP Location** when indoors.
   - **Search Any City or Click Any Point on the Map**: Search any city, town, or PIN code worldwide, or click anywhere on the interactive map.

3. **🕒 Live Time & Full Date Banner + Whole-Day Weather for Any Date (`WholeDayExplorer.jsx`)**
   - Displays a prominent **Live Digital Clock (with seconds)** and **Full Calendar Date** at the top of the screen.
   - Select **any date** (14-day live forecast strip or any custom historical/future date) to view the **entire 24-hour day (`00:00` to `23:00`)** broken down into **🌅 Morning**, **☀️ Afternoon**, **🌇 Evening**, and **🌙 Night**.

4. **🗺️ Open-Source & Google Weather Maps (`WeatherMap.jsx`)**
   - Switch between **🌍 OpenStreetMap**, **⛰️ OpenTopoMap**, **🌑 Dark Radar**, **🛰️ Google Hybrid**, **🗺️ Google Road**, and **🌬️ Windy.com Live Animated Wind & Rain Map**.
   - Includes live **RainViewer Doppler Radar** and **Infrared Cloud Satellite** overlays, plus click-anywhere weather inspection.

5. **✨ World-Class Features Inspired by Apple Weather, Google Pixel Weather & AccuWeather**
   - **Google Pixel Weather "AI Daily Weather Brief"**: Conversational, plain-English summary of current conditions, highs/lows, rain outlook, and what to wear.
   - **AccuWeather "Next-60-Minutes MinuteCast®" Bar**: 5-slot timeline (`Now`, `+15m`, `+30m`, `+45m`, `+60m`) showing immediate rain or dry-sky expectations.
   - **Apple Weather (iOS 18) "Feels Like" Explanation Pill**: Explains in everyday words *why* it feels warmer or cooler (e.g., humidity or breeze).

---

## 🚀 Optional: Run Locally

If you also want to run the local server on your computer:
```bash
python dev_server.py
```
Then open **[http://localhost:3000](http://localhost:3000)**.
