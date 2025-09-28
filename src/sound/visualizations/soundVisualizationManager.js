import * as THREE from "three/webgpu";
import ResonantLatticeVisualization from "./resonantLatticeVisualization.js";
import VorticityBloomVisualization from "./vorticityBloomVisualization.js";
import SonoluminalRibbonsVisualization from "./sonoluminalRibbonsVisualization.js";

class SoundVisualizationManager extends THREE.Group {
    constructor() {
        super();
        this.visualizations = {
            resonantLattice: new ResonantLatticeVisualization(),
            vorticityBloom: new VorticityBloomVisualization(),
            sonoluminalRibbons: new SonoluminalRibbonsVisualization(),
        };
        this.currentKey = null;
    }

    setMode(key, context) {
        if (this.currentKey === key) return;
        if (this.currentKey && this.visualizations[this.currentKey]) {
            const current = this.visualizations[this.currentKey];
            current.onExit?.(context);
            this.remove(current);
        }
        const next = this.visualizations[key];
        if (next) {
            this.currentKey = key;
            this.add(next);
            next.onEnter?.(context);
        }
    }

    update(features, delta, elapsed, context) {
        if (!this.currentKey) {
            const defaultKey = Object.keys(this.visualizations)[0];
            this.setMode(defaultKey, context);
        }
        const current = this.visualizations[this.currentKey];
        current?.update(features, delta, elapsed, context);
    }

    dispose() {
        for (const key of Object.keys(this.visualizations)) {
            const viz = this.visualizations[key];
            viz.onExit?.();
            viz.removeFromParent();
        }
        this.visualizations = {};
    }
}

export default SoundVisualizationManager;
