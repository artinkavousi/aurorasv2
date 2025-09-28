// @ts-nocheck
import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  vec3,
  float,
  varying,
  instanceIndex,
  normalize,
  cross,
  mat3,
  normalLocal,
  transformNormalToView,
  mrt,
  uniform,
  clamp,
} from "three/tsl";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type {
  ModuleInstance,
  TickInfo,
  AppContext,
  PhysicsService,
  MeshRendererService,
  PhysicsMetrics,
} from "../context";
import type { PhysicsConfig, PostFxConfig, RenderConfig } from "../config";

interface MeshRendererState {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardNodeMaterial> | null;
  geometry: THREE.InstancedBufferGeometry | null;
  material: THREE.MeshStandardNodeMaterial | null;
  sizeUniform: ReturnType<typeof uniform> | null;
}

const calcLookAtMatrix = Fn(([directionImmutable]) => {
  const target = vec3(directionImmutable).toVar();
  const rr = vec3(0, 0, 1).toVar();
  const ww = vec3(normalize(target)).toVar();
  const uu = vec3(normalize(cross(ww, rr)).negate()).toVar();
  const vv = vec3(normalize(cross(uu, ww)).negate()).toVar();
  return mat3(uu, vv, ww);
}).setLayout({
  name: "calcLookAtMatrix",
  type: "mat3",
  inputs: [{ name: "direction", type: "vec3" }],
});

const createRoundedBox = (width: number, height: number, depth: number, radius: number) => {
  const box = new THREE.BoxGeometry(width - radius * 2, height - radius * 2, depth - radius * 2);
  const epsilon = Math.min(width, height, depth) * 0.01;
  const positionArray = box.attributes.position.array as Float32Array;
  const normalArray = box.attributes.normal.array as Float32Array;
  const indices = [...(box.getIndex()!.array as ArrayLike<number>)];
  const vertices: Array<THREE.Vector3 & { normal: THREE.Vector3; id: number; faces: string[]; posHash: string; face: string }> = [];
  const posMap: Record<string, typeof vertices> = {};
  const edgeMap: Record<string, typeof vertices> = {};

  for (let i = 0; i < positionArray.length / 3; i += 1) {
    const oldPosition = new THREE.Vector3(positionArray[i * 3], positionArray[i * 3 + 1], positionArray[i * 3 + 2]);
    positionArray[i * 3 + 0] += normalArray[i * 3 + 0] * radius;
    positionArray[i * 3 + 1] += normalArray[i * 3 + 1] * radius;
    positionArray[i * 3 + 2] += normalArray[i * 3 + 2] * radius;
    const vertex = new THREE.Vector3(positionArray[i * 3], positionArray[i * 3 + 1], positionArray[i * 3 + 2]) as typeof vertices[number];
    vertex.normal = new THREE.Vector3(normalArray[i * 3], normalArray[i * 3 + 1], normalArray[i * 3 + 2]);
    vertex.id = i;
    vertex.faces = [];
    vertex.posHash = oldPosition.toArray().map((v) => Math.round(v / epsilon)).join("_");
    posMap[vertex.posHash] = [...(posMap[vertex.posHash] || []), vertex];
    vertices.push(vertex);
  }

  vertices.forEach((vertex) => {
    const face = vertex.normal.toArray().map((v) => Math.round(v)).join("_");
    vertex.face = face;
    posMap[vertex.posHash].forEach((candidate) => {
      candidate.faces.push(face);
    });
  });

  vertices.forEach((vertex) => {
    const addVertexToEdgeMap = (entry: string) => {
      edgeMap[entry] = [...(edgeMap[entry] || []), vertex];
    };

    vertex.faces.sort();
    const [f0, f1, f2] = vertex.faces;
    const face = vertex.face;
    if (f0 === face || f1 === face) addVertexToEdgeMap(`${f0}_${f1}`);
    if (f0 === face || f2 === face) addVertexToEdgeMap(`${f0}_${f2}`);
    if (f1 === face || f2 === face) addVertexToEdgeMap(`${f1}_${f2}`);
  });

  const addFace = (v0: typeof vertices[number], v1: typeof vertices[number], v2: typeof vertices[number]) => {
    const a = v1.clone().sub(v0);
    const b = v2.clone().sub(v0);
    if (a.cross(b).dot(v0) > 0) {
      indices.push(v0.id, v1.id, v2.id);
    } else {
      indices.push(v0.id, v2.id, v1.id);
    }
  };

  Object.keys(posMap).forEach((key) => {
    const list = posMap[key];
    if (list.length >= 3) {
      addFace(list[0], list[1], list[2]);
    }
  });

  Object.keys(edgeMap).forEach((key) => {
    const edgeVertices = edgeMap[key];
    const v0 = edgeVertices[0];
    edgeVertices.sort((v1, v2) => v1.distanceTo(v0) - v2.distanceTo(v0));
    if (edgeVertices.length >= 3) {
      addFace(edgeVertices[0], edgeVertices[1], edgeVertices[2]);
    }
    if (edgeVertices.length >= 4) {
      addFace(edgeVertices[1], edgeVertices[2], edgeVertices[3]);
    }
  });

  box.setIndex(indices);
  return box;
};

