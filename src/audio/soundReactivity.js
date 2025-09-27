import * as THREE from "three/webgpu";
import { conf } from "../conf";

const ZERO_METRICS = { level: 0, beat: 0, bass: 0, mid: 0, treble: 0 };

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);

class SoundReactivity {
    audioContext = null;
    analyser = null;
    gainNode = null;
    sourceNode = null;
    bufferSource = null;
    mediaStream = null;
    fileInput = null;
    fileBuffer = null;

    frequencyData = null;
    timeDomainData = null;

    enabled = false;
    sourceType = "microphone";

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

    constructor() {
    }

    async init() {
        if (this.fileInput) { return; }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "audio/*";
        input.style.display = "none";
        input.addEventListener("change", async (event) => {
            const files = event.target.files;
            if (files && files[0]) {
                await this.loadFile(files[0]);
            }
            event.target.value = "";
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

    async enable() {
        if (this.enabled) { return; }
        this.enabled = true;
        try {
            await this.ensureContext();
            await this.connectSourceGraph();
        } catch (error) {
            console.error("[SoundReactivity] Failed to enable", error);
            this.disable();
            conf.audioEnabled = false;
            if (conf.gui) {
                conf.gui.refresh();
            }
        }
    }

    disable() {
        if (!this.enabled) { return; }
        this.enabled = false;
        this.disconnectSource();
        this.clearProfile();
        if (conf.audioEnabled) {
            conf.audioEnabled = false;
            if (conf.gui) { conf.gui.refresh(); }
        }
    }

    async connectSourceGraph() {
        if (this.sourceType === "file") {
            if (!this.fileBuffer) {
                this.openFileDialog();
                return;
            }
            this.startFilePlayback();
        } else {
            await this.connectMicrophone();
        }
    }

    async connectMicrophone() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Microphone input is not supported in this browser.");
        }
        this.disconnectSource();
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const micSource = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.buildGraph(micSource, { monitor: false });
    }

    startFilePlayback() {
        if (!this.fileBuffer) { return; }
        this.disconnectSource();
        const bufferSource = this.audioContext.createBufferSource();
        bufferSource.buffer = this.fileBuffer;
        bufferSource.loop = true;
        this.buildGraph(bufferSource, { monitor: true });
        bufferSource.start();
        this.bufferSource = bufferSource;
    }

    buildGraph(sourceNode, { monitor }) {
        this.sourceNode = sourceNode;
        this.gainNode = this.audioContext.createGain();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = THREE.MathUtils.clamp(conf.audioSmoothing, 0, 0.99);

        sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.analyser);
        if (monitor) {
            this.gainNode.connect(this.audioContext.destination);
        }

        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeDomainData = new Uint8Array(this.analyser.fftSize);
    }

