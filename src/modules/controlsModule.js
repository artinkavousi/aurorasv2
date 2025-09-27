import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import AppModule from "../core/module";

class ControlsModule extends AppModule {
    constructor(options = {}) {
        super({
            id: options.id || "controls",
            autoStart: options.autoStart ?? true,
            order: options.order ?? 10,
        });
        this.options = {
            target: options.target ?? [0, 0.5, 0.2],
            enableDamping: options.enableDamping ?? true,
            enablePan: options.enablePan ?? false,
            touches: options.touches ?? { TWO: THREE.TOUCH.DOLLY_ROTATE },
            maxDistance: options.maxDistance ?? 2.0,
            minPolarAngle: options.minPolarAngle ?? 0.2 * Math.PI,
            maxPolarAngle: options.maxPolarAngle ?? 0.8 * Math.PI,
            minAzimuthAngle: options.minAzimuthAngle ?? 0.7 * Math.PI,
            maxAzimuthAngle: options.maxAzimuthAngle ?? 1.3 * Math.PI,
        };
        this.controls = null;
    }

    async init({ camera, renderer, services }) {
        this.controls = new OrbitControls(camera, renderer.domElement);
        this.controls.target.fromArray(this.options.target);
        this.controls.enableDamping = this.options.enableDamping;
        this.controls.enablePan = this.options.enablePan;
        this.controls.touches = this.options.touches;
        this.controls.maxDistance = this.options.maxDistance;
        this.controls.minPolarAngle = this.options.minPolarAngle;
        this.controls.maxPolarAngle = this.options.maxPolarAngle;
        this.controls.minAzimuthAngle = this.options.minAzimuthAngle;
        this.controls.maxAzimuthAngle = this.options.maxAzimuthAngle;
        services.controls = this.controls;
    }

    async update() {
        if (!this.controls) return;
        this.controls.update();
    }

    async dispose({ services }) {
        if (this.controls) {
            this.controls.dispose?.();
        }
        if (services.controls === this.controls) {
            delete services.controls;
        }
        this.controls = null;
    }
}

export default ControlsModule;
