import * as THREE from "three/webgpu";
import AppModule from "../core/module";
import MlsMpmSimulator from "../mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "../mls-mpm/particleRenderer";
import PointRenderer from "../mls-mpm/pointRenderer";

class SimulationModule extends AppModule {
    constructor(options = {}) {
        super({
            id: options.id || "simulation",
            autoStart: options.autoStart ?? true,
            order: options.order ?? 30,
        });
        this.pointerPlane = options.pointerPlane || new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.2);
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.pointerListenerTarget = options.pointerListenerTarget || null;
        this.simulator = null;
        this.particleRenderer = null;
        this.pointRenderer = null;
        this.onPointerMove = this.handlePointerMove.bind(this);
    }

    async init({ renderer, scene, camera, services }) {
        this.simulator = new MlsMpmSimulator(renderer);
        await this.simulator.init();

        this.particleRenderer = new ParticleRenderer(this.simulator);
        this.pointRenderer = new PointRenderer(this.simulator);

        scene.add(this.particleRenderer.object);
        scene.add(this.pointRenderer.object);

        services.simulation = {
            simulator: this.simulator,
            particleRenderer: this.particleRenderer,
            pointRenderer: this.pointRenderer,
        };

        const target = this.pointerListenerTarget || renderer.domElement;
        target.addEventListener("pointermove", this.onPointerMove);
        this.pointerListenerTarget = target;
        this.camera = camera;
    }

    async update(frameContext) {
        if (!this.simulator) return;
        const { delta, elapsed, conf } = frameContext;

        this.particleRenderer.object.visible = !conf.points;
        this.pointRenderer.object.visible = conf.points;

        this.particleRenderer.update();
        this.pointRenderer.update();
        await this.simulator.update(delta, elapsed);
    }

    async dispose({ scene, services }) {
        if (this.pointerListenerTarget) {
            this.pointerListenerTarget.removeEventListener("pointermove", this.onPointerMove);
        }
        if (this.particleRenderer) {
            scene.remove(this.particleRenderer.object);
        }
        if (this.pointRenderer) {
            scene.remove(this.pointRenderer.object);
        }
        if (services.simulation?.simulator === this.simulator) {
            delete services.simulation;
        }
        this.simulator = null;
        this.particleRenderer = null;
        this.pointRenderer = null;
        this.pointerListenerTarget = null;
    }

    handlePointerMove(event) {
        if (!this.camera || !this.simulator) return;
        const target = this.pointerListenerTarget;
        const rect = target?.getBoundingClientRect?.();
        const width = rect?.width || window.innerWidth;
        const height = rect?.height || window.innerHeight;
        const offsetX = rect ? event.clientX - rect.left : event.clientX;
        const offsetY = rect ? event.clientY - rect.top : event.clientY;
        this.pointer.x = (offsetX / width) * 2 - 1;
        this.pointer.y = -(offsetY / height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersect = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.pointerPlane, intersect);
        if (intersect) {
            this.simulator.setMouseRay(this.raycaster.ray.origin, this.raycaster.ray.direction, intersect);
        }
    }
}

export default SimulationModule;
