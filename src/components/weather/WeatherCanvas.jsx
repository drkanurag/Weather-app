import React, { useEffect, useRef } from "react";

// Helper to linearly interpolate RGB arrays
function lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

const SKY_PALETTES = {
  "clear-day": {
    top: [10, 46, 92],
    mid: [22, 92, 158],
    bottom: [56, 152, 218],
    cloudColor: [255, 255, 255],
  },
  "golden-hour": {
    top: [26, 18, 58],
    mid: [110, 44, 88],
    bottom: [218, 102, 68],
    cloudColor: [253, 186, 116],
  },
  "clear-night": {
    top: [3, 6, 18],
    mid: [10, 18, 44],
    bottom: [20, 34, 72],
    cloudColor: [148, 163, 184],
  },
  cloudy: {
    top: [18, 28, 42],
    mid: [38, 54, 74],
    bottom: [64, 84, 106],
    cloudColor: [203, 213, 225],
  },
  fog: {
    top: [28, 38, 50],
    mid: [54, 68, 82],
    bottom: [90, 106, 120],
    cloudColor: [226, 232, 240],
  },
  rain: {
    top: [8, 18, 30],
    mid: [18, 38, 58],
    bottom: [32, 62, 86],
    cloudColor: [148, 163, 184],
  },
  storm: {
    top: [6, 6, 18],
    mid: [22, 18, 44],
    bottom: [42, 34, 72],
    cloudColor: [100, 116, 139],
  },
  snow: {
    top: [16, 28, 52],
    mid: [36, 60, 96],
    bottom: [72, 106, 148],
    cloudColor: [241, 245, 249],
  },
};

