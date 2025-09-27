import * as THREE from "three/webgpu";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import AppModule from "../core/module";

const loadHdrTexture = (loader, file) => new Promise((resolve, reject) => {
    loader.load(
        file,
        texture => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            resolve(texture);
        },
        undefined,
        error => reject(error)
    );
});

class EnvironmentModule extends AppModule {
    constructor(options = {}) {
        super({
            id: options.id || "environment",
            autoStart: options.autoStart ?? true,
            order: options.order ?? 5,
        });
        this.options = {
            hdri: options.hdri,
            backgroundRotation: options.backgroundRotation ?? new THREE.Euler(0, 2.15, 0),
            environmentRotation: options.environmentRotation ?? new THREE.Euler(0, -2.15, 0),
            environmentIntensity: options.environmentIntensity ?? 0.5,
            toneMappingExposure: options.toneMappingExposure ?? 0.66,
            toneMapping: options.toneMapping,
            shadowMap: {
                enabled: options.shadowMap?.enabled ?? true,
                type: options.shadowMap?.type ?? THREE.PCFSoftShadowMap,
            },
        };
        this.loader = options.loader || new RGBELoader();
        this.texture = null;
        this.previousSceneState = null;
        this.previousRendererState = null;
    }

    async init({ scene, renderer }) {
        if (!this.options.hdri) {
            throw new Error("EnvironmentModule requires an hdri path");
        }
        this.previousSceneState = {
            background: scene.background,
            environment: scene.environment,
            backgroundRotation: scene.backgroundRotation?.clone?.() ?? null,
            environmentRotation: scene.environmentRotation?.clone?.() ?? null,
            environmentIntensity: scene.environmentIntensity,
        };
        this.previousRendererState = {
            toneMapping: renderer.toneMapping,
            toneMappingExposure: renderer.toneMappingExposure,
            shadowMapEnabled: renderer.shadowMap.enabled,
            shadowMapType: renderer.shadowMap.type,
        };
        this.texture = await loadHdrTexture(this.loader, this.options.hdri);
        scene.background = this.texture;
        scene.backgroundRotation = this.options.backgroundRotation;
        scene.environment = this.texture;
        scene.environmentRotation = this.options.environmentRotation;
        scene.environmentIntensity = this.options.environmentIntensity;

        if (this.options.toneMapping !== undefined) {
            renderer.toneMapping = this.options.toneMapping;
        }
        renderer.toneMappingExposure = this.options.toneMappingExposure;
        renderer.shadowMap.enabled = this.options.shadowMap.enabled;
        renderer.shadowMap.type = this.options.shadowMap.type;
    }

    async dispose({ scene, renderer }) {
        if (this.texture) {
            this.texture.dispose();
            this.texture = null;
        }
        if (this.previousSceneState) {
            scene.background = this.previousSceneState.background ?? null;
            scene.environment = this.previousSceneState.environment ?? null;
            scene.backgroundRotation = this.previousSceneState.backgroundRotation ?? new THREE.Euler();
            scene.environmentRotation = this.previousSceneState.environmentRotation ?? new THREE.Euler();
            scene.environmentIntensity = this.previousSceneState.environmentIntensity ?? scene.environmentIntensity;
        } else {
            scene.background = null;
            scene.environment = null;
            scene.backgroundRotation = new THREE.Euler();
            scene.environmentRotation = new THREE.Euler();
        }
        if (this.previousRendererState) {
            renderer.toneMapping = this.previousRendererState.toneMapping;
            renderer.toneMappingExposure = this.previousRendererState.toneMappingExposure;
            renderer.shadowMap.enabled = this.previousRendererState.shadowMapEnabled;
            renderer.shadowMap.type = this.previousRendererState.shadowMapType;
        }
        this.previousSceneState = null;
        this.previousRendererState = null;
    }
}

export default EnvironmentModule;
