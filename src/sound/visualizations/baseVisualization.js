import * as THREE from "three/webgpu";

class BaseVisualization extends THREE.Group {
    constructor() {
        super();
        this.frustumCulled = false;
        this.name = this.constructor.name;
    }

    onEnter(/* context */) {}

    onExit(/* context */) {}

    update(/* features, delta, elapsed, context */) {}
}

export default BaseVisualization;
