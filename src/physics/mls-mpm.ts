// @ts-nocheck
import * as THREE from "three/webgpu";
import {
  array,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  Return,
  uniform,
  int,
  float,
  Loop,
  vec3,
  vec4,
  atomicAdd,
  uint,
  max,
    mat3,
  clamp,
  time,
  cross,
  mix,
      ivec3,
} from "three/tsl";
import { triNoise3Dvec } from "../commons/tsl/noise";
import { hsvtorgb } from "../commons/tsl/hsv";
import { StructuredArray } from "./structuredArray";
import type { ModuleInstance, TickInfo, AppContext, AudioProfile, PointerRay, PhysicsService } from "../context";
import type { PhysicsConfig } from "../config";

interface PhysicsState extends PhysicsConfig {
  gravityVector: THREE.Vector3;
  gravitySensor: THREE.Vector3;
  accelerometer: THREE.Vector3;
}

class MlsMpmSimulator {
  renderer;
  numParticles = 0;
  gridSize = new THREE.Vector3(0, 0, 0);
  gridCellSize = new THREE.Vector3(0, 0, 0);
  uniforms = {};
  kernels = {};
  fixedPointMultiplier = 1e7;
  mousePos = new THREE.Vector3();
  mousePosArray = [];
  particleBuffer;
  cellBuffer;
  cellBufferF;
  params;

  constructor(renderer, params) {
    this.renderer = renderer;
    this.params = params;
  }

  setParams(params) {
    this.params = params;
  }

