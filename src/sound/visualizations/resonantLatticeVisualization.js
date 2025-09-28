import * as THREE from "three/webgpu";
import BaseVisualization from "./baseVisualization.js";

const GRID_SIZE = 18;
const SPACING = 0.06;

class ResonantLatticeVisualization extends BaseVisualization {
    constructor() {
        super();
        this.dummy = new THREE.Object3D();
        this.basePositions = [];
        const geometry = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0.45, 0.62, 0.98),
            roughness: 0.35,
            metalness: 0.85,
            emissive: new THREE.Color(0.02, 0.05, 0.15),
        });
        this.mesh = new THREE.InstancedMesh(geometry, material, GRID_SIZE * GRID_SIZE);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.add(this.mesh);

        let index = 0;
        for (let x = 0; x < GRID_SIZE; x += 1) {
            for (let y = 0; y < GRID_SIZE; y += 1) {
                const pos = new THREE.Vector3(
                    (x - GRID_SIZE / 2) * SPACING,
                    (y - GRID_SIZE / 2) * SPACING,
                    0,
                );
                this.basePositions[index] = pos;
                this.dummy.position.copy(pos);
                this.dummy.scale.setScalar(1);
                this.dummy.rotation.set(0, 0, 0);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(index, this.dummy.matrix);
                index += 1;
            }
        }

        this.phase = 0;
        this.color = new THREE.Color();
    }

    update(features, delta, elapsed, { macros }) {
        const { amplitude, bass, spectralCentroid, beat } = features;
        const hype = macros.hype;
        const flow = macros.flow;
        const chill = macros.chill;
        const beatImpulse = beat.isOnset ? beat.confidence * (0.4 + hype * 0.6) : 0;
        const groove = amplitude * (0.6 + hype * 0.5) + beatImpulse;
        const waveSpeed = 1.2 + flow * 1.3;
        const twistAmount = 0.3 + spectralCentroid * 0.9 + beatImpulse * 0.6;
        this.phase += delta * waveSpeed * 2;

        const dummy = this.dummy;
        const bassInfluence = THREE.MathUtils.lerp(0.1, 1.1, bass);
        const chillDamping = THREE.MathUtils.lerp(1.25, 0.65, chill);
        const scaleBase = THREE.MathUtils.lerp(0.8, 1.4, groove);
        let index = 0;
        for (let x = 0; x < GRID_SIZE; x += 1) {
            for (let y = 0; y < GRID_SIZE; y += 1) {
                const base = this.basePositions[index];
                const radial = Math.hypot(base.x, base.y);
                const wave = Math.sin(this.phase + radial * (2.2 + hype * 1.8)) * 0.5 + 0.5;
                const scale = THREE.MathUtils.lerp(0.6, scaleBase, wave) * chillDamping;
                dummy.position.set(base.x, base.y, Math.sin(this.phase * 0.5 + radial * 4) * 0.04 * (0.6 + hype));
                dummy.rotation.set(0, 0, wave * twistAmount);
                dummy.scale.setScalar(scale * bassInfluence);
                dummy.updateMatrix();
                this.mesh.setMatrixAt(index, dummy.matrix);
                index += 1;
            }
        }
        this.mesh.instanceMatrix.needsUpdate = true;

        const hue = THREE.MathUtils.lerp(0.55, 0.85, spectralCentroid);
        const saturation = THREE.MathUtils.lerp(0.45, 0.95, groove);
        const lightness = THREE.MathUtils.clamp(0.35 + groove * 0.35, 0.2, 0.85);
        this.color.setHSL(hue, saturation, lightness);
        this.mesh.material.emissive.setHSL(hue, saturation * 0.8, lightness * 0.7 + beatImpulse * 0.4);
        this.mesh.material.color.copy(this.color);
    }
}

export default ResonantLatticeVisualization;
