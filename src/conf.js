import {Pane} from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import mobile from "is-mobile";
import * as THREE from "three/webgpu";

class Conf {
    gui = null;
    maxParticles = 8192 * 16;
    particles = 8192 * 4;

    bloom = true;

    run = true;
    noise = 1.0;
    speed = 1;
    stiffness = 3.;
    restDensity = 1.;
    density = 1;
    dynamicViscosity = 0.1;
    gravity = 0;
    gravitySensorReading = new THREE.Vector3();
    accelerometerReading = new THREE.Vector3();
    actualSize = 1;
    size = 1;

    points = false;

    audioEnabled = false;
    audioSource = "microphone";
    audioSensitivity = 1.0;
    audioSmoothing = 0.65;
    audioDynamics = 0.8;
    audioBassGain = 1.1;
    audioMidGain = 1.0;
    audioTrebleGain = 1.0;
    audioFlow = 0.6;
    audioSwirl = 0.55;
    audioDisplacement = 0.35;
    audioColorBoost = 0.8;
    audioBeatHold = 0.12;
    audioBeatDecay = 0.92;
    audioBeatRelease = 1.6;
    audioMetrics = { level: 0, beat: 0, bass: 0, mid: 0, treble: 0 };

    constructor(info) {
        if (mobile()) {
            this.maxParticles = 8192 * 8;
            this.particles = 4096;
        }
        this.updateParams();

    }

    updateParams() {
        const level = Math.max(this.particles / 8192,1);
        const size = 1.6/Math.pow(level, 1/3);
        this.actualSize = size * this.size;
        this.restDensity = 0.25 * level * this.density;
    }

    setupGravitySensor() {
        if (this.gravitySensor) { return; }
        this.gravitySensor = new GravitySensor({ frequency: 60 });
        this.gravitySensor.addEventListener("reading", (e) => {
            this.gravitySensorReading.copy(this.gravitySensor).divideScalar(50);
            this.gravitySensorReading.setY(this.gravitySensorReading.y * -1);
        });
        this.gravitySensor.start();
    }

    init() {
        const gui = new Pane()
        gui.registerPlugin(EssentialsPlugin);

        const stats = gui.addFolder({
            title: "stats",
            expanded: false,
        });
        this.fpsGraph = stats.addBlade({
            view: 'fpsgraph',
            label: 'fps',
            rows: 2,
        });

        const settings = gui.addFolder({
            title: "settings",
            expanded: false,
        });
        settings.addBinding(this, "particles", { min: 4096, max: this.maxParticles, step: 4096 }).on('change', () => { this.updateParams(); });
        settings.addBinding(this, "size", { min: 0.5, max: 2, step: 0.1 }).on('change', () => { this.updateParams(); });
        settings.addBinding(this, "bloom");
        //settings.addBinding(this, "points");

        const simulation = settings.addFolder({
            title: "simulation",
            expanded: false,
        });
        simulation.addBinding(this, "run");
        simulation.addBinding(this, "noise", { min: 0, max: 2, step: 0.01 });
        simulation.addBinding(this, "speed", { min: 0.1, max: 2, step: 0.1 });
        simulation.addBlade({
            view: 'list',
            label: 'gravity',
            options: [
                {text: 'back', value: 0},
                {text: 'down', value: 1},
                {text: 'center', value: 2},
                {text: 'device gravity', value: 3},
            ],
            value: 0,
        }).on('change', (ev) => {
            if (ev.value === 3) {
                this.setupGravitySensor();
            }
            this.gravity = ev.value;
        });
        simulation.addBinding(this, "density", { min: 0.4, max: 2, step: 0.1 }).on('change', () => { this.updateParams(); });;
        /*simulation.addBinding(this, "stiffness", { min: 0.5, max: 10, step: 0.1 });
        simulation.addBinding(this, "restDensity", { min: 0.5, max: 10, step: 0.1 });
        simulation.addBinding(this, "dynamicViscosity", { min: 0.01, max: 0.4, step: 0.01 });*/

        /*settings.addBinding(this, "roughness", { min: 0.0, max: 1, step: 0.01 });
        settings.addBinding(this, "metalness", { min: 0.0, max: 1, step: 0.01 });*/

        this.gui = gui;
    }

