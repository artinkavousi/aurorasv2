// @ts-nocheck

import * as THREE from "three/webgpu";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { Fn, texture, uv, positionWorld } from "three/tsl";

import { loadHdri, loadObj, loadTexture } from "../commons/assets";

import type { StageConfig } from "../config";

import type { AppContext, ModuleInstance, TickInfo, ResizeInfo, StageHandle, StageService, PointerRay } from "../config";



interface StageModuleOptions {

  config: StageConfig;

}



interface PointerState extends PointerRay {

  raycaster: THREE.Raycaster;

  ndc: THREE.Vector2;

  plane: THREE.Plane;

}



interface BackgroundSurface {

  object: THREE.Object3D;

  dispose(): void;

}



interface LightsRig {

  object: THREE.Object3D;

  update(elapsed: number): void;

}



const POINTER_TARGET = 0.2;



const createPointerState = (config: StageConfig["pointerPlane"]): PointerState => ({

  raycaster: new THREE.Raycaster(),

  ndc: new THREE.Vector2(),

  plane: new THREE.Plane(new THREE.Vector3(...config.normal).normalize(), config.constant ?? POINTER_TARGET),

  origin: new THREE.Vector3(),

  direction: new THREE.Vector3(),

  point: new THREE.Vector3(),

  active: false,

});



const createLights = (_options: Partial<StageConfig> = {}): LightsRig => {


  const root = new THREE.Object3D();

  const light = new THREE.SpotLight(0xffffff, 5, 15, Math.PI * 0.18, 1, 0);

  const target = new THREE.Object3D();

  light.position.set(0, 1.2, -0.8);

  target.position.set(0, 0.7, 0);

  light.target = target;

  light.castShadow = true;

  light.shadow.mapSize.set(1024, 1024);

  light.shadow.bias = -0.005;

  light.shadow.camera.near = 0.5;

  light.shadow.camera.far = 5;

  root.add(light);

  root.add(target);



  const animate = (elapsed: number) => {

    const radius = 0.2;

    const speed = 0.15;

    const offsetX = 0;

    const offsetZ = -0.8;

    light.position.set(

      Math.cos(elapsed * speed) * radius + offsetX,

      light.position.y,

      Math.sin(elapsed * speed) * radius + offsetZ

    );

  };



  return {

    object: root,

    update: animate,

  };

};



const createBackgroundSurface = async (): Promise<BackgroundSurface> => {

  const group = await loadObj("boxSlightlySmooth.obj");

  const mesh = group.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);

  if (!mesh) {

    throw new Error("Background OBJ is missing mesh data");

  }



  const geometry = BufferGeometryUtils.mergeVertices(mesh.geometry as THREE.BufferGeometry);

  const uvArray = geometry.attributes.uv?.array as Float32Array | undefined;

  if (uvArray) {

    for (let i = 0; i < uvArray.length; i++) {

      uvArray[i] *= 10;

    }

  }



  const [normalMap, aoMap, colorMap, roughnessMap] = await Promise.all([

    loadTexture("concrete_0016_normal_opengl_1k.png", { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [10, 10], flipY: false }),

    loadTexture("concrete_0016_ao_1k.jpg", { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [10, 10], flipY: false }),

    loadTexture("concrete_0016_color_1k.jpg", { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [10, 10], flipY: false }),

    loadTexture("concrete_0016_roughness_1k.jpg", { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [10, 10], flipY: false }),

  ]);



  const material = new THREE.MeshStandardNodeMaterial({

    roughness: 0.9,

    metalness: 0,

    normalMap,

    normalScale: new THREE.Vector2(1, 1),

    aoMap,

    map: colorMap,

    roughnessMap,

  });



  material.aoNode = Fn(() => texture(aoMap, uv()).mul(positionWorld.z.div(0.4).mul(0.95).oneMinus()))();

  material.colorNode = Fn(() => texture(colorMap, uv()).mul(positionWorld.z.div(0.4).mul(0.5).oneMinus().mul(0.7)))();



  const surface = new THREE.Mesh(geometry, material);

  surface.rotation.set(0, Math.PI, 0);

  surface.position.set(0, -0.05, 0.22);

  surface.castShadow = true;

  surface.receiveShadow = true;



  const root = new THREE.Object3D();

  root.add(surface);



  return {

    object: root,

    dispose: () => {

      geometry.dispose();

      material.dispose();

      normalMap.dispose();

      aoMap.dispose();

      colorMap.dispose();

      roughnessMap.dispose();

    },

  };

};



const pointerFromEvent = (event: PointerEvent, pointer: PointerState, camera: THREE.Camera) => {

  const target = event.target as HTMLElement;

  const rect = target.getBoundingClientRect();

  const width = rect.width;

  const height = rect.height;

  const x = (event.clientX - rect.left) / width;

  const y = (event.clientY - rect.top) / height;

  pointer.ndc.set(x * 2 - 1, -(y * 2 - 1));

  pointer.raycaster.setFromCamera(pointer.ndc, camera);

  const hit = pointer.raycaster.ray.intersectPlane(pointer.plane, pointer.point);

  if (hit) {

    pointer.origin.copy(pointer.raycaster.ray.origin);

    pointer.direction.copy(pointer.raycaster.ray.direction);

    pointer.active = true;

  } else {

    pointer.active = false;

  }

};



