import AppModule from "../core/module";
import { Lights } from "../lights";

class LightingModule extends AppModule {
    constructor(options = {}) {
        super({
            id: options.id || "lighting",
            autoStart: options.autoStart ?? true,
            order: options.order ?? 15,
        });
        this.createLights = options.createLights || (() => new Lights());
        this.lights = null;
    }

    async init({ scene, services }) {
        this.lights = this.createLights();
        const object3d = this.lights.object ?? this.lights;
        scene.add(object3d);
        services.lights = this.lights;
    }

    async update({ elapsed }) {
        if (this.lights?.update) {
            await this.lights.update(elapsed);
        }
    }

    async dispose({ scene, services }) {
        if (this.lights) {
            const object3d = this.lights.object ?? this.lights;
            scene.remove(object3d);
            if (services.lights === this.lights) {
                delete services.lights;
            }
            this.lights = null;
        }
    }
}

export default LightingModule;