const createMeshResources = (simulator: PhysicsService["simulator"]) => {
  const roundedBoxGeometry = createRoundedBox(0.7, 0.7, 3, 0.1);
  const boxGeometry = BufferGeometryUtils.mergeVertices(new THREE.BoxGeometry(7, 7, 30), 3.0);
  boxGeometry.attributes.position.array = (boxGeometry.attributes.position.array as Float32Array).map((v) => v * 0.1);
  const mergedGeometry = BufferGeometryUtils.mergeGeometries([roundedBoxGeometry, boxGeometry]);

  const geometry = new THREE.InstancedBufferGeometry().copy(mergedGeometry!);
  geometry.setDrawRange(0, roundedBoxGeometry.index!.count);
  geometry.instanceCount = simulator.numParticles;

  const material = new THREE.MeshStandardNodeMaterial({
    metalness: 0.9,
    roughness: 0.5,
  });

  const sizeUniform = uniform(1);
  const vAo = varying(0, "vAo");
  const vNormal = varying(vec3(0), "v_normalView");
  const particle = simulator.particleBuffer.element(instanceIndex);

  material.positionNode = Fn(() => {
    const particlePosition = particle.get("position");
    const particleDensity = particle.get("density");
    const particleDirection = particle.get("direction");
    const lodLevel = particle.get("lodLevel").x;
    const mat = calcLookAtMatrix(particleDirection.xyz);
    vNormal.assign(transformNormalToView(mat.mul(normalLocal)));
    vAo.assign(particlePosition.z.div(64));
    vAo.assign(vAo.mul(vAo).oneMinus());
    const lodScale = clamp(float(1).sub(lodLevel.mul(0.4)), float(0.35), float(1));
    return mat
      .mul(attribute("position").xyz.mul(sizeUniform).mul(lodScale))
      .mul(particleDensity.mul(0.4).add(0.5).clamp(0, 1))
      .add(particlePosition.mul(vec3(1, 1, 0.4)));
  })();
  material.colorNode = particle.get("color");
  material.aoNode = vAo;
  material.opacityNode = clamp(float(1).sub(particle.get("lodLevel").x.mul(0.5)), float(0.1), float(1));
  material.transparent = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.onBeforeShadow = () => {
    geometry.setDrawRange(roundedBoxGeometry.index!.count, Infinity);
  };
  mesh.onAfterShadow = () => {
    geometry.setDrawRange(0, roundedBoxGeometry.index!.count);
  };
  mesh.frustumCulled = false;

  const scale = 1 / 64;
  mesh.position.set(-32 * scale, 0, 0);
  mesh.scale.set(scale, scale, scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    mesh,
    geometry,
    material,
    sizeUniform,
  } as const;
};

const applyConfig = (
  state: Required<MeshRendererState>,
  renderConfig: RenderConfig,
  physicsConfig: PhysicsConfig,
  postfxConfig: PostFxConfig,
  physicsMetrics: PhysicsMetrics | undefined
) => {
  state.sizeUniform.value = renderConfig.size;
  const particleTarget = physicsMetrics
    ? Math.max(1, Math.floor(physicsMetrics.particleCount * renderConfig.lodMeshRatio))
    : physicsConfig.particleCount;
  state.geometry.instanceCount = Math.min(physicsConfig.particleCount, particleTarget);
  const bloom = postfxConfig.bloom;
  if (bloom && !state.material.mrtNode) {
    state.material.mrtNode = mrt({ bloomIntensity: float(1) });
  } else if (!bloom && state.material.mrtNode) {
    state.material.mrtNode = null;
  }
};

export const createMeshRendererModule = (): ModuleInstance => {
  const id = "render.mesh";
  const state: MeshRendererState = {
    mesh: null,
    geometry: null,
    material: null,
    sizeUniform: null,
  };

  return {
    id,
    label: "Mesh Renderer",
    priority: 50,
    autoStart: true,
    async init(context: AppContext) {
      const physics = context.services.physics;
      if (!physics?.simulator) {
        throw new Error("Mesh renderer requires MLS-MPM simulator");
      }
      const resources = createMeshResources(physics.simulator);
      state.mesh = resources.mesh;
      state.geometry = resources.geometry;
      state.material = resources.material;
      state.sizeUniform = resources.sizeUniform;

      const stage = context.stage;
      if (!stage) {
        throw new Error("Stage must be initialized before mesh renderer");
      }
      stage.add(state.mesh);
      state.mesh.visible = context.config.value.render.mode !== "points";
      context.services.meshRenderer = {
        mesh: state.mesh,
        material: state.material,
      } as MeshRendererService;
    },
    async update(tick: TickInfo) {
      const { mesh, geometry, material, sizeUniform } = state;
      if (!mesh || !geometry || !material || !sizeUniform) {
        return;
      }
      const physics = tick.context.services.physics;
      applyConfig(
        { mesh, geometry, material, sizeUniform },
        tick.config.render,
        tick.config.physics,
        tick.config.postfx,
        physics?.metrics
      );
      mesh.visible = tick.config.render.mode !== "points";
    },
    async dispose(context: AppContext) {
      const { mesh, geometry, material } = state;
      if (mesh && context.stage) {
        context.stage.remove(mesh);
      }
      geometry?.dispose();
      material?.dispose();
      state.mesh = null;
      state.geometry = null;
      state.material = null;
      state.sizeUniform = null;
      delete context.services.meshRenderer;
    },
  };
};
