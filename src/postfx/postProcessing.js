import * as THREE from "three/webgpu";
import { float, Fn, mrt, output, pass, vec3, vec4 } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";

export const createPostProcessing = (stageHandle) => {
    const { renderer, scene, camera } = stageHandle;
    const scenePass = pass(scene, camera);
    scenePass.setMRT(
        mrt({
            output,
            bloomIntensity: float(0),
        }),
    );

    const outputPass = scenePass.getTextureNode();
    const bloomIntensityPass = scenePass.getTextureNode("bloomIntensity");
    const bloomPass = bloom(outputPass.mul(bloomIntensityPass));
    const postProcessing = new THREE.PostProcessing(renderer);
    postProcessing.outputColorTransform = false;
    postProcessing.outputNode = Fn(() => {
        const a = outputPass.rgb.clamp(0, 1).toVar();
        const b = bloomPass.rgb
            .clamp(0, 1)
            .mul(bloomIntensityPass.r.sign().oneMinus())
            .toVar();
        return vec4(
            vec3(1)
                .sub(b)
                .sub(b)
                .mul(a)
                .mul(a)
                .add(b.mul(a).mul(2))
                .clamp(0, 1),
            1.0,
        );
    })().renderOutput();

    const dispose = () => {
        postProcessing.dispose?.();
    };

    return {
        composer: postProcessing,
        bloomPass,
        async render() {
            await postProcessing.renderAsync();
        },
        async renderScene() {
            await renderer.renderAsync(scene, camera);
        },
        dispose,
    };
};
