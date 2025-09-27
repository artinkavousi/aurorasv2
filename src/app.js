<<<<<<< HEAD
import { conf } from "./conf";
import { Info } from "./info";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "./mls-mpm/particleRenderer";
import PointRenderer from "./mls-mpm/pointRenderer.js";
import { createStage } from "./stage/stage.js";
import { createPostProcessing } from "./postfx/postProcessing.js";

const defaultProgress = async () => {};

class App {
    renderer = null;
    stage = null;
    scene = null;
    camera = null;
    postProcessing = null;
    bloomPass = null;
    pointerListener = null;

=======
import * as THREE from "three/webgpu";
import { conf } from "./conf";
import { Info } from "./info";
import ModuleManager from "./core/moduleManager";
import EnvironmentModule from "./modules/environmentModule";
import ControlsModule from "./modules/controlsModule";
import LightingModule from "./modules/lightingModule";
import BackgroundModule from "./modules/backgroundModule";
import SimulationModule from "./modules/simulationModule";
import PostProcessingModule from "./modules/postProcessingModule";
import hdri from "./assets/autumn_field_puresky_1k.hdr";

class App {
>>>>>>> origin/pr/6
    constructor(renderer) {
        this.renderer = renderer;
        this.camera = null;
        this.scene = null;
        this.info = null;
        this.services = {};
        this.moduleManager = null;
    }

    async init(progressCallback = defaultProgress) {
        this.info = new Info();
        conf.init();

<<<<<<< HEAD
        this.stage = createStage(this.renderer);
        await this.stage.init(progressCallback);
=======
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 5);
        this.camera.position.set(0, 0.5, -1);
        this.camera.updateProjectionMatrix();
>>>>>>> origin/pr/6

        const { scene, camera } = this.stage.handle;
        this.scene = scene;
        this.camera = camera;

<<<<<<< HEAD
        await progressCallback(0.7);

        this.mlsMpmSim = new MlsMpmSimulator(this.renderer);
        await this.mlsMpmSim.init();

        this.particleRenderer = new ParticleRenderer(this.mlsMpmSim);
        this.stage.handle.add(this.particleRenderer.object);

        this.pointRenderer = new PointRenderer(this.mlsMpmSim);
        this.stage.handle.add(this.pointRenderer.object);

        await progressCallback(0.85);

        this.postProcessing = createPostProcessing(this.stage.handle);
        this.bloomPass = this.postProcessing.bloomPass;
        this.bloomPass.threshold.value = 0.001;
        this.bloomPass.strength.value = 0.94;
        this.bloomPass.radius.value = 0.8;

        await progressCallback(0.95);

        this.pointerListener = (event) => {
            const projection = this.stage.pointer.project(event.clientX, event.clientY);
            if (projection) {
                this.mlsMpmSim.setMouseRay(
                    projection.origin,
                    projection.direction,
                    projection.point,
                );
            }
        };
        this.renderer.domElement.addEventListener("pointermove", this.pointerListener);

        await progressCallback(1.0, 100);
    }

    resize(width, height) {
        this.stage.resize(width, height);
=======
        this.moduleManager = new ModuleManager({
            app: this,
            renderer: this.renderer,
            camera: this.camera,
            scene: this.scene,
            conf,
            info: this.info,
            services: this.services,
        });

        this.moduleManager.registerModule(new EnvironmentModule({ hdri }));
        this.moduleManager.registerModule(new ControlsModule());
        this.moduleManager.registerModule(new LightingModule());
        this.moduleManager.registerModule(new BackgroundModule());
        this.moduleManager.registerModule(new SimulationModule());
        this.moduleManager.registerModule(new PostProcessingModule());

        const autoModules = this.moduleManager.getAutoStartModules();
        if (progressCallback) {
            await progressCallback(0.05);
        }

        let initializedModules = 0;
        await this.moduleManager.initAll({
            onModuleInitialized: async () => {
                initializedModules += 1;
                if (progressCallback && autoModules.length > 0) {
                    const fraction = 0.05 + (0.9 * initializedModules) / autoModules.length;
                    await progressCallback(Math.min(fraction, 0.95));
                }
            },
        });

        if (progressCallback) {
            await progressCallback(1.0, 100);
        }
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        if (this.moduleManager) {
            this.moduleManager.resize(width, height);
        }
>>>>>>> origin/pr/6
    }

    async update(delta, elapsed) {
        conf.begin();
<<<<<<< HEAD

        this.particleRenderer.object.visible = !conf.points;
        this.pointRenderer.object.visible = conf.points;

        this.stage.update(delta, elapsed);
        this.particleRenderer.update();
        this.pointRenderer.update();

        await this.mlsMpmSim.update(delta, elapsed);

        if (conf.bloom) {
            await this.postProcessing.render();
=======
        const frameContext = this.moduleManager
            ? await this.moduleManager.update(delta, elapsed)
            : { renderOverride: null };
        if (frameContext.renderOverride) {
            await frameContext.renderOverride.fn(frameContext);
>>>>>>> origin/pr/6
        } else {
            await this.postProcessing.renderScene();
        }
        conf.end();
    }

    dispose() {
        if (this.pointerListener) {
            this.renderer.domElement.removeEventListener("pointermove", this.pointerListener);
        }
        this.stage?.dispose();
        this.postProcessing?.dispose();
    }
}

export default App;
