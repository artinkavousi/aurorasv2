const normalizeObjectList = (objectOrList) => {
    if (!objectOrList) {
        return [];
    }
    if (Array.isArray(objectOrList)) {
        return objectOrList.filter(Boolean);
    }
    return [objectOrList];
};

class ModuleManager {
    constructor(globalContext = {}) {
        this.globalContext = globalContext;
        this.physicsModules = new Map();
        this.rendererModules = new Map();
        this.activePhysics = null;
        this.activeRenderers = new Map();
    }

    registerPhysicsModule(moduleDefinition) {
        if (!moduleDefinition?.id) {
            throw new Error("Physics module definition requires an id");
        }
        this.physicsModules.set(moduleDefinition.id, moduleDefinition);
        return this;
    }

    registerRendererModule(moduleDefinition) {
        if (!moduleDefinition?.id) {
            throw new Error("Renderer module definition requires an id");
        }
        this.rendererModules.set(moduleDefinition.id, moduleDefinition);
        return this;
    }

    getPhysicsModules() {
        return Array.from(this.physicsModules.values());
    }

    getRendererModules() {
        return Array.from(this.rendererModules.values());
    }

    async activatePhysicsModule(id, options = {}) {
        const definition = this.physicsModules.get(id);
        if (!definition) {
            throw new Error(`Unknown physics module: ${id}`);
        }

        if (this.activePhysics?.dispose) {
            await this.activePhysics.dispose();
        }

        const instance = definition.createInstance({
            ...this.globalContext,
            options,
            manager: this,
        });

        if (instance.init) {
            await instance.init();
        }

        this.activePhysics = instance;
        return instance;
    }

    async activateRendererModule(id, options = {}) {
        const definition = this.rendererModules.get(id);
        if (!definition) {
            throw new Error(`Unknown renderer module: ${id}`);
        }
        const context = {
            ...this.globalContext,
            options,
            manager: this,
            physics: this.activePhysics,
        };
        const instance = definition.createInstance(context);

        if (instance.init) {
            await instance.init();
        }

        normalizeObjectList(instance.object3d).forEach((object) => {
            if (this.globalContext.scene && object) {
                this.globalContext.scene.add(object);
            }
        });

        this.activeRenderers.set(id, instance);
        return instance;
    }

    async deactivateRendererModule(id) {
        const instance = this.activeRenderers.get(id);
        if (!instance) {
            return;
        }

        normalizeObjectList(instance.object3d).forEach((object) => {
            if (this.globalContext.scene && object) {
                this.globalContext.scene.remove(object);
            }
        });

        if (instance.dispose) {
            await instance.dispose();
        }
        this.activeRenderers.delete(id);
    }

    async update(delta, elapsed) {
        for (const instance of this.activeRenderers.values()) {
            if (instance.update) {
                instance.update(delta, elapsed);
            }
        }

        if (this.activePhysics?.update) {
            await this.activePhysics.update(delta, elapsed);
        }
    }

    handlePointerRay(origin, direction, intersection) {
        if (this.activePhysics?.setPointerRay) {
            this.activePhysics.setPointerRay(origin, direction, intersection);
        }
    }
}

export default ModuleManager;
