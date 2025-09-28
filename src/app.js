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
// Optional physics/rendering module factories (from PR #5)
import createMlsMpmModule from './physics/modules/mlsMpmModule';
import createParticleSurfaceRendererModule from './rendering/modules/particleSurfaceRendererModule';
import createPointCloudRendererModule from './rendering/modules/pointCloudRendererModule';

const defaultProgress = async () => {};

class App {
    renderer = null;
    scene = null;
    camera = null;
    info = null;
    services = {};
    moduleManager = null;
    soundReactivity = null;
    controls = null;
    lights = null;

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
        if (!this.camera) {
            this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 5);
            this.camera.position.set(0, 0.5, -1);
            this.camera.updateProjectionMatrix();
        }

        // Initialize optional sound reactivity (from PR #4)
        try {
            this.soundReactivity = new SoundReactivityModule();
            await this.soundReactivity.init();
            conf.attachSoundReactivity?.(this.soundReactivity);
        } catch (e) {
            // If sound subsystem fails, continue without it
            this.soundReactivity = null;
            // eslint-disable-next-line no-console
            console.warn('SoundReactivity init failed:', e);
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

        // If the optional physics/renderer factories exist, register them with the module manager
        try {
            if (createMlsMpmModule && createParticleSurfaceRendererModule && createPointCloudRendererModule) {
                if (typeof this.moduleManager.registerPhysicsModule === 'function') {
                    this.moduleManager
                        .registerPhysicsModule(createMlsMpmModule())
                        .registerRendererModule(createParticleSurfaceRendererModule())
                        .registerRendererModule(createPointCloudRendererModule());
                }
            }
        } catch (e) {
            // Optional modules failed to register; continue without them
            // eslint-disable-next-line no-console
            console.warn('Optional physics/renderer modules not registered:', e);
        }

        // Add default lights if available (from PR #5)
        try {
            if (typeof LightingModule !== 'undefined') {
                this.lights = new LightingModule();
                if (this.scene && this.lights.object) this.scene.add(this.lights.object);
            }
        } catch (e) {
            // ignore
        }

        // Setup OrbitControls (optional)
        try {
            if (typeof ControlsModule !== 'undefined' && this.renderer?.domElement) {
                this.controls = new ControlsModule(this.camera, this.renderer.domElement);
                this.controls.target.set(0, 0.5, 0.2);
                this.controls.enableDamping = true;
                this.controls.enablePan = false;
            }
        } catch (e) {
            // ignore
        }

        this.moduleManager.registerModule(new EnvironmentModule({ hdri }));
        this.moduleManager.registerModule(new ControlsModule());
        this.moduleManager.registerModule(new LightingModule());
        this.moduleManager.registerModule(new BackgroundModule());
        this.moduleManager.registerModule(new SimulationModule({ pointerListenerTarget: this.renderer.domElement }));
        this.moduleManager.registerModule(new SoundReactivityModule());
        this.moduleManager.registerModule(new PostProcessingModule());

        const autoModules = this.moduleManager.getAutoStartModules?.() ?? [];
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
        } else if (this.services.postProcessing?.pipeline) {
            await this.services.postProcessing.pipeline.renderAsync();
        } else {
            await this.renderer.renderAsync(this.scene, this.camera);
        }

        conf.end();
    }

    dispose() {
        this.moduleManager?.dispose?.();
        this.soundReactivity?.dispose?.();
        if (this.controls) this.controls.dispose?.();
    }
}

export default App;
