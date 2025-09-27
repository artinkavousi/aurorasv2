import AppModule from "../core/module";
import BackgroundGeometry from "../backgroundGeometry";

class BackgroundModule extends AppModule {
    constructor(options = {}) {
        super({
            id: options.id || "background",
            autoStart: options.autoStart ?? true,
            order: options.order ?? 20,
        });
        this.createBackground = options.createBackground || (() => new BackgroundGeometry());
        this.background = null;
    }

    async init({ scene, services }) {
        this.background = this.createBackground();
        if (this.background.init) {
            await this.background.init();
        }
        const object3d = this.background.object ?? this.background;
        scene.add(object3d);
        services.background = this.background;
    }

    async dispose({ scene, services }) {
        if (!this.background) return;
        const object3d = this.background.object ?? this.background;
        scene.remove(object3d);
        if (services.background === this.background) {
            delete services.background;
        }
        this.background = null;
    }
}

export default BackgroundModule;
