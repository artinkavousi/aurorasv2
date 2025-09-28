import * as THREE from "three/webgpu";
import { Pane } from "tweakpane";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import AppModule from "../core/module";
import AudioEngine from "../sound/audioEngine";
import SoundReactivityStore from "../sound/soundReactivityStore";
import SoundVisualizationManager from "../sound/visualizations/soundVisualizationManager";

class SoundReactivityModule extends AppModule {
    constructor(options = {}) {
        super({
            id: options.id || "soundReactivity",
            autoStart: options.autoStart ?? true,
            order: options.order ?? 25,
        });
        this.audioEngine = null;
        this.store = null;
        this.currentState = null;
        this.visualizations = null;
        this.container = null;
        this.pane = null;
        this.fileInput = null;
        this.monitorValues = {
            amplitude: 0,
            bass: 0,
            mid: 0,
            treble: 0,
            centroid: 0,
            beat: 0,
        };
        this.status = { message: "Idle" };
        this.uiMacros = null;
        this.analysisParams = null;
        this.unsubscribe = null;
        this.baseline = null;
        this.lastFeatures = {
            amplitude: 0,
            bass: 0,
            mid: 0,
            treble: 0,
            spectralCentroid: 0,
            beat: { isOnset: false, confidence: 0 },
            isActive: false,
        };
    }

    async init({ scene, services, conf }) {
        this.audioEngine = new AudioEngine();
        this.store = new SoundReactivityStore();
        this.currentState = this.store.getState();
        this.visualizations = new SoundVisualizationManager();
        this.visualizations.position.set(0, 0.1, 0.2);
        scene.add(this.visualizations);

        this.baseline = {
            noise: conf.noise,
            speed: conf.speed,
            density: conf.density,
            bloomStrength: null,
            bloomRadius: null,
        };

        this.audioEngine.setSmoothing(this.currentState.smoothing);
        this.audioEngine.setSensitivity(this.currentState.sensitivity);

        this.setupPanel();
        this.syncUiWithState(this.currentState);
        this.visualizations.setMode(this.currentState.mode, { state: this.currentState });

        this.unsubscribe = this.store.subscribe((state) => {
            this.currentState = state;
            this.audioEngine.setSmoothing(state.smoothing);
            this.audioEngine.setSensitivity(state.sensitivity);
            this.visualizations.setMode(state.mode, { state, features: this.lastFeatures });
            this.syncUiWithState(state);
        });

        services.sound = {
            engine: this.audioEngine,
            store: this.store,
            getFeatures: () => ({ ...this.lastFeatures }),
        };
    }

