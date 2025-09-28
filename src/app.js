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
import SoundReactivityModule from "./modules/soundReactivityModule";
import hdri from "./assets/autumn_field_puresky_1k.hdr";

const defaultProgress = async () => {};

class App {
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

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 5);
        this.camera.position.set(0, 0.5, -1);
        this.camera.updateProjectionMatrix();

        this.scene = new THREE.Scene();

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
        this.moduleManager.registerModule(new SimulationModule({ pointerListenerTarget: this.renderer.domElement }));
        this.moduleManager.registerModule(new SoundReactivityModule());
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
    }

    async update(delta, elapsed) {
        conf.begin();
        const frameContext = this.moduleManager
            ? await this.moduleManager.update(delta, elapsed)
            : { renderOverride: null };

        if (frameContext.renderOverride) {
            await frameContext.renderOverride.fn(frameContext);
        } else if (this.services.postProcessing?.pipeline) {
            await this.services.postProcessing.pipeline.renderAsync();
        } else {
            await this.renderer.renderAsync(this.scene, this.camera);
        }
        conf.end();
    }

    async dispose() {
        if (this.moduleManager) {
            await this.moduleManager.disposeAll();
        }
        this.info = null;
    }
}

export default App;
