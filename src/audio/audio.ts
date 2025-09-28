// @ts-nocheck
import * as THREE from "three/webgpu";
import type { ModuleInstance, TickInfo, AppContext, AudioProfile, AudioService } from "../context";
import type { AudioConfig } from "../config";

const ZERO_PROFILE: AudioProfile = Object.freeze({
  level: 0,
  beat: 0,
  bands: { low: 0, mid: 0, high: 0 },
  flow: new THREE.Vector3(),
  colorPulse: 0,
});

const clamp01 = (value: number) => THREE.MathUtils.clamp(value, 0, 1);

class AudioEngine {
  audioContext: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  gainNode: GainNode | null = null;
  sourceNode: AudioNode | null = null;
  bufferSource: AudioBufferSourceNode | null = null;
  mediaStream: MediaStream | null = null;
  fileInput: HTMLInputElement | null = null;
  fileBuffer: AudioBuffer | null = null;

  frequencyData: Uint8Array | null = null;
  timeDomainData: Uint8Array | null = null;

  enabled = false;
  currentSource: AudioConfig["source"] = "microphone";

  level = 0;
  beatEnvelope = 0;
  beatThreshold = 0.35;
  beatHoldTimer = 0;
  swirlPhase = 0;

  profile = {
    level: 0,
    beat: 0,
    bands: { low: 0, mid: 0, high: 0 },
    flow: new THREE.Vector3(),
    colorPulse: 0,
  };

  metrics = {
    level: 0,
    beat: 0,
    bass: 0,
    mid: 0,
    treble: 0,
  };

  config: AudioConfig;

  constructor(initialConfig: AudioConfig) {
    this.config = { ...initialConfig };
  }