  async init() {
    const { maxParticles } = this.params;
    this.gridSize.set(64, 64, 64);

    const particleStruct = {
      position: { type: "vec3" },
      density: { type: "float" },
      velocity: { type: "vec3" },
      mass: { type: "float" },
      C: { type: "mat3" },
      direction: { type: "vec3" },
      color: { type: "vec3" },
    };
    this.particleBuffer = new StructuredArray(particleStruct, maxParticles, "particleData");

    const vec = new THREE.Vector3();
    for (let i = 0; i < maxParticles; i += 1) {
      let dist = 2;
      while (dist > 1) {
        vec
          .set(Math.random(), Math.random(), Math.random())
          .multiplyScalar(2.0)
          .subScalar(1.0);
        dist = vec.length();
        vec.multiplyScalar(0.8).addScalar(1.0).divideScalar(2.0).multiply(this.gridSize);
      }
      const mass = 1.0 - Math.random() * 0.002;
      this.particleBuffer.set(i, "position", vec);
      this.particleBuffer.set(i, "mass", mass);
    }

    const cellCount = this.gridSize.x * this.gridSize.y * this.gridSize.z;
    const cellStruct = {
      x: { type: "int", atomic: true },
      y: { type: "int", atomic: true },
      z: { type: "int", atomic: true },
      mass: { type: "int", atomic: true },
    };
    this.cellBuffer = new StructuredArray(cellStruct, cellCount, "cellData");
    this.cellBufferF = instancedArray(cellCount, "vec4").label("cellDataF");

    this.uniforms.gravityType = uniform(0, "uint");
    this.uniforms.gravity = uniform(new THREE.Vector3());
    this.uniforms.stiffness = uniform(0);
    this.uniforms.restDensity = uniform(0);
    this.uniforms.dynamicViscosity = uniform(0);
    this.uniforms.noise = uniform(0);
    this.uniforms.audioLevel = uniform(0);
    this.uniforms.audioBeat = uniform(0);
    this.uniforms.audioBands = uniform(new THREE.Vector3());
    this.uniforms.audioFlow = uniform(new THREE.Vector3());
    this.uniforms.audioColorPulse = uniform(0);

    this.uniforms.gridSize = uniform(this.gridSize, "ivec3");
    this.uniforms.gridCellSize = uniform(this.gridCellSize);
    this.uniforms.dt = uniform(0.1);
    this.uniforms.numParticles = uniform(0, "uint");

    this.uniforms.mouseRayDirection = uniform(new THREE.Vector3());
    this.uniforms.mouseRayOrigin = uniform(new THREE.Vector3());
    this.uniforms.mouseForce = uniform(new THREE.Vector3());

    const cellCountUint = uint(cellCount);

    this.kernels.clearGrid = Fn(() => {
      this.cellBuffer.setAtomic("x", false);
      this.cellBuffer.setAtomic("y", false);
      this.cellBuffer.setAtomic("z", false);
      this.cellBuffer.setAtomic("mass", false);

      If(instanceIndex.greaterThanEqual(cellCountUint), () => {
        Return();
      });

      this.cellBuffer.element(instanceIndex).get("x").assign(0);
      this.cellBuffer.element(instanceIndex).get("y").assign(0);
      this.cellBuffer.element(instanceIndex).get("z").assign(0);
      this.cellBuffer.element(instanceIndex).get("mass").assign(0);
      this.cellBufferF.element(instanceIndex).assign(0);
    })().compute(cellCount);

    const encodeFixedPoint = (f32) => int(f32.mul(this.fixedPointMultiplier));
    const decodeFixedPoint = (i32) => float(i32).div(this.fixedPointMultiplier);

    const getCellPtr = (ipos) => {
      const gridSize = this.uniforms.gridSize;
      return int(ipos.x)
        .mul(gridSize.y)
        .mul(gridSize.z)
        .add(int(ipos.y).mul(gridSize.z))
        .add(int(ipos.z))
        .toConst();
    };
    const getCell = (ipos) => this.cellBuffer.element(getCellPtr(ipos));

    this.kernels.p2g1 = Fn(() => {
      this.cellBuffer.setAtomic("x", true);
      this.cellBuffer.setAtomic("y", true);
      this.cellBuffer.setAtomic("z", true);
      this.cellBuffer.setAtomic("mass", true);

      If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
        Return();
      });
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get("position")
        .xyz.toConst("particlePosition");
      const particleVelocity = this.particleBuffer
        .element(instanceIndex)
        .get("velocity")
        .xyz.toConst("particleVelocity");

      const cellIndex = ivec3(particlePosition).sub(1).toConst("cellIndex");
      const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");
      const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
      const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
      const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
      const weights = array([w0, w1, w2]).toConst("weights");

      const C = this.particleBuffer.element(instanceIndex).get("C").toConst();
      Loop({ start: 0, end: 3, type: "int", name: "gx", condition: "<" }, ({ gx }) => {
        Loop({ start: 0, end: 3, type: "int", name: "gy", condition: "<" }, ({ gy }) => {
          Loop({ start: 0, end: 3, type: "int", name: "gz", condition: "<" }, ({ gz }) => {
            const weight = weights
              .element(gx)
              .x.mul(weights.element(gy).y)
              .mul(weights.element(gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cellDist = vec3(cellX)
              .add(0.5)
              .sub(particlePosition)
              .toConst("cellDist");
            const Q = C.mul(cellDist);

            const massContrib = weight;
            const velContrib = massContrib.mul(particleVelocity.add(Q)).toConst("velContrib");
            const cell = getCell(cellX);
            atomicAdd(cell.get("x"), encodeFixedPoint(velContrib.x));
            atomicAdd(cell.get("y"), encodeFixedPoint(velContrib.y));
            atomicAdd(cell.get("z"), encodeFixedPoint(velContrib.z));
            atomicAdd(cell.get("mass"), encodeFixedPoint(massContrib));
          });
        });
      });
    })().compute(1);

    this.kernels.p2g2 = Fn(() => {
      this.cellBuffer.setAtomic("x", true);
      this.cellBuffer.setAtomic("y", true);
      this.cellBuffer.setAtomic("z", true);
      this.cellBuffer.setAtomic("mass", false);

      If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
        Return();
      });
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get("position")
        .xyz.toConst("particlePosition");

      const cellIndex = ivec3(particlePosition).sub(1).toConst("cellIndex");
      const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");
      const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
      const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
      const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
      const weights = array([w0, w1, w2]).toConst("weights");

      const density = float(0).toVar("density");
      Loop({ start: 0, end: 3, type: "int", name: "gx", condition: "<" }, ({ gx }) => {
        Loop({ start: 0, end: 3, type: "int", name: "gy", condition: "<" }, ({ gy }) => {
          Loop({ start: 0, end: 3, type: "int", name: "gz", condition: "<" }, ({ gz }) => {
            const weight = weights
              .element(gx)
              .x.mul(weights.element(gy).y)
              .mul(weights.element(gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cell = getCell(cellX);
            density.addAssign(decodeFixedPoint(cell.get("mass")).mul(weight));
          });
        });
      });
      this.particleBuffer.element(instanceIndex).get("density").assign(density);
    })().compute(1);

    this.kernels.updateGrid = Fn(() => {
      If(instanceIndex.greaterThanEqual(cellCountUint), () => {
        Return();
      });

      const cell = this.cellBuffer.element(instanceIndex);
      const cellMass = decodeFixedPoint(cell.get("mass"));
      If(cellMass.equal(float(0)), () => {
        Return();
      });

      const cellVel = vec3(
        decodeFixedPoint(cell.get("x")),
        decodeFixedPoint(cell.get("y")),
        decodeFixedPoint(cell.get("z"))
      ).div(cellMass);
      const gravityForce = this.uniforms.gravity.toConst("gravityForce");

      const dt = this.uniforms.dt;
      const damping = float(1).sub(this.uniforms.dynamicViscosity.mul(dt).mul(40));
      const noise = this.uniforms.noise;

      const normalized = cellVel.normalized().toConst("normalized");
      const noiseVel = triNoise3Dvec(vec4(normalized.mul(0.05), time.mul(0.1)));
      const noiseControl = this.uniforms.audioBands.toConst("audioBands");
      const noiseMagnitude = noise.mul(0.2).add(noiseControl.y.mul(0.25)).mul(this.uniforms.audioLevel).toConst();
      const noiseVec = noiseVel.mul(noiseMagnitude);

      const newVel = cellVel.mul(damping).add(gravityForce.mul(dt)).add(noiseVec.mul(dt));

      this.cellBufferF.element(instanceIndex).assign(vec4(newVel, cellMass));
    })().compute(cellCount);

    this.kernels.g2p = Fn(() => {
      If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
        Return();
      });
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get("position")
        .xyz.toVar("particlePosition");
      const particleVelocity = this.particleBuffer
        .element(instanceIndex)
        .get("velocity")
        .xyz.toVar("particleVelocity");

      const cellIndex = ivec3(particlePosition).sub(1).toConst("cellIndex");
      const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");
      const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
      const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
      const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
      const weights = array([w0, w1, w2]).toConst("weights");

      const particleDensity = this.particleBuffer.element(instanceIndex).get("density").x.toConst();
      const restDensity = this.uniforms.restDensity.toConst();
      const pressure = max(particleDensity.sub(restDensity), float(0)).mul(this.uniforms.stiffness);
      const bulkModulus = this.uniforms.stiffness.mul(10);
      const elasticity = pressure.div(particleDensity.mul(particleDensity.mul(4).add(bulkModulus)));

      const B = mat3().toVar();
      const particleMass = float(1);
      const audioBeat = this.uniforms.audioBeat.toConst("audioBeat");
      const audioBands = this.uniforms.audioBands.toConst("audioBands");
      const audioLevel = this.uniforms.audioLevel.toConst("audioLevel");
      const audioFlow = this.uniforms.audioFlow.toConst("audioFlow");

      Loop({ start: 0, end: 3, type: "int", name: "gx", condition: "<" }, ({ gx }) => {
        Loop({ start: 0, end: 3, type: "int", name: "gy", condition: "<" }, ({ gy }) => {
          Loop({ start: 0, end: 3, type: "int", name: "gz", condition: "<" }, ({ gz }) => {
            const weight = weights
              .element(gx)
              .x.mul(weights.element(gy).y)
              .mul(weights.element(gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cell = this.cellBufferF.element(getCellPtr(cellX));
            const cellVel = cell.xyz.toConst("cellVel");
            const dist = vec3(cellX).add(0.5).sub(particlePosition).toConst("dist");

            const velocityDiff = cellVel.sub(particleVelocity);
            const pressureTerm = velocityDiff.mul(elasticity);
            const flowImpulse = audioFlow.mul(audioLevel).mul(0.5);
            const beatImpulse = dist
              .normalized()
              .mul(audioBeat.mul(0.3).mul(audioLevel));
            const deltaVelocity = cellVel.add(pressureTerm).add(flowImpulse).add(beatImpulse);
            particleVelocity.addAssign(deltaVelocity.mul(weight));

            const quadratic = cross(dist, velocityDiff);
            B.addAssign(velocityDiff.outerProduct(dist).add(quadratic.mul(0.1)).mul(weight));
          });
        });
      });

      const force = particleVelocity.length();
      const mouseForce = this.uniforms.mouseForce.toConst("mouseForce");
      particleVelocity.addAssign(mouseForce.mul(0.3).mul(force));
      particleVelocity.mulAssign(particleMass);

      this.particleBuffer.element(instanceIndex).get("C").assign(B.mul(4));
      particlePosition.addAssign(particleVelocity.mul(this.uniforms.dt));
      particlePosition.assign(clamp(particlePosition, vec3(2), this.uniforms.gridSize.sub(2)));

      const wallStiffness = 0.3;
      const xN = particlePosition.add(particleVelocity.mul(this.uniforms.dt).mul(3.0)).toConst("xN");
      const wallMin = vec3(3).toConst("wallMin");
      const wallMax = vec3(this.uniforms.gridSize).sub(3).toConst("wallMax");
      If(xN.x.lessThan(wallMin.x), () => {
        particleVelocity.x.addAssign(wallMin.x.sub(xN.x).mul(wallStiffness));
      });
      If(xN.x.greaterThan(wallMax.x), () => {
        particleVelocity.x.addAssign(wallMax.x.sub(xN.x).mul(wallStiffness));
      });
      If(xN.y.lessThan(wallMin.y), () => {
        particleVelocity.y.addAssign(wallMin.y.sub(xN.y).mul(wallStiffness));
      });
      If(xN.y.greaterThan(wallMax.y), () => {
        particleVelocity.y.addAssign(wallMax.y.sub(xN.y).mul(wallStiffness));
      });
      If(xN.z.lessThan(wallMin.z), () => {
        particleVelocity.z.addAssign(wallMin.z.sub(xN.z).mul(wallStiffness));
      });
      If(xN.z.greaterThan(wallMax.z), () => {
        particleVelocity.z.addAssign(wallMax.z.sub(xN.z).mul(wallStiffness));
      });

      this.particleBuffer.element(instanceIndex).get("position").assign(particlePosition);
      this.particleBuffer.element(instanceIndex).get("velocity").assign(particleVelocity);

      const direction = this.particleBuffer.element(instanceIndex).get("direction");
      direction.assign(mix(direction, particleVelocity, 0.1));

      const audioColorPulse = this.uniforms.audioColorPulse.toConst("audioColorPulse");
      const hue = particleDensity
        .div(this.uniforms.restDensity)
        .mul(0.25)
        .add(time.mul(0.05))
        .add(audioBands.z.mul(audioLevel).mul(0.08));
      const saturationBase = particleVelocity.length().mul(0.5).clamp(0, 1).mul(0.3).add(0.7).add(audioBands.y.mul(audioLevel).mul(0.4));
      const saturation = clamp(saturationBase, float(0), float(1));
      const valueBase = force.mul(0.3).add(0.7).add(audioColorPulse.mul(0.4)).add(audioBeat.mul(0.1));
      const value = clamp(valueBase, float(0), float(1));
      const color = hsvtorgb(vec3(hue, saturation, value));
      this.particleBuffer.element(instanceIndex).get("color").assign(color);
    })().compute(1);
  }

