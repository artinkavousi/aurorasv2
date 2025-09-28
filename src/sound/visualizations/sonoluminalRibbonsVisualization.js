import * as THREE from "three/webgpu";
import BaseVisualization from "./baseVisualization.js";

const SEGMENTS = 120;
const RIBBON_COUNT = 3;

class SonoluminalRibbonsVisualization extends BaseVisualization {
    constructor() {
        super();
        this.lines = [];
        this.headPositions = [];
        this.offsets = [];
        const palette = [
            new THREE.Color(0.95, 0.32, 0.68),
            new THREE.Color(0.42, 0.7, 0.98),
            new THREE.Color(0.68, 0.94, 0.6),
        ];
        for (let i = 0; i < RIBBON_COUNT; i += 1) {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(SEGMENTS * 3);
            geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            const material = new THREE.LineBasicMaterial({
                color: palette[i % palette.length],
                linewidth: 2,
                transparent: true,
                opacity: 0.65,
            });
            const line = new THREE.Line(geometry, material);
            line.frustumCulled = false;
            this.add(line);
            this.lines.push({ line, positions, geometry, material });
            this.headPositions.push(new THREE.Vector3());
            this.offsets.push(Math.random() * Math.PI * 2);
        }
        this.time = 0;
    }

    update(features, delta, elapsed, { macros }) {
        this.time += delta;
        const intensity = features.amplitude * (0.8 + macros.hype * 0.6) + (features.beat.isOnset ? features.beat.confidence * 0.5 : 0);
        const radiusBase = THREE.MathUtils.lerp(0.2, 0.55, macros.flow);
        const shimmer = THREE.MathUtils.lerp(0.2, 1.0, features.treble);
        const twist = THREE.MathUtils.lerp(0.5, 1.6, features.spectralCentroid);
        const verticalLift = THREE.MathUtils.lerp(-0.05, 0.35, features.mid);

        for (let i = 0; i < this.lines.length; i += 1) {
            const { positions, geometry, material } = this.lines[i];
            const head = this.headPositions[i];
            const offset = this.offsets[i];
            const time = this.time * (0.8 + i * 0.12 + macros.flow * 0.6);
            const angle = time * twist + offset;
            const radius = radiusBase + Math.sin(time * 0.6 + offset * 0.5) * 0.12 * (0.7 + macros.hype);
            head.set(
                Math.cos(angle) * radius,
                Math.sin(time * 0.7 + offset) * 0.18 + verticalLift,
                Math.sin(angle) * radius,
            );
            this.shiftPositions(positions, head);
            geometry.attributes.position.needsUpdate = true;
            geometry.computeBoundingSphere?.();
            const glow = THREE.MathUtils.clamp(intensity * 1.3 + shimmer * 0.5, 0, 1.6);
            material.opacity = THREE.MathUtils.lerp(material.opacity, 0.25 + glow * 0.6, 0.15);
            material.color.lerpColors(
                material.color,
                new THREE.Color().setHSL(
                    THREE.MathUtils.lerp(0.55, 0.92, features.spectralCentroid),
                    THREE.MathUtils.lerp(0.35, 0.85, shimmer),
                    THREE.MathUtils.clamp(0.4 + intensity * 0.4, 0.2, 0.95),
                ),
                0.35,
            );
        }
        this.rotation.y = elapsed * 0.1 * (0.5 + macros.chill * 0.5) + Math.sin(this.time * 0.5) * 0.05;
        this.rotation.x = THREE.MathUtils.lerp(this.rotation.x, 0.12 + macros.flow * 0.2, 0.05);
    }

    shiftPositions(buffer, head) {
        for (let i = buffer.length - 3; i >= 3; i -= 3) {
            buffer[i] = buffer[i - 3];
            buffer[i + 1] = buffer[i - 2];
            buffer[i + 2] = buffer[i - 1];
        }
        buffer[0] = head.x;
        buffer[1] = head.y;
        buffer[2] = head.z;
    }
}

export default SonoluminalRibbonsVisualization;
