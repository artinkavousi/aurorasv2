import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { createLights } from "./lights.js";
import BackgroundGeometry from "../backgroundGeometry.js";
import hdriDefault from "../assets/autumn_field_puresky_1k.hdr";

const loadHdrTexture = async (file) => {
    const loader = new RGBELoader();
    return new Promise((resolve, reject) => {
        loader.load(
            file,
            (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                resolve(texture);
            },
            undefined,
            reject,
        );
    });
};

const noop = () => {};

export const createStage = (renderer, options = {}) => {
    const {
        hdri = hdriDefault,
        cameraFov = 60,
        cameraNear = 0.01,
        cameraFar = 5,
        cameraPosition = new THREE.Vector3(0, 0.5, -1),
        controlsTarget = new THREE.Vector3(0, 0.5, 0.2),
        pointerPlaneNormal = new THREE.Vector3(0, 0, -1),
        pointerPlaneConstant = 0.2,
        lights: lightOptions,
        onBackgroundReady = noop,
        onProgressStep = noop,
    } = options;

    const stageScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(cameraFov, 1, cameraNear, cameraFar);
    camera.position.copy(cameraPosition);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(controlsTarget);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.touches = { TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.maxDistance = 2.0;
    controls.minPolarAngle = 0.2 * Math.PI;
    controls.maxPolarAngle = 0.8 * Math.PI;
    controls.minAzimuthAngle = 0.7 * Math.PI;
    controls.maxAzimuthAngle = 1.3 * Math.PI;

    const lights = createLights(lightOptions);
    stageScene.add(lights.object);

    const backgroundGeometry = new BackgroundGeometry();

    const pointerState = {
        raycaster: new THREE.Raycaster(),
        ndc: new THREE.Vector2(),
        plane: new THREE.Plane(pointerPlaneNormal.clone().normalize(), pointerPlaneConstant),
        intersection: new THREE.Vector3(),
        origin: new THREE.Vector3(),
        direction: new THREE.Vector3(),
    };

    const handle = {
        renderer,
        scene: stageScene,
        camera,
        add: (object) => stageScene.add(object),
        remove: (object) => stageScene.remove(object),
    };

    let environmentTexture = null;

    const init = async (progress = noop) => {
        await progress(0.1);
        onProgressStep(0.1, "stage:setup");

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.toneMappingExposure = 0.66;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        onProgressStep(0.2, "stage:hdri:loading");
        environmentTexture = await loadHdrTexture(hdri);
        stageScene.background = environmentTexture;
        stageScene.backgroundRotation = new THREE.Euler(0, 2.15, 0);
        stageScene.environment = environmentTexture;
        stageScene.environmentRotation = new THREE.Euler(0, -2.15, 0);
        stageScene.environmentIntensity = 0.5;

        await progress(0.3);
        onProgressStep(0.3, "stage:hdri:ready");

        await progress(0.4);
        onProgressStep(0.4, "stage:background:init");
        await backgroundGeometry.init();
        stageScene.add(backgroundGeometry.object);
        onBackgroundReady(backgroundGeometry.object);

        await progress(0.6);
        onProgressStep(0.6, "stage:complete");
    };

    const resize = (width, height) => {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };

    const update = (delta, elapsed) => {
        controls.update(delta);
        lights.update(elapsed);
    };

    const projectPointer = (clientX, clientY) => {
        pointerState.ndc.x = (clientX / window.innerWidth) * 2 - 1;
        pointerState.ndc.y = -(clientY / window.innerHeight) * 2 + 1;
        pointerState.raycaster.setFromCamera(pointerState.ndc, camera);
        const hit = pointerState.raycaster.ray.intersectPlane(pointerState.plane, pointerState.intersection);
        if (!hit) {
            return null;
        }
        pointerState.origin.copy(pointerState.raycaster.ray.origin);
        pointerState.direction.copy(pointerState.raycaster.ray.direction);
        return {
            origin: pointerState.origin,
            direction: pointerState.direction,
            point: pointerState.intersection,
        };
    };

    const dispose = () => {
        controls.dispose();
        stageScene.remove(lights.object);
        stageScene.remove(backgroundGeometry.object);
        backgroundGeometry.dispose?.();
        if (environmentTexture) {
            environmentTexture.dispose();
        }
    };

    return {
        handle,
        init,
        resize,
        update,
        dispose,
        pointer: {
            project: projectPointer,
            plane: pointerState.plane,
            raycaster: pointerState.raycaster,
        },
    };
};