export const createStageModule = (options: StageModuleOptions): ModuleInstance => {

  const id = "stage";

  let stageConfig = options.config;

  let scene: THREE.Scene | null = null;

  let camera: THREE.PerspectiveCamera | null = null;

  let controls: OrbitControls | null = null;

  let lights: LightsRig | null = null;

  let background: BackgroundSurface | null = null;

  let pointer: PointerState | null = null;

  let hdriTexture: THREE.DataTexture | null = null;

  let pointerMoveListener: ((event: PointerEvent) => void) | null = null;

  let pointerLeaveListener: (() => void) | null = null;



  const updateConfig = (config: StageConfig) => {

    stageConfig = config;

    if (controls) {

      controls.enableDamping = config.controls.enableDamping;

      controls.enablePan = config.controls.enablePan;

      controls.touches = config.controls.touches as unknown as Record<string, number>;

      controls.minPolarAngle = config.controls.minPolarAngle;

      controls.maxPolarAngle = config.controls.maxPolarAngle;

      controls.minAzimuthAngle = config.controls.minAzimuthAngle;

      controls.maxAzimuthAngle = config.controls.maxAzimuthAngle;

      controls.maxDistance = config.controls.maxDistance;

      controls.target.set(...config.camera.target);

    }

    if (pointer) {

      pointer.plane.set(new THREE.Vector3(...config.pointerPlane.normal).normalize(), config.pointerPlane.constant);

    }

  };



  const module: ModuleInstance = {

    id,

    label: "Stage",

    priority: -100,

    autoStart: true,

    async init(context: AppContext) {

      const { renderer } = context;

      stageConfig = context.config.value.stage;

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(

        stageConfig.camera.fov,

        window.innerWidth / window.innerHeight,

        stageConfig.camera.near,

        stageConfig.camera.far

      );

      camera.position.set(...stageConfig.camera.position);



      controls = new OrbitControls(camera, renderer.domElement);

      controls.enableDamping = stageConfig.controls.enableDamping;

      controls.enablePan = stageConfig.controls.enablePan;

      controls.touches = stageConfig.controls.touches as unknown as Record<string, number>;

      controls.minPolarAngle = stageConfig.controls.minPolarAngle;

      controls.maxPolarAngle = stageConfig.controls.maxPolarAngle;

      controls.minAzimuthAngle = stageConfig.controls.minAzimuthAngle;

      controls.maxAzimuthAngle = stageConfig.controls.maxAzimuthAngle;

      controls.maxDistance = stageConfig.controls.maxDistance;

      controls.target.set(...stageConfig.camera.target);



      pointer = createPointerState(stageConfig.pointerPlane);

      pointerMoveListener = (event: PointerEvent) => {

        if (!camera || !pointer) return;

        pointerFromEvent(event, pointer, camera);

      };

      pointerLeaveListener = () => {

        if (pointer) {

          pointer.active = false;

        }

      };

      renderer.domElement.addEventListener("pointermove", pointerMoveListener);

      renderer.domElement.addEventListener("pointerleave", pointerLeaveListener);



      renderer.shadowMap.enabled = true;

      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      renderer.toneMappingExposure = stageConfig.toneMappingExposure;



      hdriTexture = await loadHdri(stageConfig.hdri);

      scene.background = hdriTexture;

      scene.environment = hdriTexture;

      scene.backgroundRotation = new THREE.Euler(...stageConfig.backgroundRotation);

      scene.environmentRotation = new THREE.Euler(...stageConfig.environmentRotation);

      scene.environmentIntensity = stageConfig.environmentIntensity;



      background = await createBackgroundSurface();

      scene.add(background.object);



      lights = createLights(stageConfig);

      scene.add(lights.object);



      const handle: StageHandle = {

        renderer,

        scene,

        camera,

        add: (object: THREE.Object3D) => scene?.add(object),

        remove: (object: THREE.Object3D) => scene?.remove(object),

      };

      context.setStage(handle);

      context.services.stage = { scene, camera, controls, pointer } as StageService;

      context.services.pointer = pointer;

    },



    async update(tick: TickInfo) {

      const config = tick.config.stage;

      if (config !== stageConfig) {

        updateConfig(config);

      }

      controls?.update();

      lights?.update(tick.elapsed);

      if (pointer) {

        tick.context.services.pointer = pointer;

      }

    },



    async resize(size: ResizeInfo) {

      if (!camera) return;

      camera.aspect = size.width / size.height;

      camera.updateProjectionMatrix();

    },



    async dispose(context: AppContext) {

      const { renderer } = context;

      if (pointerMoveListener) {

        renderer.domElement.removeEventListener("pointermove", pointerMoveListener);

      }

      if (pointerLeaveListener) {

        renderer.domElement.removeEventListener("pointerleave", pointerLeaveListener);

      }

      pointerMoveListener = null;

      pointerLeaveListener = null;



      if (lights && scene) {

        scene.remove(lights.object);

      }

      lights = null;



      if (background && scene) {

        scene.remove(background.object);

        background.dispose();

      }

      background = null;



      if (hdriTexture) {

        hdriTexture.dispose();

        hdriTexture = null;

      }



      controls?.dispose();

      controls = null;



      scene = null;

      camera = null;

      pointer = null;

      delete context.services.stage;

      delete context.services.pointer;

      context.setStage(null);

    },

  };



  return module;

};