  setPointer(pointer) {
    if (!pointer?.active) {
      return;
    }
    const origin = pointer.origin.clone().multiplyScalar(64).add(new THREE.Vector3(32, 0, 0));
    this.uniforms.mouseRayDirection.value.copy(pointer.direction.clone().normalize());
    this.uniforms.mouseRayOrigin.value.copy(origin);
    this.mousePos.copy(pointer.point.clone().multiplyScalar(64));
  }

  async update(interval) {
    const params = this.params;
    this.uniforms.noise.value = params.noise;
    this.uniforms.stiffness.value = params.stiffness;
    this.uniforms.gravityType.value = params.gravity;

    if (params.gravity === 0) {
      this.uniforms.gravity.value.set(0, 0, 0.2);
    } else if (params.gravity === 1) {
      this.uniforms.gravity.value.set(0, -0.2, 0);
    } else if (params.gravity === 3) {
      this.uniforms.gravity.value.copy(params.gravitySensor).add(params.accelerometer);
    }
    this.uniforms.dynamicViscosity.value = params.viscosity;
    this.uniforms.restDensity.value = params.restDensity;

    if (params.particleCount !== this.numParticles) {
      this.numParticles = params.particleCount;
      this.uniforms.numParticles.value = params.particleCount;
      this.kernels.p2g1.count = params.particleCount;
      this.kernels.p2g1.updateDispatchCount();
      this.kernels.p2g2.count = params.particleCount;
      this.kernels.p2g2.updateDispatchCount();
      this.kernels.g2p.count = params.particleCount;
      this.kernels.g2p.updateDispatchCount();
    }

    interval = Math.min(interval, 1 / 60);
    const dt = interval * 6 * params.speed;
    this.uniforms.dt.value = dt;

    this.mousePosArray.push(this.mousePos.clone());
    if (this.mousePosArray.length > 3) {
      this.mousePosArray.shift();
    }
    if (this.mousePosArray.length > 1) {
      this.uniforms.mouseForce.value
        .copy(this.mousePosArray[this.mousePosArray.length - 1])
        .sub(this.mousePosArray[0])
        .divideScalar(this.mousePosArray.length);
    }

    if (params.run) {
      const kernels = [this.kernels.clearGrid, this.kernels.p2g1, this.kernels.p2g2, this.kernels.updateGrid, this.kernels.g2p];
      await this.renderer.computeAsync(kernels);
    }
  }

