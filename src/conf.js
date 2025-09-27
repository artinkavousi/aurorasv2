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

    update() {
    }

    begin() {
        this.fpsGraph.begin();
    }
    end() {
        this.fpsGraph.end();
    }
}
export const conf = new Conf();