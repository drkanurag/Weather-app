"""
AETHER — Microservices Architecture Server (API Gateway + 5 Independent Domain Microservices)
Enforces Microservices Rules & Regulations:
- API Gateway (/api/v1/gateway/*)
- Location & Geolocation Microservice (/api/v1/location/*)
- Weather & Forecast Microservice (/api/v1/forecast/*)
- Air Quality & UV Health Microservice (/api/v1/air-quality/*)
- Lifestyle & Wardrobe Microservice (/api/v1/lifestyle/*)
- Service Registry & Health Monitor (/api/v1/registry/*)
"""
import http.server
import socketserver
import os
import json
import urllib.parse
from atmospheric_engine import compute_atmospheric_physics
from microservices.api_gateway import route_microservice_request

PORT = 3000
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

DEV_HTML = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/public/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#070b19" />
    <title>AETHER — Live Weather & Daily Forecast</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/public/vendor/leaflet.css" />
    <script src="/public/vendor/leaflet.js"></script>
    <link rel="stylesheet" href="/src/index.css" />
    <link rel="stylesheet" href="/src/App.css" />
    <script src="/public/vendor/react.production.min.js"></script>
    <script src="/public/vendor/react-dom.production.min.js"></script>
    <script src="/public/vendor/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script>
      (async function bootAether() {
        const files = [
          "/src/services/dsaEngine.js",
          "/src/microservices/gatewayClient.js",
          "/src/services/weatherService.js",
          "/src/services/soundEngine.js",
          "/src/components/weather/WeatherIcons.jsx",
          "/src/components/weather/WeatherCanvas.jsx",
          "/src/components/search/index.jsx",
          "/src/components/weather/HourlyForecast.jsx",
          "/src/components/weather/DailyForecast.jsx",
          "/src/components/weather/MetricsGrid.jsx",
          "/src/components/weather/WeatherMap.jsx",
          "/src/components/weather/AtmosphericPhysicsLab.jsx",
          "/src/components/weather/SmartAdvisor.jsx",
          "/src/components/weather/MicroservicesPanel.jsx",
          "/src/components/weather/WholeDayExplorer.jsx",
          "/src/components/weather/LocationGateModal.jsx",
          "/src/components/weather/index.jsx",
          "/src/App.js"
        ];

        window.React.default = window.React;
        window.React.__esModule = true;
        const registry = {
          react: window.React,
          "react-dom/client": window.ReactDOM
        };

        const resolvePath = (fromFile, rel) => {
          if (rel === "react") return "react";
          if (rel.endsWith(".css")) return "css-noop";
          const baseParts = fromFile.split("/").slice(0, -1);
          const relParts = rel.split("/");
          for (const p of relParts) {
            if (p === "." || p === "") continue;
            if (p === "..") baseParts.pop();
            else baseParts.push(p);
          }
          const candidate = baseParts.join("/");
          const candidates = [
            candidate,
            candidate + ".js",
            candidate + ".jsx",
            candidate + "/index.jsx",
            candidate + "/index.js"
          ];
          for (const c of candidates) {
            if (registry[c]) return c;
          }
          return candidate;
        };

        const ts = Date.now();
        const sources = await Promise.all(
          files.map((f) => fetch(f + "?v=" + ts, { cache: "no-store" }).then((r) => r.text()))
        );

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const rawCode = sources[i];
          try {
            const compiled = Babel.transform(rawCode, {
              presets: [["env", { modules: "commonjs" }], "react"],
              sourceType: "module",
              filename: file
            }).code;

            const mod = { exports: {} };
            const customRequire = (id) => {
              const key = resolvePath(file, id);
              if (key === "css-noop") return {};
              return registry[key] || {};
            };
            const fn = new Function("require", "module", "exports", "React", compiled);
            fn(customRequire, mod, mod.exports, window.React);
            registry[file] = mod.exports;
          } catch (err) {
            document.getElementById("root").innerHTML = "<pre style='color:white;padding:24px'>ERR IN " + file + ": " + (err && err.stack || err) + "</pre>";
            return;
          }
        }

        const App = registry["/src/App.js"].default || registry["/src/App.js"];
        class RootErrorBoundary extends React.Component {
          constructor(props) {
            super(props);
            this.state = { error: null };
          }
          static getDerivedStateFromError(error) {
            return { error };
          }
          render() {
            if (this.state.error) {
              return React.createElement(
                "pre",
                { style: { color: "white", padding: "24px", whiteSpace: "pre-wrap" } },
                "RENDER ERR: " + (this.state.error.stack || this.state.error.message || String(this.state.error))
              );
            }
            return React.createElement(App);
          }
        }
        const root = ReactDOM.createRoot(document.getElementById("root"));
        root.render(React.createElement(RootErrorBoundary));
      })().catch((e) => {
        document.getElementById("root").innerHTML = "<pre style='color:white;padding:24px'>BOOT ERR: " + (e && e.stack || e) + "</pre>";
      });
    </script>
  </body>
</html>
"""


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


class AetherHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # 1. Route /api/v1/* requests through the Microservices API Gateway
        if parsed.path.startswith("/api/v1/"):
            gw_result = route_microservice_request(
                parsed.path, parsed.query, dict(self.headers)
            )
            if gw_result is not None:
                import gzip

                status_code, body_dict, extra_headers = gw_result
                raw_bytes = json.dumps(body_dict).encode("utf-8")
                accept_enc = (self.headers.get("Accept-Encoding") or "").lower()
                use_gzip = "gzip" in accept_enc and len(raw_bytes) > 512
                payload = gzip.compress(raw_bytes) if use_gzip else raw_bytes

                self.send_response(status_code)
                self.send_header("Content-type", "application/json; charset=utf-8")
                if use_gzip:
                    self.send_header("Content-Encoding", "gzip")
                self.send_header("Content-Length", str(len(payload)))
                for hk, hv in (extra_headers or {}).items():
                    self.send_header(hk, hv)
                self.end_headers()
                self.wfile.write(payload)
                return

        # 2. Legacy /api/physics compatibility endpoint
        if parsed.path == "/api/physics":
            qs = urllib.parse.parse_qs(parsed.query)
            temp = float(qs.get("temp", [22.0])[0])
            humidity = float(qs.get("humidity", [55.0])[0])
            pressure = float(qs.get("pressure", [1013.25])[0])
            wind = float(qs.get("wind", [10.0])[0])
            solar = float(qs.get("solar", [200.0])[0])
            elevation = float(qs.get("elevation", [0.0])[0])

            result = compute_atmospheric_physics(
                temp_c=temp,
                humidity=humidity,
                pressure_hpa=pressure,
                wind_kmh=wind,
                solar_wm2=solar,
                elevation_m=elevation,
            )
            payload = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if parsed.path in ("/", "/index.html"):
            body = DEV_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        return super().do_GET()

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    with ThreadedTCPServer(("0.0.0.0", PORT), AetherHandler) as httpd:
        print(
            f"AETHER Microservices Gateway Server running at http://localhost:{PORT} (and on LAN port {PORT})",
            flush=True,
        )
        httpd.serve_forever()

