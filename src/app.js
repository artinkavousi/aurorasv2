<<<<<<< HEAD
import { conf } from "./conf";
import { Info } from "./info";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "./mls-mpm/particleRenderer";
import PointRenderer from "./mls-mpm/pointRenderer.js";
<<<<<<< HEAD
import { createStage } from "./stage/stage.js";
import { createPostProcessing } from "./postfx/postProcessing.js";
=======
import SoundReactivity from "./audio/soundReactivity";
>>>>>>> origin/pr/4

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

<<<<<<< HEAD
class App {
>>>>>>> origin/pr/6
=======
    soundReactivity = null;

>>>>>>> origin/pr/4
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
import SoundReactivity from "./audio/soundReactivity";
import hdri from "./assets/autumn_field_puresky_1k.hdr";

const defaultProgress = async () => {};

class App {
    renderer = null;
    scene = null;
    camera = null;
    info = null;
    services = {};
    moduleManager = null;
    soundReactivity = null;

    constructor(renderer) {
        this.renderer = renderer;
        this.camera = null;
        this.scene = null;
        this.info = null;
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
        import SoundReactivity from "./audio/soundReactivity";
        import hdri from "./assets/autumn_field_puresky_1k.hdr";

        const defaultProgress = async () => {};

        class App {
            renderer = null;
            scene = null;
            camera = null;
            info = null;
            services = {};
            moduleManager = null;
            soundReactivity = null;

            constructor(renderer) {
                this.renderer = renderer;
                this.camera = null;
                this.scene = null;
                this.info = null;
                this.services = {};
                this.moduleManager = null;
                this.soundReactivity = null;
            }

            async init(progressCallback = defaultProgress) {
                this.info = new Info();
                conf.init();

                // conservative default camera used by modules that expect a camera object
                this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 5);
                this.camera.position.set(0, 0.5, -1);
                this.camera.updateProjectionMatrix();

                // Initialize optional sound reactivity (from PR #4)
                try {
                    this.soundReactivity = new SoundReactivity();
                    await this.soundReactivity.init();
                    conf.attachSoundReactivity?.(this.soundReactivity);
                } catch (e) {
                    // If sound subsystem fails, continue without it
                    this.soundReactivity = null;
                    // eslint-disable-next-line no-console
                    console.warn("SoundReactivity init failed:", e);
                }

                // Module manager and modules (from PR #6)
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
                if (this.camera) {
                    this.camera.aspect = width / height;
                    this.camera.updateProjectionMatrix();
                }
                if (this.moduleManager) {
                    this.moduleManager.resize(width, height);
                }
            }

            async update(delta, elapsed) {
                conf.begin();

                // Update sound reactivity if present so modules can consume its profile
                const audioProfile = this.soundReactivity ? this.soundReactivity.update(delta, elapsed) : null;
                if (audioProfile && this.services.simulation?.simulator) {
                    try {
                        this.services.simulation.simulator.setAudioProfile?.(audioProfile);
                    } catch (e) {
                        // ignore if simulator doesn't support audio profile
                    }
                }

                const frameContext = this.moduleManager
                    ? await this.moduleManager.update(delta, elapsed)
                    : { renderOverride: null };
                if (frameContext.renderOverride) {
                    await frameContext.renderOverride.fn(frameContext);
                } else {
                    // Some projects expose a post-processing module with renderScene()
                    if (this.services.postProcessing?.renderScene) {
                        await this.services.postProcessing.renderScene();
                    } else if (this.moduleManager && this.moduleManager.renderScene) {
                        await this.moduleManager.renderScene?.();
                    }
                }

                conf.end();
            }

            dispose() {
                this.moduleManager?.dispose?.();
                this.soundReactivity?.dispose?.();
            }
        }

        export default App;