export default function WeatherCanvas({
  skyTheme = "clear-day",
  weatherCode = 0,
  isDay = true,
  temp = 22,
  cloudCover = 25,
  windSpeed = 12,
  windDirection = 90,
  precipitation = 0,
  visibility = 10000,
  solarProgress = 0.5,
}) {
  const canvasRef = useRef(null);
  const livePropsRef = useRef({
    skyTheme,
    weatherCode,
    isDay,
    temp,
    cloudCover,
    windSpeed,
    windDirection,
    precipitation,
    visibility,
    solarProgress,
  });

  // Update ref immediately whenever props change so 60fps loop smoothly interpolates
  useEffect(() => {
    livePropsRef.current = {
      skyTheme,
      weatherCode,
      isDay,
      temp,
      cloudCover,
      windSpeed,
      windDirection,
      precipitation,
      visibility,
      solarProgress,
    };
  }, [
    skyTheme,
    weatherCode,
    isDay,
    temp,
    cloudCover,
    windSpeed,
    windDirection,
    precipitation,
    visibility,
    solarProgress,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Smoothly interpolated RGB sky colors
    const initialPal = SKY_PALETTES[livePropsRef.current.skyTheme] || SKY_PALETTES["clear-day"];
    let currentTop = [...initialPal.top];
    let currentMid = [...initialPal.mid];
    let currentBottom = [...initialPal.bottom];
    let currentCloudRgb = [...initialPal.cloudColor];

    // 1. Starfield pool (220 stars)
    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random() * width,
      y: Math.random() * (height * 0.78),
      r: Math.random() * 1.7 + 0.35,
      alpha: Math.random() * 0.85 + 0.15,
      speed: Math.random() * 0.03 + 0.008,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.7 ? "224, 242, 254" : Math.random() > 0.4 ? "254, 249, 195" : "248, 250, 252",
    }));

    let shootingStar = null;

    // 2. Raindrops pool (up to 360 drops) + ground splash ripples
    const raindrops = Array.from({ length: 360 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: Math.random() * 22 + 14,
      speed: Math.random() * 10 + 14,
      opacity: Math.random() * 0.45 + 0.18,
      thickness: Math.random() * 1.2 + 0.8,
    }));

    const splashes = Array.from({ length: 35 }, () => ({
      x: Math.random() * width,
      y: height - Math.random() * 90 - 10,
      r: Math.random() * 12,
      maxR: 12 + Math.random() * 14,
      alpha: 0.5,
    }));

    // 3. Snowflakes pool (200 flakes)
    const snowflakes = Array.from({ length: 200 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 3.8 + 1.1,
      speedY: Math.random() * 1.7 + 0.55,
      speedX: (Math.random() - 0.35) * 0.9,
      wobble: Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.65 + 0.25,
    }));

    // 4. Multi-layer volumetric cloud banks (14 clouds)
    const clouds = Array.from({ length: 14 }, (_, idx) => ({
      x: (idx / 14) * (width + 400) - 200,
      y: 40 + (idx % 4) * (height * 0.11) + Math.random() * 35,
      radiusX: 200 + (idx % 3) * 110 + Math.random() * 90,
      radiusY: 55 + (idx % 3) * 28 + Math.random() * 25,
      baseSpeed: 0.14 + (idx % 4) * 0.08,
      layer: idx % 3,
    }));

    // 5. Fractal Lightning state
    let lightningFlash = 0;
    let lightningBolt = null;

    const createFractalLightning = () => {
      const startX = width * (0.15 + Math.random() * 0.7);
      const segments = [];
      let currX = startX;
      let currY = 0;
      while (currY < height * 0.72) {
        const nextX = currX + (Math.random() - 0.5) * 75;
        const nextY = currY + Math.random() * 42 + 18;
        segments.push({ x1: currX, y1: currY, x2: nextX, y2: nextY, main: true });
        // Occasional side branch
        if (Math.random() < 0.35) {
          let bx = nextX;
          let by = nextY;
          for (let b = 0; b < 3; b++) {
            const nbx = bx + (Math.random() - 0.5) * 55;
            const nby = by + Math.random() * 35 + 12;
            segments.push({ x1: bx, y1: by, x2: nbx, y2: nby, main: false });
            bx = nbx;
            by = nby;
          }
        }
        currX = nextX;
        currY = nextY;
      }
      return segments;
    };

    let tick = 0;

    const render = () => {
      tick += 1;
      const state = livePropsRef.current;
      const targetPal = SKY_PALETTES[state.skyTheme] || SKY_PALETTES["clear-day"];

      // Smoothly transition sky palette every frame
      currentTop = lerpColor(currentTop, targetPal.top, 0.045);
      currentMid = lerpColor(currentMid, targetPal.mid, 0.045);
      currentBottom = lerpColor(currentBottom, targetPal.bottom, 0.045);
      currentCloudRgb = lerpColor(currentCloudRgb, targetPal.cloudColor, 0.045);

      // Draw full-viewport dynamic sky dome gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, `rgb(${currentTop.join(",")})`);
      skyGrad.addColorStop(0.52, `rgb(${currentMid.join(",")})`);
      skyGrad.addColorStop(1, `rgb(${currentBottom.join(",")})`);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Thermal Tint (Warm heat shimmer if >= 32°C, Crisp Arctic frost glow if <= 2°C)
      if (state.temp >= 32) {
        const heatGrad = ctx.createRadialGradient(
          width * 0.5,
          height,
          50,
          width * 0.5,
          height,
          height * 0.85
        );
        heatGrad.addColorStop(0, "rgba(251, 146, 60, 0.16)");
        heatGrad.addColorStop(1, "rgba(251, 146, 60, 0)");
        ctx.fillStyle = heatGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (state.temp <= 2) {
        const frostGrad = ctx.createRadialGradient(
          width * 0.5,
          0,
          50,
          width * 0.5,
          0,
          height * 0.85
        );
        frostGrad.addColorStop(0, "rgba(186, 230, 253, 0.16)");
        frostGrad.addColorStop(1, "rgba(186, 230, 253, 0)");
        ctx.fillStyle = frostGrad;
        ctx.fillRect(0, 0, width, height);
      }

      const windFactor = Math.min(4.5, Math.max(0.35, (state.windSpeed || 10) / 14));

      // CELESTIAL BODIES: SUN & GOD RAYS (Day / Golden Hour)
      if (
        state.skyTheme === "clear-day" ||
        state.skyTheme === "golden-hour" ||
        (state.isDay && state.skyTheme === "cloudy" && state.cloudCover < 85)
      ) {
        const prog = Math.max(0.08, Math.min(0.92, state.solarProgress || 0.5));
        const sunX = width * (0.14 + prog * 0.72);
        const sunY =
          state.skyTheme === "golden-hour"
            ? height * 0.28
            : height * (0.34 - Math.sin(prog * Math.PI) * 0.22);

        // Outer solar corona
        const coronaRadius = state.skyTheme === "golden-hour" ? 540 : 480;
        const sunGrad = ctx.createRadialGradient(
          sunX,
          sunY,
          8,
          sunX,
          sunY,
          coronaRadius
        );
        if (state.skyTheme === "golden-hour") {
          sunGrad.addColorStop(0, "rgba(254, 240, 138, 0.75)");
          sunGrad.addColorStop(0.14, "rgba(251, 146, 60, 0.42)");
          sunGrad.addColorStop(0.45, "rgba(225, 29, 72, 0.15)");
          sunGrad.addColorStop(1, "rgba(225, 29, 72, 0)");
        } else {
          sunGrad.addColorStop(0, "rgba(255, 251, 235, 0.72)");
          sunGrad.addColorStop(0.12, "rgba(253, 224, 71, 0.34)");
          sunGrad.addColorStop(0.45, "rgba(56, 189, 248, 0.14)");
          sunGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
        }
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, width, height);

        // Rotating volumetric crepuscular sun rays
        ctx.save();
        ctx.translate(sunX, sunY);
        ctx.rotate(tick * 0.0008);
        for (let r = 0; r < 8; r++) {
          ctx.rotate(Math.PI / 4);
          const rayGrad = ctx.createLinearGradient(0, 0, 380, 0);
          rayGrad.addColorStop(0, "rgba(254, 249, 195, 0.12)");
          rayGrad.addColorStop(1, "rgba(254, 249, 195, 0)");
          ctx.fillStyle = rayGrad;
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(380, -38);
          ctx.lineTo(380, 38);
          ctx.lineTo(0, 8);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Bright solar core disc
        ctx.beginPath();
        ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(254, 249, 195, 0.88)";
        ctx.fill();
      }

      // CELESTIAL BODIES: STARFIELD, AURORA & MOON (Night)
      if (state.skyTheme === "clear-night" || !state.isDay) {
        const nightOpacity = state.skyTheme === "clear-night" ? 1 : 0.45;

        // Aurora Borealis ribbon wave
        ctx.save();
        const auroraGrad = ctx.createLinearGradient(0, 40, width, height * 0.42);
        auroraGrad.addColorStop(0, `rgba(16, 185, 129, ${0.09 * nightOpacity})`);
        auroraGrad.addColorStop(0.5, `rgba(56, 189, 248, ${0.12 * nightOpacity})`);
        auroraGrad.addColorStop(1, `rgba(168, 85, 247, ${0.08 * nightOpacity})`);
        ctx.fillStyle = auroraGrad;
        ctx.beginPath();
        ctx.moveTo(0, height * 0.25);
        for (let x = 0; x <= width; x += 60) {
          const y =
            height * 0.2 +
            Math.sin(x * 0.004 + tick * 0.012) * 38 +
            Math.cos(x * 0.008 - tick * 0.008) * 20;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Twinkling Stars
        stars.forEach((s) => {
          const twinkle =
            0.3 + 0.7 * Math.abs(Math.sin(tick * s.speed + s.phase));
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${s.hue}, ${s.alpha * twinkle * nightOpacity})`;
          ctx.fill();
        });

        // Glowing Moon Orb
        const moonX = width * 0.82;
        const moonY = height * 0.16;
        const moonHalo = ctx.createRadialGradient(
          moonX,
          moonY,
          10,
          moonX,
          moonY,
          210
        );
        moonHalo.addColorStop(0, `rgba(226, 232, 240, ${0.28 * nightOpacity})`);
        moonHalo.addColorStop(0.4, `rgba(129, 140, 248, ${0.1 * nightOpacity})`);
        moonHalo.addColorStop(1, "rgba(129, 140, 248, 0)");
        ctx.fillStyle = moonHalo;
        ctx.fillRect(0, 0, width, height);

        ctx.beginPath();
        ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(241, 245, 249, ${0.85 * nightOpacity})`;
        ctx.fill();

        // Shooting Star
        if (!shootingStar && Math.random() < 0.006 * nightOpacity) {
          shootingStar = {
            x: Math.random() * width * 0.65 + width * 0.1,
            y: Math.random() * height * 0.28,
            vx: 11,
            vy: 5,
            life: 0,
            maxLife: 34,
          };
        }
        if (shootingStar) {
          shootingStar.x += shootingStar.vx;
          shootingStar.y += shootingStar.vy;
          shootingStar.life += 1;
          const op = 1 - shootingStar.life / shootingStar.maxLife;
          ctx.strokeStyle = `rgba(224, 242, 254, ${op})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(shootingStar.x, shootingStar.y);
          ctx.lineTo(
            shootingStar.x - shootingStar.vx * 5.5,
            shootingStar.y - shootingStar.vy * 5.5
          );
          ctx.stroke();
          if (shootingStar.life >= shootingStar.maxLife) {
            shootingStar = null;
          }
        }
      }

      // MULTI-LAYER VOLUMETRIC CLOUDS (Scaled by live cloudCover %)
      const effectiveCloudCover =
        state.skyTheme === "cloudy" ||
        state.skyTheme === "rain" ||
        state.skyTheme === "storm" ||
        state.skyTheme === "fog"
          ? Math.max(75, state.cloudCover || 75)
          : state.skyTheme === "clear-day" || state.skyTheme === "clear-night"
          ? Math.min(35, state.cloudCover || 15)
          : state.cloudCover || 40;

      const activeCloudCount = Math.max(
        3,
        Math.round((effectiveCloudCover / 100) * clouds.length)
      );
      const baseCloudAlpha =
        state.skyTheme === "storm"
          ? 0.24
          : state.skyTheme === "cloudy" || state.skyTheme === "rain"
          ? 0.19
          : state.skyTheme === "fog"
          ? 0.26
          : 0.09;

      for (let i = 0; i < activeCloudCount; i++) {
        const c = clouds[i];
        c.x += c.baseSpeed * windFactor;
        if (c.x - c.radiusX > width + 100) {
          c.x = -c.radiusX - 80;
        }
        const grad = ctx.createRadialGradient(
          c.x,
          c.y,
          15,
          c.x,
          c.y,
          c.radiusX
        );
        grad.addColorStop(
          0,
          `rgba(${currentCloudRgb.join(",")}, ${baseCloudAlpha})`
        );
        grad.addColorStop(
          0.55,
          `rgba(${currentCloudRgb.join(",")}, ${baseCloudAlpha * 0.5})`
        );
        grad.addColorStop(1, `rgba(${currentCloudRgb.join(",")}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.radiusX, c.radiusY, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // FOG / LOW VISIBILITY HORIZONTAL MIST BANDS
      if (state.skyTheme === "fog" || (state.visibility && state.visibility < 4500)) {
        for (let b = 0; b < 4; b++) {
          const mistY = height * (0.25 + b * 0.18) + Math.sin(tick * 0.01 + b) * 18;
          const mistGrad = ctx.createLinearGradient(
            0,
            mistY - 70,
            0,
            mistY + 70
          );
          mistGrad.addColorStop(0, "rgba(226, 232, 240, 0)");
          mistGrad.addColorStop(0.5, "rgba(226, 232, 240, 0.14)");
          mistGrad.addColorStop(1, "rgba(226, 232, 240, 0)");
          ctx.fillStyle = mistGrad;
          ctx.fillRect(0, mistY - 70, width, 140);
        }
      }

      // RAIN, DRIZZLE & MONSOON DOWNPOUR + SPLASH RIPPLES
      if (
        state.skyTheme === "rain" ||
        state.skyTheme === "storm" ||
        state.precipitation > 0
      ) {
        const isHeavy =
          state.skyTheme === "storm" ||
          state.weatherCode === 65 ||
          state.weatherCode === 82 ||
          state.precipitation > 3;
        const dropCount = isHeavy ? 340 : 200;
        const slant = windFactor * 2.2;

        for (let i = 0; i < dropCount; i++) {
          const d = raindrops[i];
          ctx.strokeStyle = `rgba(186, 230, 253, ${d.opacity})`;
          ctx.lineWidth = isHeavy ? d.thickness * 1.25 : d.thickness;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + slant, d.y + d.len);
          ctx.stroke();

          d.y += d.speed * (isHeavy ? 1.25 : 1);
          d.x += slant;
          if (d.y > height) {
            d.y = -25;
            d.x = Math.random() * width;
          }
          if (d.x > width) d.x = 0;
        }

        // Ground water splash ripples
        splashes.forEach((sp) => {
          sp.r += 0.45;
          sp.alpha = Math.max(0, (1 - sp.r / sp.maxR) * 0.35);
          ctx.strokeStyle = `rgba(186, 230, 253, ${sp.alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.3, 0, 0, Math.PI * 2);
          ctx.stroke();
          if (sp.r >= sp.maxR) {
            sp.r = 0.5;
            sp.x = Math.random() * width;
            sp.y = height - Math.random() * 90 - 10;
          }
        });
      }

      // THUNDERSTORM FRACTAL LIGHTNING & SKY ILLUMINATION
      if (state.skyTheme === "storm" || state.weatherCode >= 95) {
        if (lightningFlash <= 0 && Math.random() < 0.008) {
          lightningFlash = 1;
          lightningBolt = createFractalLightning();
        }
        if (lightningFlash > 0) {
          ctx.fillStyle = `rgba(224, 242, 254, ${lightningFlash * 0.28})`;
          ctx.fillRect(0, 0, width, height);

          if (lightningBolt) {
            lightningBolt.forEach((seg) => {
              ctx.strokeStyle = seg.main
                ? `rgba(254, 249, 195, ${lightningFlash * 0.92})`
                : `rgba(186, 230, 253, ${lightningFlash * 0.6})`;
              ctx.lineWidth = seg.main ? 2.6 : 1.2;
              ctx.beginPath();
              ctx.moveTo(seg.x1, seg.y1);
              ctx.lineTo(seg.x2, seg.y2);
              ctx.stroke();
            });
          }
          lightningFlash -= 0.055;
        }
      }

      // ALPINE SNOWFALL & CRYSTALLINE DRIFT
      if (
        state.skyTheme === "snow" ||
        (state.weatherCode >= 71 && state.weatherCode <= 77) ||
        state.weatherCode === 85 ||
        state.weatherCode === 86
      ) {
        snowflakes.forEach((f) => {
          f.wobble += 0.025;
          f.y += f.speedY;
          f.x += f.speedX * windFactor + Math.sin(f.wobble) * 0.6;

          if (f.y > height) {
            f.y = -10;
            f.x = Math.random() * width;
          }
          if (f.x > width) f.x = 0;
          if (f.x < 0) f.x = width;

          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(240, 249, 255, ${f.opacity})`;
          ctx.fill();
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="aether-sky-canvas"
      aria-hidden="true"
    />
  );
}
