import MlsMpmSimulator from "../../mls-mpm/mlsMpmSimulator";

const createMlsMpmModule = () => ({
    id: "mls-mpm",
    label: "MLS-MPM Fluid",
    description: "Material Point Method fluid simulation used as the default physics backend.",
    createInstance(context = {}) {
        const { renderer } = context;
        const simulator = new MlsMpmSimulator(renderer);

        return {
            id: "mls-mpm",
            metadata: {
                label: "MLS-MPM Fluid",
                description: "High resolution fluid simulation optimized for WebGPU.",
            },
            simulator,
            async init() {
                await simulator.init();
            },
            async update(delta, elapsed) {
                await simulator.update(delta, elapsed);
            },
            dispose() {
                if (simulator.dispose) {
                    simulator.dispose();
                }
            },
            get outputs() {
                return { simulator };
            },
            setPointerRay(origin, direction, intersection) {
                simulator.setMouseRay(origin, direction, intersection);
            },
        };
    },
});

export default createMlsMpmModule;