    disconnectSource() {
        if (this.bufferSource) {
            try { this.bufferSource.stop(); } catch (e) { /* ignore */ }
            this.bufferSource.disconnect();
            this.bufferSource = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        this.frequencyData = null;
        this.timeDomainData = null;
    }

    async loadFile(file) {
        try {
            await this.ensureContext();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.fileBuffer = audioBuffer;
            this.sourceType = "file";
            conf.audioSource = "file";
            if (this.enabled) {
                this.startFilePlayback();
            }
        } catch (error) {
            console.error("[SoundReactivity] Failed to load audio file", error);
        }
    }

    openFileDialog() {
        if (!this.fileInput) { return; }
        this.fileInput.click();
    }

    setSource(source) {
        if (source !== "file" && source !== "microphone") { return; }
        this.sourceType = source;
        conf.audioSource = source;
        if (this.enabled) {
            this.connectSourceGraph();
        }
    }

    resetCalibration() {
        this.level = 0;
        this.beatEnvelope = 0;
        this.beatThreshold = 0.35;
        this.beatHoldTimer = 0;
        this.swirlPhase = 0;
    }

    clearProfile() {
        this.level = 0;
        this.beatEnvelope = 0;
        this.beatThreshold = 0.35;
        this.beatHoldTimer = 0;
        this.profile.level = 0;
        this.profile.beat = 0;
        this.profile.bands.low = 0;
        this.profile.bands.mid = 0;
        this.profile.bands.high = 0;
        this.profile.flow.set(0, 0, 0);
        this.profile.colorPulse = 0;
        conf.updateAudioMetrics(ZERO_METRICS);
    }

    update(delta, elapsed) {
        if (!this.enabled || !this.analyser || !this.frequencyData || !this.timeDomainData) {
            this.clearProfile();
            return null;
        }

        this.analyser.smoothingTimeConstant = THREE.MathUtils.clamp(conf.audioSmoothing, 0, 0.99);
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeDomainData);

        const bands = this.computeBandEnergies();
        const waveformEnergy = this.computeWaveformEnergy();

        const sensitivity = conf.audioSensitivity;
        const dynamics = conf.audioDynamics;
        const smoothing = THREE.MathUtils.clamp(conf.audioSmoothing, 0, 0.95);

        const baseLevel = (bands.low + bands.mid + bands.high + waveformEnergy) * 0.25;
        const calibratedLevel = Math.pow(Math.max(0, baseLevel * sensitivity), THREE.MathUtils.clamp(dynamics, 0.1, 3.0));
        this.level = THREE.MathUtils.lerp(this.level, calibratedLevel, 1 - smoothing);

        this.updateBeat(delta);

        const lowEnergy = Math.pow(Math.max(0, bands.low * conf.audioBassGain), THREE.MathUtils.clamp(dynamics, 0.1, 3.0));
        const midEnergy = Math.pow(Math.max(0, bands.mid * conf.audioMidGain), THREE.MathUtils.clamp(dynamics, 0.1, 3.0));
        const highEnergy = Math.pow(Math.max(0, bands.high * conf.audioTrebleGain), THREE.MathUtils.clamp(dynamics, 0.1, 3.0));

        const displacement = conf.audioDisplacement;
        const flowWeight = conf.audioFlow;
        const swirlWeight = conf.audioSwirl;

        this.swirlPhase += delta * (0.6 + highEnergy * 5 * swirlWeight + this.beatEnvelope * 2.5);
        const flow = this.profile.flow;
        flow.set(
            Math.sin(this.swirlPhase) * midEnergy * displacement,
            (lowEnergy * 2 - 0.6) * displacement,
            Math.cos(this.swirlPhase) * (highEnergy + midEnergy * 0.5) * displacement
        );
        flow.multiplyScalar(flowWeight);

        const colorPulse = THREE.MathUtils.clamp(highEnergy * conf.audioColorBoost + this.beatEnvelope * 0.5, 0, 2);

        this.profile.level = clamp01(this.level);
        this.profile.beat = clamp01(this.beatEnvelope);
        this.profile.bands.low = THREE.MathUtils.clamp(lowEnergy, 0, 2);
        this.profile.bands.mid = THREE.MathUtils.clamp(midEnergy, 0, 2);
        this.profile.bands.high = THREE.MathUtils.clamp(highEnergy, 0, 2);
        this.profile.colorPulse = colorPulse;

        conf.updateAudioMetrics({
            level: this.profile.level,
            beat: this.profile.beat,
            bass: this.profile.bands.low,
            mid: this.profile.bands.mid,
            treble: this.profile.bands.high,
        });

        return this.profile;
    }

    updateBeat(delta) {
        const beatHold = Math.max(0.05, conf.audioBeatHold);
        const beatDecay = THREE.MathUtils.clamp(conf.audioBeatDecay, 0.5, 0.999);
        const beatRelease = Math.max(0.5, conf.audioBeatRelease);

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
        const length = freqData.length;
        if (!length) { return { low: 0, mid: 0, high: 0 }; }

        const lowEnd = Math.max(1, Math.floor(length * 0.12));
        const midEnd = Math.max(lowEnd + 1, Math.floor(length * 0.5));

        let lowSum = 0;
        let midSum = 0;
        let highSum = 0;

        for (let i = 0; i < length; i++) {
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
        if (!data || !data.length) { return 0; }
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const centered = (data[i] - 128) / 128;
            sum += centered * centered;
        }
        return clamp01(Math.sqrt(sum / data.length));
    }
}

export default SoundReactivity;
