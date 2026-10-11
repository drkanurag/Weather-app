// Procedural Web Audio API Atmospheric Soundscape Synthesizer
// Generates subtle, soothing ambient weather audio (Rain, Thunder, Breeze, Night Sky) with zero external audio assets

class AtmosphericSoundEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.nodes = [];
    this.thunderTimer = null;
    this.currentTheme = "clear-day";
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.01;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return true;
  }

  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    // Pink-ish noise filter
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  start(skyTheme = "clear-day") {
    if (!this.initContext()) return false;
    this.stopNodes();
    this.isPlaying = true;
    this.currentTheme = skyTheme;

    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0.01, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.22, now + 1.2);

    const noiseBuffer = this.createNoiseBuffer();
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    const noiseGain = this.ctx.createGain();

    if (skyTheme === "rain" || skyTheme === "storm") {
      // Rain patter bandpass
      filter.type = "bandpass";
      filter.frequency.value = skyTheme === "storm" ? 950 : 1200;
      filter.Q.value = 0.7;
      noiseGain.gain.value = skyTheme === "storm" ? 0.85 : 0.65;

      if (skyTheme === "storm") {
        this.scheduleThunder();
      }
    } else if (skyTheme === "snow" || skyTheme === "cloudy" || skyTheme === "fog") {
      // Soft high-altitude alpine wind
      filter.type = "lowpass";
      filter.frequency.value = 340;
      filter.Q.value = 2.5;
      noiseGain.gain.value = 0.45;

      // Subtle wind swell LFO
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.14;
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      this.nodes.push(lfo);
    } else {
      // Serene atmospheric harmonic pad + gentle breeze
      filter.type = "lowpass";
      filter.frequency.value = 260;
      noiseGain.gain.value = 0.25;

      const freqs =
        skyTheme === "clear-night" ? [174.61, 261.63, 392.0] : [220.0, 277.18, 329.63];
      freqs.forEach((f) => {
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        oscGain.gain.value = 0.03;
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start();
        this.nodes.push(osc);
      });
    }

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSource.start();
    this.nodes.push(noiseSource);
    return true;
  }

  scheduleThunder() {
    if (!this.isPlaying || this.currentTheme !== "storm") return;
    this.thunderTimer = setTimeout(() => {
      if (!this.isPlaying || !this.ctx) return;
      const now = this.ctx.currentTime;
      const noiseBuffer = this.createNoiseBuffer();
      const rumble = this.ctx.createBufferSource();
      rumble.buffer = noiseBuffer;

      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(140, now);
      lowpass.frequency.exponentialRampToValueAtTime(45, now + 2.8);

      const rumbleGain = this.ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.01, now);
      rumbleGain.gain.linearRampToValueAtTime(0.9, now + 0.25);
      rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 3.2);

      rumble.connect(lowpass);
      lowpass.connect(rumbleGain);
      rumbleGain.connect(this.masterGain);
      rumble.start(now);
      rumble.stop(now + 3.3);

      this.scheduleThunder();
    }, 5000 + Math.random() * 6000);
  }

  updateTheme(skyTheme) {
    if (this.isPlaying && skyTheme !== this.currentTheme) {
      this.start(skyTheme);
    } else {
      this.currentTheme = skyTheme;
    }
  }

  stopNodes() {
    if (this.thunderTimer) {
      clearTimeout(this.thunderTimer);
      this.thunderTimer = null;
    }
    this.nodes.forEach((n) => {
      try {
        n.stop();
        n.disconnect();
      } catch (e) {
        // ignore already stopped
      }
    });
    this.nodes = [];
  }

  stop() {
    this.isPlaying = false;
    this.stopNodes();
  }
}

export const soundEngine = new AtmosphericSoundEngine();