  async init() {
    if (this.fileInput) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.style.display = "none";
    input.addEventListener("change", async (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files[0]) {
        await this.loadFile(files[0]);
      }
      (event.target as HTMLInputElement).value = "";
    });
    document.body.appendChild(input);
    this.fileInput = input;
  }

  async ensureContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async syncConfig(config: AudioConfig) {
    const wasEnabled = this.enabled;
    const sourceChanged = config.source !== this.currentSource;
    this.config = { ...config };

    if (config.enabled && !wasEnabled) {
      await this.enable();
    } else if (!config.enabled && wasEnabled) {
      this.disable();
    }

    if (this.enabled && sourceChanged) {
      this.currentSource = config.source;
      await this.connectSourceGraph();
    }
  }

  async enable() {
    if (this.enabled) return;
    this.enabled = true;
    try {
      await this.ensureContext();
      await this.connectSourceGraph();
    } catch (error) {
      console.error("[audio] Failed to enable", error);
      this.disable();
    }
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.disconnectSource();
    this.clearProfile();
  }

  async connectSourceGraph() {
    if (this.config.source === "file") {
      if (!this.fileBuffer) {
        this.openFileDialog();
        return;
      }
      this.startFilePlayback();
    } else if (this.config.source === "loop") {
      if (!this.fileBuffer) {
        console.warn("[audio] loop source requires loaded file; opening picker");
        this.openFileDialog();
        return;
      }
      this.startFilePlayback({ loop: true });
    } else {
      await this.connectMicrophone();
    }
  }

  async connectMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone input is not supported in this browser.");
    }
    this.disconnectSource();
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const micSource = this.audioContext!.createMediaStreamSource(this.mediaStream);
    this.buildGraph(micSource, { monitor: false });
  }

  startFilePlayback(options: { loop?: boolean } = {}) {
    if (!this.fileBuffer) return;
    this.disconnectSource();
    const bufferSource = this.audioContext!.createBufferSource();
    bufferSource.buffer = this.fileBuffer;
    bufferSource.loop = options.loop ?? this.config.source === "loop";
    this.buildGraph(bufferSource, { monitor: true });
    bufferSource.start();
    this.bufferSource = bufferSource;
  }

  buildGraph(sourceNode: AudioNode, { monitor }: { monitor: boolean }) {
    const context = this.audioContext!;
    this.sourceNode = sourceNode;

    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = THREE.MathUtils.clamp(this.config.smoothing, 0, 0.99);

    const gain = context.createGain();
    gain.gain.value = this.config.sensitivity;

    sourceNode.connect(gain);
    gain.connect(analyser);
    if (monitor) {
      analyser.connect(context.destination);
    }

    this.analyser = analyser;
    this.gainNode = gain;
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(analyser.fftSize);
  }

  disconnectSource() {
    this.bufferSource?.stop();
    this.bufferSource?.disconnect();
    this.sourceNode?.disconnect();
    this.gainNode?.disconnect();
    this.analyser?.disconnect();

    this.bufferSource = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.analyser = null;
    this.frequencyData = null;
    this.timeDomainData = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  openFileDialog() {
    this.fileInput?.click();
  }

  async loadFile(file: File) {
    await this.ensureContext();
    const arrayBuffer = await file.arrayBuffer();
    this.fileBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
    if (this.config.source === "file" || this.config.source === "loop") {
      this.startFilePlayback({ loop: this.config.source === "loop" });
    }
  }

  clearProfile() {
    this.profile.level = 0;
    this.profile.beat = 0;
    this.profile.bands.low = 0;
    this.profile.bands.mid = 0;
    this.profile.bands.high = 0;
    this.profile.flow.set(0, 0, 0);
    this.profile.colorPulse = 0;
    this.metrics.level = 0;
    this.metrics.beat = 0;
    this.metrics.bass = 0;
    this.metrics.mid = 0;
    this.metrics.treble = 0;
  }

  update(delta: number, _elapsed: number) {
    if (!this.enabled || !this.analyser || !this.frequencyData || !this.timeDomainData) {
      this.clearProfile();
      return null;
    }

    this.analyser.smoothingTimeConstant = THREE.MathUtils.clamp(this.config.smoothing, 0, 0.99);
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeDomainData);

    const bands = this.computeBandEnergies();
    const waveformEnergy = this.computeWaveformEnergy();

    const sensitivity = this.config.sensitivity;
    const dynamics = this.config.dynamics;
    const smoothing = THREE.MathUtils.clamp(this.config.smoothing, 0, 0.95);

    const baseLevel = (bands.low + bands.mid + bands.high + waveformEnergy) * 0.25;
    const calibratedLevel = Math.pow(Math.max(0, baseLevel * sensitivity), THREE.MathUtils.clamp(dynamics, 0.1, 3));
    this.level = THREE.MathUtils.lerp(this.level, calibratedLevel, 1 - smoothing);

    this.updateBeat(delta);

    const lowEnergy = Math.pow(Math.max(0, bands.low * this.config.bassGain), THREE.MathUtils.clamp(dynamics, 0.1, 3));
    const midEnergy = Math.pow(Math.max(0, bands.mid * this.config.midGain), THREE.MathUtils.clamp(dynamics, 0.1, 3));
    const highEnergy = Math.pow(Math.max(0, bands.high * this.config.trebleGain), THREE.MathUtils.clamp(dynamics, 0.1, 3));

    const displacement = this.config.displacement;
    const flowWeight = this.config.flow;
    const swirlWeight = this.config.swirl;

    this.swirlPhase += delta * (0.6 + highEnergy * 5 * swirlWeight + this.beatEnvelope * 2.5);
    const flow = this.profile.flow;
    flow.set(
      Math.sin(this.swirlPhase) * midEnergy * displacement,
      (lowEnergy * 2 - 0.6) * displacement,
      Math.cos(this.swirlPhase) * (highEnergy + midEnergy * 0.5) * displacement
    );
    flow.multiplyScalar(flowWeight);

    const colorPulse = THREE.MathUtils.clamp(highEnergy * this.config.colorBoost + this.beatEnvelope * 0.5, 0, 2);

    this.profile.level = clamp01(this.level);
    this.profile.beat = clamp01(this.beatEnvelope);
    this.profile.bands.low = THREE.MathUtils.clamp(lowEnergy, 0, 2);
    this.profile.bands.mid = THREE.MathUtils.clamp(midEnergy, 0, 2);
    this.profile.bands.high = THREE.MathUtils.clamp(highEnergy, 0, 2);
    this.profile.colorPulse = colorPulse;

    this.metrics.level = this.profile.level;
    this.metrics.beat = this.profile.beat;
    this.metrics.bass = this.profile.bands.low;
    this.metrics.mid = this.profile.bands.mid;
    this.metrics.treble = this.profile.bands.high;

    return this.profile;
  }

  updateBeat(delta: number) {
    const beatHold = Math.max(0.05, this.config.beatHold);
    const beatDecay = THREE.MathUtils.clamp(this.config.beatDecay, 0.5, 0.999);
    const beatRelease = Math.max(0.5, this.config.beatRelease);

    this.beatHoldTimer += delta;
    const thresholdTarget = this.level * 0.85;
    this.beatThreshold = THREE.MathUtils.lerp(this.beatThreshold, thresholdTarget, 1 - beatDecay);

    if (this.level > this.beatThreshold && this.beatHoldTimer > beatHold) {
      this.beatEnvelope = 1;
      this.beatHoldTimer = 0;
      this.beatThreshold = this.level * 1.05;
    } else {
      const releaseRate = delta * beatRelease;
      this.beatEnvelope = Math.max(0, this.beatEnvelope - releaseRate);
    }
  }

  computeBandEnergies() {
    const freqData = this.frequencyData;
    if (!freqData || !freqData.length) {
      return { low: 0, mid: 0, high: 0 };
    }

    const length = freqData.length;
    const lowEnd = Math.max(1, Math.floor(length * 0.12));
    const midEnd = Math.max(lowEnd + 1, Math.floor(length * 0.5));

    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;

    for (let i = 0; i < length; i += 1) {
      const value = freqData[i] / 255;
      if (i < lowEnd) {
        lowSum += value;
      } else if (i < midEnd) {
        midSum += value;
      } else {
        highSum += value;
      }
    }

    const low = lowSum / lowEnd;
    const mid = midSum / Math.max(1, midEnd - lowEnd);
    const high = highSum / Math.max(1, length - midEnd);

    return { low: clamp01(low), mid: clamp01(mid), high: clamp01(high) };
  }

  computeWaveformEnergy() {
    const data = this.timeDomainData;
    if (!data || !data.length) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const centered = (data[i] - 128) / 128;
      sum += centered * centered;
    }
    return clamp01(Math.sqrt(sum / data.length));
  }

  dispose() {
    this.disable();
    if (this.fileInput) {
      this.fileInput.remove();
      this.fileInput = null;
    }
  }
}

export const createAudioModule = (): ModuleInstance => {
  const id = "audio";
  let engine: AudioEngine | null = null;
  let profile: AudioProfile = ZERO_PROFILE;

  return {
    id,
    label: "Audio",
    priority: -50,
    autoStart: true,
    async init(context: AppContext) {
      engine = new AudioEngine(context.config.value.audio);
      await engine.init();
      context.services.audio = {
        engine,
        get profile() {
          return profile;
        },
        metrics: engine.metrics,
      } as AudioService;
      if (context.config.value.audio.enabled) {
        await engine.enable();
      }
    },
    async update(tick: TickInfo) {
      if (!engine) return;
      await engine.syncConfig(tick.config.audio);
      const nextProfile = engine.update(tick.delta, tick.elapsed);
      profile = nextProfile || ZERO_PROFILE;
      const physics = tick.context.services.physics;
      physics?.setAudioProfile?.(nextProfile);
    },
    async dispose(context: AppContext) {
      engine?.dispose();
      delete context.services.audio;
      profile = ZERO_PROFILE;
      engine = null;
    },
  };
};
