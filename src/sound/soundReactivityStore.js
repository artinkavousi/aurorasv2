class SoundReactivityStore {
    constructor(initialState = {}) {
        this.state = {
            mode: initialState.mode || "resonantLattice",
            macros: {
                hype: initialState.macros?.hype ?? 0.5,
                flow: initialState.macros?.flow ?? 0.5,
                chill: initialState.macros?.chill ?? 0.5,
            },
            smoothing: initialState.smoothing ?? 0.5,
            sensitivity: initialState.sensitivity ?? 0.55,
        };
        this.listeners = new Set();
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        for (const listener of this.listeners) {
            listener(this.getState());
        }
    }

    getState() {
        return {
            mode: this.state.mode,
            macros: { ...this.state.macros },
            smoothing: this.state.smoothing,
            sensitivity: this.state.sensitivity,
        };
    }

    setMode(mode) {
        if (this.state.mode === mode) return;
        this.state.mode = mode;
        this.notify();
    }

    updateMacro(name, value) {
        if (!(name in this.state.macros)) return;
        this.state.macros[name] = Math.min(1, Math.max(0, value));
        this.notify();
    }

    setSmoothing(value) {
        this.state.smoothing = Math.min(1, Math.max(0, value));
        this.notify();
    }

    setSensitivity(value) {
        this.state.sensitivity = Math.min(1, Math.max(0, value));
        this.notify();
    }
}

export default SoundReactivityStore;
