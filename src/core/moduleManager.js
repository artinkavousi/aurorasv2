import AppModule from "./module";

const toOrderedEntries = (modules) => modules.slice().sort((a, b) => {
    if (a.module.order === b.module.order) {
        return a.registrationIndex - b.registrationIndex;
    }
    return a.module.order - b.module.order;
});

class ModuleManager {
    constructor(baseContext = {}) {
        this.baseContext = {
            services: {},
            ...baseContext,
        };
        this.modules = new Map();
        this.orderedEntries = [];
        this.registrationIndex = 0;
    }

    registerModule(module) {
        if (!(module instanceof AppModule)) {
            throw new Error("Module must extend AppModule");
        }
        if (this.modules.has(module.id)) {
            throw new Error(`Module with id \"${module.id}\" already registered`);
        }
        const entry = {
            module,
            active: false,
            registrationIndex: this.registrationIndex++,
        };
        this.modules.set(module.id, entry);
        this.orderedEntries = toOrderedEntries([...this.modules.values()]);
    }

    getModule(id) {
        return this.modules.get(id)?.module;
    }

    getActiveModule(id) {
        const entry = this.modules.get(id);
        return entry?.active ? entry.module : null;
    }

    getAutoStartModules() {
        return this.orderedEntries.filter(entry => entry.module.autoStart).map(entry => entry.module);
    }

    async initAll({ onModuleInitialized } = {}) {
        for (const entry of this.orderedEntries) {
            if (entry.module.autoStart) {
                await this.enableModule(entry.module.id);
                if (onModuleInitialized) {
                    await onModuleInitialized(entry.module.id);
                }
            }
        }
    }

    async enableModule(id) {
        const entry = this.modules.get(id);
        if (!entry || entry.active) {
            return;
        }
        await entry.module.init(this._createModuleContext(entry.module));
        entry.active = true;
    }

    async disableModule(id) {
        const entry = this.modules.get(id);
        if (!entry || !entry.active) {
            return;
        }
        await entry.module.dispose(this._createModuleContext(entry.module));
        entry.active = false;
    }

    async swapModule(id, nextModule, { activate = true } = {}) {
        const previousEntry = this.modules.get(id);
        const wasActive = previousEntry?.active ?? false;
        if (previousEntry) {
            if (previousEntry.active) {
                await previousEntry.module.dispose(this._createModuleContext(previousEntry.module));
            }
            this.modules.delete(id);
            this.orderedEntries = toOrderedEntries([...this.modules.values()]);
        }
        if (nextModule) {
            this.registerModule(nextModule);
            if (activate && (wasActive || nextModule.autoStart)) {
                await this.enableModule(nextModule.id);
            }
        }
    }

    async update(delta, elapsed) {
        const frameContext = this._createFrameContext(delta, elapsed);
        for (const entry of this.orderedEntries) {
            if (!entry.active) continue;
            await entry.module.update(frameContext);
        }
        return frameContext;
    }

    async resize(width, height) {
        const resizeContext = {
            ...this.baseContext,
            moduleManager: this,
            width,
            height,
        };
        for (const entry of this.orderedEntries) {
            if (!entry.active) continue;
            await entry.module.resize(resizeContext);
        }
    }

    async disposeAll() {
        for (const entry of this.orderedEntries.slice().reverse()) {
            if (!entry.active) continue;
            await entry.module.dispose(this._createModuleContext(entry.module));
            entry.active = false;
        }
    }

    _createModuleContext(module) {
        return {
            ...this.baseContext,
            moduleManager: this,
            module,
        };
    }

    _createFrameContext(delta, elapsed) {
        const frameContext = {
            ...this.baseContext,
            moduleManager: this,
            delta,
            elapsed,
            renderOverride: null,
            setRenderOverride: (fn, priority = 0) => {
                if (!frameContext.renderOverride || priority >= frameContext.renderOverride.priority) {
                    frameContext.renderOverride = { fn, priority };
                }
            },
        };
        return frameContext;
    }
}

export default ModuleManager;
