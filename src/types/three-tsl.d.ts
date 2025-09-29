declare module "three/tsl" {
  export function float(value: number): any;
  export function Fn<T = any>(impl: (...args: any[]) => T): any;
  export function mix(a: any, b: any, t: any): any;
  export function mrt(targets: Record<string, any>): any;
  export const output: any;
  export function pass(scene: any, camera: any): any;
  export function smoothstep(edge0: any, edge1: any, x: any): any;
  export function uniform<T = any>(value: T): any;
  export function uv(): any;
  export function clamp(value: any, min: any, max: any): any;
  export function vec3(x: any, y?: any, z?: any): any;
  export function vec4(x: any, y?: any, z?: any, w?: any): any;
}

declare module "three/examples/jsm/tsl/display/BloomNode.js" {
  export function bloom(input: any, strength?: any, radius?: any, threshold?: any): any;
}

declare module "three/examples/jsm/tsl/display/hashBlur.js" {
  export function hashBlur(input: any, blurAmount?: any, options?: { repeats?: any; premultipliedAlpha?: boolean }): any;
}

declare module "three/examples/jsm/tsl/display/ChromaticAberrationNode.js" {
  export function chromaticAberration(input: any, strength?: any, center?: any, scale?: any): any;
}

declare module "three/examples/jsm/tsl/display/AnamorphicNode.js" {
  export function anamorphic(input: any, threshold?: any, stretch?: any, samples?: number): any;
}

declare module "three/examples/jsm/tsl/display/AfterImageNode.js" {
  export function afterImage(input: any, damp?: any): any;
}
