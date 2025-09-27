import * as THREE from "three/webgpu";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { float, Fn, mrt, output, pass, vec3, vec4 } from "three/tsl";
import AppModule from "../core/module";

class PostProcessingModule extends AppModule {
    constructor(options = {}) {
        super({
            id: options.id || "postProcessing",
            autoStart: options.autoStart ?? true,
            order: options.order ?? 40,
        });
        this.priority = options.priority ?? 10;
        this.scenePass = null;
        this.postProcessing = null;
        this.bloomPass = null;
        this.settings = {
            bloomThreshold: options.bloomThreshold ?? 0.001,
            bloomStrength: options.bloomStrength ?? 0.94,
            bloomRadius: options.bloomRadius ?? 0.8,
        };
    }

    async init({ renderer, scene, camera, services }) {
        this.scenePass = pass(scene, camera);
        this.scenePass.setMRT(mrt({
            output,
            bloomIntensity: float(0),
        }));
        const outputPass = this.scenePass.getTextureNode();
        const bloomIntensityPass = this.scenePass.getTextureNode("bloomIntensity");
        this.bloomPass = bloom(outputPass.mul(bloomIntensityPass));
        this.postProcessing = new THREE.PostProcessing(renderer);
        this.postProcessing.outputColorTransform = false;
        this.postProcessing.outputNode = Fn(() => {
            const a = outputPass.rgb.clamp(0, 1).toVar();
            const b = this.bloomPass.rgb
                .clamp(0, 1)
                .mul(bloomIntensityPass.r.sign().oneMinus())
                .toVar();
            return vec4(vec3(1).sub(b).sub(b).mul(a).mul(a).add(b.mul(a).mul(2)).clamp(0, 1), 1.0);
        })().renderOutput();

        this.bloomPass.threshold.value = this.settings.bloomThreshold;
        this.bloomPass.strength.value = this.settings.bloomStrength;
        this.bloomPass.radius.value = this.settings.bloomRadius;

        services.postProcessing = {
            scenePass: this.scenePass,
            bloomPass: this.bloomPass,
            pipeline: this.postProcessing,
        };
    }

    async update(frameContext) {
        if (!this.postProcessing) return;
        const { conf, renderer, scene, camera } = frameContext;
        frameContext.setRenderOverride(async () => {
            if (conf.bloom) {
                await this.postProcessing.renderAsync();
            } else {
                await renderer.renderAsync(scene, camera);
            }
        }, this.priority);
    }

    async dispose({ services }) {
        if (services.postProcessing?.pipeline === this.postProcessing) {
            delete services.postProcessing;
        }
        this.scenePass = null;
        this.postProcessing = null;
        this.bloomPass = null;
    }
}

export default PostProcessingModule;
