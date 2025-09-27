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

    constructor(renderer) {
        this.renderer = renderer;
    }

    async init(progressCallback = defaultProgress) {
        this.info = new Info();
        conf.init();

        this.stage = createStage(this.renderer);
        await this.stage.init(progressCallback);

        const { scene, camera } = this.stage.handle;
        this.scene = scene;
        this.camera = camera;

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
    }

    async update(delta, elapsed) {
        conf.begin();

        this.particleRenderer.object.visible = !conf.points;
        this.pointRenderer.object.visible = conf.points;

        this.stage.update(delta, elapsed);
        this.particleRenderer.update();
        this.pointRenderer.update();

        await this.mlsMpmSim.update(delta, elapsed);

        if (conf.bloom) {
            await this.postProcessing.render();
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