    setupPanel() {
        this.container = document.createElement("div");
        this.container.style.position = "absolute";
        this.container.style.top = "16px";
        this.container.style.right = "16px";
        this.container.style.width = "320px";
        this.container.style.maxWidth = "90vw";
        this.container.style.zIndex = "30";
        this.container.style.pointerEvents = "auto";
        document.body.appendChild(this.container);

        this.pane = new Pane({ container: this.container, title: "Sound Reactivity" });
        this.pane.registerPlugin(EssentialsPlugin);

        const sourceFolder = this.pane.addFolder({ title: "Audio Source", expanded: true });
        sourceFolder.addButton({ title: "Enable Microphone" }).on("click", async () => {
            try {
                await this.audioEngine.enableMic();
                this.status.message = "Microphone active";
                this.pane.refresh();
            } catch (error) {
                console.error(error);
                this.status.message = error?.message || "Mic access denied";
                this.pane.refresh();
            }
        });
        sourceFolder.addButton({ title: "Load Audio File" }).on("click", () => {
            this.fileInput?.click();
        });
        sourceFolder.addButton({ title: "Stop Audio" }).on("click", () => {
            this.audioEngine.stopCurrentSource();
            this.status.message = "Audio stopped";
            this.pane.refresh();
        });
        sourceFolder.addMonitor(this.status, "message", { label: "status", interval: 200, multiline: true });

        const presets = this.pane.addBlade({
            view: "list",
            label: "visualization",
            options: [
                { text: "Resonant Lattice", value: "resonantLattice" },
                { text: "Vorticity Bloom", value: "vorticityBloom" },
                { text: "Sonoluminal Ribbons", value: "sonoluminalRibbons" },
            ],
            value: this.currentState.mode,
        });
        presets.on("change", (event) => {
            this.store.setMode(event.value);
        });

        const macrosFolder = this.pane.addFolder({ title: "Performance Macros", expanded: true });
        this.uiMacros = { ...this.currentState.macros };
        for (const key of Object.keys(this.uiMacros)) {
            macrosFolder.addBinding(this.uiMacros, key, { min: 0, max: 1 }).on("change", (event) => {
                this.store.updateMacro(key, event.value);
            });
        }

        const analysisFolder = this.pane.addFolder({ title: "Analysis", expanded: false });
        this.analysisParams = {
            smoothing: this.currentState.smoothing,
            sensitivity: this.currentState.sensitivity,
        };
        analysisFolder.addBinding(this.analysisParams, "smoothing", { min: 0, max: 1 }).on("change", (event) => {
            this.store.setSmoothing(event.value);
        });
        analysisFolder.addBinding(this.analysisParams, "sensitivity", { min: 0, max: 1 }).on("change", (event) => {
            this.store.setSensitivity(event.value);
        });

        const meters = this.pane.addFolder({ title: "Meters", expanded: true });
        meters.addMonitor(this.monitorValues, "amplitude", { min: 0, max: 1, interval: 60 });
        meters.addMonitor(this.monitorValues, "bass", { min: 0, max: 1, interval: 60 });
        meters.addMonitor(this.monitorValues, "mid", { min: 0, max: 1, interval: 60 });
        meters.addMonitor(this.monitorValues, "treble", { min: 0, max: 1, interval: 60 });
        meters.addMonitor(this.monitorValues, "centroid", { min: 0, max: 1, interval: 60 });
        meters.addMonitor(this.monitorValues, "beat", { min: 0, max: 1, interval: 60 });

        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = "audio/*";
        this.fileInput.style.display = "none";
        this.fileInput.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                await this.audioEngine.loadFile(file);
                this.status.message = `Loaded: ${file.name}`;
                this.pane.refresh();
            } catch (error) {
                console.error(error);
                this.status.message = error?.message || "Failed to load audio";
                this.pane.refresh();
            }
        });
        document.body.appendChild(this.fileInput);
    }

    syncUiWithState(state) {
        if (!this.pane) return;
        if (this.uiMacros) {
            for (const key of Object.keys(this.uiMacros)) {
                this.uiMacros[key] = state.macros[key];
            }
        }
        if (this.analysisParams) {
            this.analysisParams.smoothing = state.smoothing;
            this.analysisParams.sensitivity = state.sensitivity;
        }
        this.pane.refresh();
    }

    async update(frameContext) {
        if (!this.audioEngine) return;
        const { delta, elapsed, conf, services } = frameContext;
        const features = this.audioEngine.update(delta || 0.016);
        this.lastFeatures = features;
        this.monitorValues.amplitude = features.amplitude;
        this.monitorValues.bass = features.bass;
        this.monitorValues.mid = features.mid;
        this.monitorValues.treble = features.treble;
        this.monitorValues.centroid = features.spectralCentroid;
        this.monitorValues.beat = features.beat?.confidence ?? 0;
        this.status.message = features.isActive ? "Analyzing audio" : this.status.message;

        this.visualizations.update(features, delta || 0.016, elapsed || 0, {
            macros: this.currentState.macros,
        });

        this.applyModulations(frameContext, features);

        if (!features.isActive && features.amplitude < 0.001) {
            this.status.message = "Waiting for audio";
        }
    }

    applyModulations(frameContext, features) {
        const { conf, services } = frameContext;
        if (!this.baseline) return;
        const macros = this.currentState.macros;
        const beatImpulse = features.beat?.isOnset ? features.beat.confidence : 0;
        const amplitude = features.amplitude;
        const bass = features.bass;
        const mid = features.mid;
        const treble = features.treble;

        const noiseTarget = this.baseline.noise + (bass * (0.6 + macros.hype) + beatImpulse * 0.4) * 0.9;
        conf.noise = THREE.MathUtils.lerp(conf.noise, noiseTarget, 0.1);

        const speedTarget = this.baseline.speed + (mid * (0.5 + macros.flow * 0.6) + beatImpulse * 0.3) * 0.45;
        conf.speed = THREE.MathUtils.clamp(THREE.MathUtils.lerp(conf.speed, speedTarget, 0.08), 0.1, 2);

        const densityTarget = THREE.MathUtils.clamp(this.baseline.density + bass * 0.25 - macros.chill * 0.2, 0.4, 2);
        conf.density = THREE.MathUtils.lerp(conf.density, densityTarget, 0.08);
        conf.updateParams();

        if (services.postProcessing?.bloomPass) {
            if (this.baseline.bloomStrength === null) {
                this.baseline.bloomStrength = services.postProcessing.bloomPass.strength.value;
            }
            if (this.baseline.bloomRadius === null) {
                this.baseline.bloomRadius = services.postProcessing.bloomPass.radius.value;
            }
            const bloomTarget = this.baseline.bloomStrength + amplitude * (1.4 + macros.hype) + treble * 0.6;
            services.postProcessing.bloomPass.strength.value = THREE.MathUtils.lerp(
                services.postProcessing.bloomPass.strength.value,
                bloomTarget,
                0.12,
            );
            const radiusTarget = this.baseline.bloomRadius + amplitude * 0.2 + mid * 0.1;
            services.postProcessing.bloomPass.radius.value = THREE.MathUtils.lerp(
                services.postProcessing.bloomPass.radius.value,
                radiusTarget,
                0.12,
            );
        }
    }

    async dispose({ scene, services, conf }) {
        this.audioEngine?.stopCurrentSource();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.visualizations) {
            this.visualizations.dispose();
            scene.remove(this.visualizations);
            this.visualizations = null;
        }
        if (this.pane) {
            this.pane.dispose();
            this.pane = null;
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        if (this.fileInput) {
            this.fileInput.remove();
            this.fileInput = null;
        }
        if (services.sound?.engine === this.audioEngine) {
            delete services.sound;
        }
        if (this.baseline) {
            conf.noise = this.baseline.noise;
            conf.speed = this.baseline.speed;
            conf.density = this.baseline.density;
            conf.updateParams();
            if (services.postProcessing?.bloomPass) {
                if (this.baseline.bloomStrength !== null) {
                    services.postProcessing.bloomPass.strength.value = this.baseline.bloomStrength;
                }
                if (this.baseline.bloomRadius !== null) {
                    services.postProcessing.bloomPass.radius.value = this.baseline.bloomRadius;
                }
            }
        }
        this.audioEngine = null;
        this.store = null;
        this.currentState = null;
        this.baseline = null;
    }
}

export default SoundReactivityModule;