  setAudioProfile(profile) {
    if (!profile) {
      this.uniforms.audioLevel.value = 0;
      this.uniforms.audioBeat.value = 0;
      this.uniforms.audioBands.value.set(0, 0, 0);
      this.uniforms.audioFlow.value.set(0, 0, 0);
      this.uniforms.audioColorPulse.value = 0;
      return;
    }
    this.uniforms.audioLevel.value = profile.level;
    this.uniforms.audioBeat.value = profile.beat;
    this.uniforms.audioBands.value.set(profile.bands.low, profile.bands.mid, profile.bands.high);
    this.uniforms.audioFlow.value.copy(profile.flow);
    this.uniforms.audioColorPulse.value = profile.colorPulse;
  }

  dispose() {}
}

const toPhysicsState = (config: PhysicsConfig): PhysicsState => ({
  ...config,
  gravityVector: new THREE.Vector3(...config.gravity),
  gravitySensor: new THREE.Vector3(...config.gravitySensor),
  accelerometer: new THREE.Vector3(...config.accelerometer),
});

export const createMlsMpmModule = (): ModuleInstance => {
  const id = "physics.mls-mpm";
  let simulator: MlsMpmSimulator | null = null;
  let audioProfile: AudioProfile | null = null;

  return {
    id,
    label: "MLS-MPM",
    priority: 0,
    autoStart: true,
    async init(context: AppContext) {
      const params = toPhysicsState(context.config.value.physics);
      simulator = new MlsMpmSimulator(context.renderer, params);
      await simulator.init();
      context.services.physics = {
        simulator,
        setAudioProfile(profile) {
          audioProfile = profile;
          simulator.setAudioProfile(profile);
        },
      } as PhysicsService;
    },
    async update(tick: TickInfo) {
      if (!simulator) return;
      simulator.setParams(toPhysicsState(tick.config.physics));
      const pointer = tick.context.services.pointer as PointerRay | undefined;
      if (pointer) {
        simulator.setPointer(pointer);
      }
      simulator.setAudioProfile(audioProfile);
      await simulator.update(tick.delta);
    },
    async resize() {},
    async dispose(context: AppContext) {
      if (simulator) {
        simulator.dispose();
      }
      delete context.services.physics;
      simulator = null;
    },
  };
};

