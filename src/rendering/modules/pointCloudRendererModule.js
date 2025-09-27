import PointRenderer from "../../mls-mpm/pointRenderer";

const createPointCloudRendererModule = () => ({
    id: "mls-points",
    label: "MLS Points",
    description: "Simple point cloud renderer for debugging MLS-MPM particle distributions.",
    createInstance(context = {}) {
        const { physics } = context;
        const simulator = physics?.outputs?.simulator || physics?.simulator;

        if (!simulator) {
            throw new Error("Point cloud renderer requires an active MLS-MPM simulator.");
        }

        const renderer = new PointRenderer(simulator);

        return {
            id: "mls-points",
            metadata: {
                label: "MLS Points",
                description: "GPU point sprites for MLS-MPM particles.",
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

export default createPointCloudRendererModule;
