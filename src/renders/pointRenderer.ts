// @ts-nocheck
import * as THREE from "three/webgpu";
import { Fn, vec3, instanceIndex } from "three/tsl";
import type { ModuleInstance, TickInfo, AppContext, PhysicsService, PointRendererService } from "../context";

export const createPointRendererModule = (): ModuleInstance => {
  const id = "render.points";
  let points: THREE.Points<THREE.InstancedBufferGeometry, THREE.PointsNodeMaterial> | null = null;
  let geometry: THREE.InstancedBufferGeometry | null = null;
  let material: THREE.PointsNodeMaterial | null = null;
  let simulator: PhysicsService["simulator"] | null = null;

  return {
    id,
    label: "Point Renderer",
    priority: 55,
    autoStart: true,
    async init(context: AppContext) {
      const physics = context.services.physics;
      if (!physics?.simulator) {
        throw new Error("Point renderer requires MLS-MPM simulator");
      }
      simulator = physics.simulator;

      geometry = new THREE.InstancedBufferGeometry();
      const positionBuffer = new THREE.BufferAttribute(new Float32Array(3), 3, false);
      geometry.setAttribute("position", positionBuffer);
      geometry.instanceCount = simulator.numParticles;

      material = new THREE.PointsNodeMaterial();
      material.positionNode = Fn(() => simulator!.particleBuffer.element(instanceIndex).get("position").mul(vec3(1, 1, 0.4)))();

      points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      const scale = 1 / 64;
      points.position.set(-32 * scale, 0, 0);
      points.scale.set(scale, scale, scale);
      points.castShadow = true;
      points.receiveShadow = true;

      const stage = context.stage;
      if (!stage) {
        throw new Error("Stage must be initialized before point renderer");
      }
      stage.add(points);
      points.visible = context.config.value.render.mode !== "mesh";
      context.services.pointRenderer = { points } as PointRendererService;
    },
    async update(tick: TickInfo) {
      if (!geometry || !points) {
        return;
      }
      geometry.instanceCount = tick.config.physics.particleCount;
      points.visible = tick.config.render.mode !== "mesh";
    },
    async dispose(context: AppContext) {
      if (points && context.stage) {
        context.stage.remove(points);
      }
      geometry?.dispose();
      material?.dispose();
      points = null;
      geometry = null;
      material = null;
      delete context.services.pointRenderer;
    },
  };
};
