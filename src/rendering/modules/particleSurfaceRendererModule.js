import ParticleRenderer from "../../mls-mpm/particleRenderer";

const createParticleSurfaceRendererModule = () => ({
    id: "mls-surface",
    label: "MLS Surface",
    description: "Default surface renderer using instanced meshes to visualize MLS-MPM particles.",
    createInstance(context = {}) {
        const { physics } = context;
        const simulator = physics?.outputs?.simulator || physics?.simulator;

        if (!simulator) {
            throw new Error("Particle surface renderer requires an active MLS-MPM simulator.");
        }

        const renderer = new ParticleRenderer(simulator);

        return {
            id: "mls-surface",
            metadata: {
                label: "MLS Surface",
                description: "Instanced shaded surface for MLS-MPM particles.",
            },
            object3d: renderer.object,
            update() {
                renderer.update();
            },
            dispose() {
                if (renderer.object?.parent) {
                    renderer.object.parent.remove(renderer.object);
                }
            },
        };
    },
});

export default createParticleSurfaceRendererModule;