    attachSoundReactivity(soundReactivity) {
        if (!this.gui || !soundReactivity) { return; }
        if (this.soundFolder) {
            this.soundFolder.dispose();
        }

        this.soundFolder = this.gui.addFolder({
            title: "sound-reactivity",
            expanded: false,
        });

        this.soundFolder.addBinding(this, "audioEnabled", { label: "enabled" }).on('change', (ev) => {
            if (ev.value) {
                soundReactivity.enable();
            } else {
                soundReactivity.disable();
            }
        });

        this.soundFolder.addBinding(this, "audioSource", {
            view: 'list',
            label: 'input',
            options: [
                { text: 'microphone', value: 'microphone' },
                { text: 'audio file', value: 'file' },
            ],
        }).on('change', (ev) => {
            this.audioSource = ev.value;
            soundReactivity.setSource(ev.value);
            if (ev.value === 'file') {
                soundReactivity.openFileDialog();
            }
        });

        this.soundFolder.addButton({ title: 'select audio file' }).on('click', () => {
            soundReactivity.openFileDialog();
        });

        this.soundFolder.addButton({ title: 'reset calibration' }).on('click', () => {
            soundReactivity.resetCalibration();
        });

        const calibration = this.soundFolder.addFolder({
            title: 'calibration',
            expanded: false,
        });
        calibration.addBinding(this, "audioSensitivity", { min: 0.2, max: 3, step: 0.05 });
        calibration.addBinding(this, "audioSmoothing", { min: 0, max: 0.95, step: 0.01 });
        calibration.addBinding(this, "audioDynamics", { min: 0.25, max: 3, step: 0.05 });

        const bands = this.soundFolder.addFolder({
            title: 'band gains',
            expanded: false,
        });
        bands.addBinding(this, "audioBassGain", { min: 0.1, max: 3, step: 0.05, label: 'bass' });
        bands.addBinding(this, "audioMidGain", { min: 0.1, max: 3, step: 0.05, label: 'mid' });
        bands.addBinding(this, "audioTrebleGain", { min: 0.1, max: 3, step: 0.05, label: 'treble' });

        const choreography = this.soundFolder.addFolder({
            title: 'choreography',
            expanded: false,
        });
        choreography.addBinding(this, "audioDisplacement", { min: 0.1, max: 1.2, step: 0.05, label: 'displacement' });
        choreography.addBinding(this, "audioFlow", { min: 0, max: 2, step: 0.05, label: 'groove' });
        choreography.addBinding(this, "audioSwirl", { min: 0, max: 2, step: 0.05, label: 'swirl' });
        choreography.addBinding(this, "audioColorBoost", { min: 0, max: 2, step: 0.05, label: 'color' });

        const beat = this.soundFolder.addFolder({
            title: 'beat detection',
            expanded: false,
        });
        beat.addBinding(this, "audioBeatHold", { min: 0.05, max: 0.5, step: 0.01, label: 'hold' });
        beat.addBinding(this, "audioBeatDecay", { min: 0.5, max: 0.99, step: 0.01, label: 'decay' });
        beat.addBinding(this, "audioBeatRelease", { min: 0.5, max: 5, step: 0.1, label: 'release' });

        const metrics = this.soundFolder.addFolder({
            title: 'metrics',
            expanded: false,
        });
        metrics.addMonitor(this.audioMetrics, 'level', { view: 'graph', min: 0, max: 1, interval: 16 });
        metrics.addMonitor(this.audioMetrics, 'beat', { min: 0, max: 1, interval: 16 });
        metrics.addMonitor(this.audioMetrics, 'bass', { min: 0, max: 2, interval: 16 });
        metrics.addMonitor(this.audioMetrics, 'mid', { min: 0, max: 2, interval: 16 });
        metrics.addMonitor(this.audioMetrics, 'treble', { min: 0, max: 2, interval: 16 });

        soundReactivity.setSource(this.audioSource);
        if (this.audioEnabled) {
            soundReactivity.enable();
        }
    }

    update() {
    }

    begin() {
        this.fpsGraph.begin();
    }
    end() {
        this.fpsGraph.end();
    }

    updateAudioMetrics(metrics) {
        if (!metrics) { return; }
        Object.assign(this.audioMetrics, metrics);
    }
}

export const conf = new Conf();
