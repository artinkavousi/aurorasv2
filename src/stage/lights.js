import * as THREE from "three/webgpu";

export const createLights = (options = {}) => {
    const {
        color = 0xffffff,
        intensity = 5,
        distance = 15,
        angle = Math.PI * 0.18,
        penumbra = 1,
        decay = 0,
        position = new THREE.Vector3(0, 1.2, -0.8),
        target = new THREE.Vector3(0, 0.7, 0),
        shadowMapSize = 1024,
        shadowBias = -0.005,
        shadowCameraNear = 0.5,
        shadowCameraFar = 5,
    } = options;

    const root = new THREE.Object3D();
    const light = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
    const lightTarget = new THREE.Object3D();

    light.position.copy(position);
    lightTarget.position.copy(target);
    light.target = lightTarget;

    light.castShadow = true;
    light.shadow.mapSize.width = shadowMapSize;
    light.shadow.mapSize.height = shadowMapSize;
    light.shadow.bias = shadowBias;
    light.shadow.camera.near = shadowCameraNear;
    light.shadow.camera.far = shadowCameraFar;

    root.add(light);
    root.add(lightTarget);

    const update = (elapsed) => {
        if (options.animate === "orbit") {
            const radius = options.orbitRadius ?? 0.2;
            const speed = options.orbitSpeed ?? 0.15;
            const offsetX = options.orbitOffsetX ?? 0;
            const offsetZ = options.orbitOffsetZ ?? -0.8;

            light.position.set(
                Math.cos(elapsed * speed) * radius + offsetX,
                position.y,
                Math.sin(elapsed * speed) * radius + offsetZ,
            );
        }
    };

    return {
        object: root,
        light,
        target: lightTarget,
        update,
    };
};
