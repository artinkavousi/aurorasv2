import * as THREE from "three/webgpu";

const clamp01 = (value) => Math.min(1, Math.max(0, value));

class AudioEngine {
    constructor({ fftSize = 4096 } = {}) {
        this.fftSize = fftSize;
        this.context = null;
        this.gainNode = null;
        this.analyser = null;
        this.source = null;
        this.stream = null;
        this.timeDomainData = null;
        this.frequencyData = null;
        this.features = {
            amplitude: 0,
            bass: 0,
            mid: 0,
            treble: 0,
            spectralCentroid: 0,
            beat: {
                isOnset: false,
                confidence: 0,
            },
            isActive: false,
        };
        this.energyHistory = [];
        this.energyHistorySize = 64;
        this.beatHoldTime = 0;
        this.beatHoldDuration = 0.12;
        this.smoothing = 0.6;
        this.sensitivity = 0.5;
        this.lastUpdateTime = 0;
    }

    async ensureContext() {
        if (!this.context) {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.context.createGain();
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = this.fftSize;
            this.analyser.smoothingTimeConstant = 0.6;
            this.analyser.minDecibels = -100;
            this.analyser.maxDecibels = -10;
            this.gainNode.connect(this.analyser);
            this.analyser.connect(this.context.destination);
            this.timeDomainData = new Float32Array(this.analyser.fftSize);
            this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
        }
        if (this.context?.state === "suspended") {
            await this.context.resume();
        }
    }

    async enableMic() {
        await this.ensureContext();
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Microphone access is not supported in this browser");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.stopCurrentSource();
        this.stream = stream;
        this.source = this.context.createMediaStreamSource(stream);
        this.source.connect(this.gainNode);
        this.features.isActive = true;
    }

    async loadFile(file) {
        await this.ensureContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
        const bufferSource = this.context.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.loop = true;
        this.stopCurrentSource();
        bufferSource.connect(this.gainNode);
        bufferSource.start(0);
        this.source = bufferSource;
        this.features.isActive = true;
    }

    stopCurrentSource() {
        if (this.source) {
            try {
                this.source.disconnect();
                this.source.stop?.();
            } catch (error) {
                console.warn("Failed to stop audio source", error);
            }
            this.source = null;
        }
        if (this.stream) {
            for (const track of this.stream.getTracks()) {
                track.stop();
            }
            this.stream = null;
        }
        this.features.isActive = false;
    }

    setSmoothing(value) {
        this.smoothing = clamp01(value);
        if (this.analyser) {
            this.analyser.smoothingTimeConstant = 0.4 + this.smoothing * 0.5;
        }
    }

    setSensitivity(value) {
        this.sensitivity = clamp01(value);
    }

    update(delta = 0) {
        if (!this.analyser) {
            return { ...this.features };
        }
        this.analyser.getFloatTimeDomainData(this.timeDomainData);
        this.analyser.getFloatFrequencyData(this.frequencyData);

        const amplitude = this.computeAmplitude();
        const { bass, mid, treble, centroid } = this.computeFrequencyBands();
        const beat = this.computeBeat(amplitude, delta);

        const lerpFactor = 1 - Math.pow(1 - (0.35 + this.smoothing * 0.5), Math.max(delta, 0.016));
        this.features.amplitude = THREE.MathUtils.lerp(this.features.amplitude, amplitude, lerpFactor);
        this.features.bass = THREE.MathUtils.lerp(this.features.bass, bass, lerpFactor);
        this.features.mid = THREE.MathUtils.lerp(this.features.mid, mid, lerpFactor);
        this.features.treble = THREE.MathUtils.lerp(this.features.treble, treble, lerpFactor);
        this.features.spectralCentroid = THREE.MathUtils.lerp(this.features.spectralCentroid, centroid, lerpFactor);
        this.features.beat = beat;

        return { ...this.features };
    }

    computeAmplitude() {
        let sumSquares = 0;
        for (let i = 0; i < this.timeDomainData.length; i += 1) {
            const sample = this.timeDomainData[i];
            sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / this.timeDomainData.length);
        return clamp01(rms);
    }

    computeFrequencyBands() {
        const { frequencyBinCount } = this.analyser;
        const nyquist = this.context.sampleRate / 2;
        const bins = frequencyBinCount;
        let bass = 0;
        let mid = 0;
        let treble = 0;
        let bassCount = 0;
        let midCount = 0;
        let trebleCount = 0;
        let centroidWeight = 0;
        let centroidTotal = 0;

        for (let i = 0; i < bins; i += 1) {
            const db = this.frequencyData[i];
            const magnitude = clamp01((db - this.analyser.minDecibels) / (this.analyser.maxDecibels - this.analyser.minDecibels));
            const freq = (i / bins) * nyquist;
            if (freq < 200) {
                bass += magnitude;
                bassCount += 1;
            } else if (freq < 2000) {
                mid += magnitude;
                midCount += 1;
            } else {
                treble += magnitude;
                trebleCount += 1;
            }
            centroidWeight += freq * magnitude;
            centroidTotal += magnitude;
        }

        bass = bassCount > 0 ? bass / bassCount : 0;
        mid = midCount > 0 ? mid / midCount : 0;
        treble = trebleCount > 0 ? treble / trebleCount : 0;
        const centroid = centroidTotal > 0 ? centroidWeight / (centroidTotal * nyquist) : 0;

        return {
            bass: clamp01(bass),
            mid: clamp01(mid),
            treble: clamp01(treble),
            centroid: clamp01(centroid),
        };
    }

    computeBeat(amplitude, delta) {
        if (!Number.isFinite(delta) || delta <= 0) {
            delta = 0.016;
        }
        this.energyHistory.push(amplitude);
        if (this.energyHistory.length > this.energyHistorySize) {
            this.energyHistory.shift();
        }
        const average = this.energyHistory.reduce((acc, value) => acc + value, 0) / this.energyHistory.length || 0;
        const variance = this.energyHistory.reduce((acc, value) => acc + (value - average) ** 2, 0) / this.energyHistory.length || 0;
        const sensitivity = 1.2 + this.sensitivity * 0.9;
        const threshold = average + Math.sqrt(variance) * sensitivity;

        let isOnset = false;
        let confidence = 0;
        if (amplitude > threshold && amplitude > 0.12) {
            if (this.beatHoldTime <= 0) {
                isOnset = true;
                confidence = clamp01((amplitude - threshold) * 6);
                this.beatHoldTime = this.beatHoldDuration;
            }
        }
        this.beatHoldTime = Math.max(0, this.beatHoldTime - delta);

        if (!isOnset) {
            confidence = clamp01(amplitude / (threshold || 1));
        }

        return { isOnset, confidence };
    }
}

export default AudioEngine;
