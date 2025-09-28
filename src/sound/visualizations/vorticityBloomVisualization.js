import * as THREE from "three/webgpu";
import BaseVisualization from "./baseVisualization.js";

const POINT_COUNT = 2400;

class VorticityBloomVisualization extends BaseVisualization {
    constructor() {
        super();
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(POINT_COUNT * 3);
        const speeds = new Float32Array(POINT_COUNT);
        for (let i = 0; i < POINT_COUNT; i += 1) {
            const radius = Math.random() * 0.35 + 0.05;
            const angle = Math.random() * Math.PI * 2;
            const height = (Math.random() - 0.5) * 0.3;
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = height;
            positions[i * 3 + 2] = Math.sin(angle) * radius;
            speeds[i] = 0.3 + Math.random() * 0.9;
        }
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
                uTime: { value: 0 },
                uIntensity: { value: 0 },
                uHue: { value: 0.66 },
                uBeat: { value: 0 },
            },
            vertexShader: /* glsl */`
                attribute float speed;
                uniform float uTime;
                uniform float uIntensity;
                varying float vLife;
                varying float vHeight;
                void main() {
                    vec3 transformed = position;
                    float radial = length(transformed.xz);
                    float spiral = uTime * speed * 0.4 + radial * 6.0;
                    transformed.xz = mat2(cos(spiral), -sin(spiral), sin(spiral), cos(spiral)) * transformed.xz;
                    float rise = sin(uTime * speed * 0.35 + radial * 3.0) * 0.25 * uIntensity;
                    transformed.y += rise;
                    vHeight = transformed.y;
                    vLife = radial;
                    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
                    gl_PointSize = 220.0 * (uIntensity * 0.5 + 0.4) / -mvPosition.z;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: /* glsl */`
                precision mediump float;
                uniform float uIntensity;
                uniform float uHue;
                uniform float uBeat;
                varying float vLife;
                varying float vHeight;
                vec3 hsl2rgb(vec3 hsl) {
                    vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
                    return hsl.z + hsl.y * (rgb - 0.5) * (1.0 - abs(2.0 * hsl.z - 1.0));
                }
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    float alpha = smoothstep(0.5, 0.0, dist);
                    float halo = smoothstep(0.45, 0.0, dist) * (0.4 + uBeat * 0.6);
                    float lightness = mix(0.25, 0.95, clamp(uIntensity + halo, 0.0, 1.0));
                    float saturation = mix(0.45, 1.0, clamp(vHeight + uIntensity * 0.8, 0.0, 1.0));
                    vec3 color = hsl2rgb(vec3(uHue, saturation, lightness));
                    gl_FragColor = vec4(color, alpha * (0.75 + uIntensity * 0.35));
                }
            `,
            blending: THREE.AdditiveBlending,
        });

        this.points = new THREE.Points(geometry, material);
        this.add(this.points);
        this.time = 0;
    }

    update(features, delta, elapsed, { macros }) {
        this.time += delta;
        const intensity = THREE.MathUtils.clamp(features.bass * 0.6 + features.mid * 0.4 + features.beat.confidence * 0.5, 0, 1);
        const macroBoost = THREE.MathUtils.lerp(0.75, 1.4, macros.hype);
        const colorShift = THREE.MathUtils.lerp(0.5, 0.85, features.spectralCentroid);
        this.points.material.uniforms.uTime.value = this.time * (0.8 + macros.flow * 0.6);
        this.points.material.uniforms.uIntensity.value = intensity * macroBoost;
        this.points.material.uniforms.uHue.value = colorShift;
        this.points.material.uniforms.uBeat.value = features.beat.isOnset ? features.beat.confidence : 0;
        this.rotation.y += delta * 0.3 * (0.5 + macros.flow);
        this.rotation.x = THREE.MathUtils.lerp(this.rotation.x, features.mid * 0.4 - 0.2, 0.08);
    }
}

export default VorticityBloomVisualization;
