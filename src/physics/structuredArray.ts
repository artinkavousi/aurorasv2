// @ts-nocheck
import * as THREE from "three/webgpu";
import { instancedArray, struct } from "three/tsl";

interface TypeSpec {
  size: number;
  alignment: number;
  isFloat: boolean;
}

const TYPES: Record<string, TypeSpec> = {
  int: { size: 1, alignment: 1, isFloat: false },
  uint: { size: 1, alignment: 1, isFloat: false },
  float: { size: 1, alignment: 1, isFloat: true },
  vec2: { size: 2, alignment: 2, isFloat: true },
  ivec2: { size: 2, alignment: 2, isFloat: false },
  uvec2: { size: 2, alignment: 2, isFloat: false },
  vec3: { size: 3, alignment: 4, isFloat: true },
  ivec3: { size: 3, alignment: 4, isFloat: false },
  uvec3: { size: 3, alignment: 4, isFloat: false },
  vec4: { size: 4, alignment: 4, isFloat: true },
  ivec4: { size: 4, alignment: 4, isFloat: false },
  uvec4: { size: 4, alignment: 4, isFloat: false },
  mat2: { size: 4, alignment: 2, isFloat: true },
  mat3: { size: 12, alignment: 4, isFloat: true },
  mat4: { size: 16, alignment: 4, isFloat: true },
};

export interface LayoutDescription {
  [key: string]: string | LayoutMemberOptions;
}

export interface LayoutMemberOptions {
  type: string;
}

interface ParsedLayoutMember extends LayoutMemberOptions, TypeSpec {
  offset: number;
}

export type ParsedLayout = Record<string, ParsedLayoutMember>;

export class StructuredArray {
  readonly layout: ParsedLayout;
  readonly length: number;
  readonly structSize: number;
  readonly floatArray: Float32Array;
  readonly intArray: Int32Array;
  readonly buffer: ReturnType<typeof instancedArray>;
  readonly structNode: ReturnType<typeof struct>;

  constructor(layout: LayoutDescription, length: number, label: string) {
    const parsed = this.parseLayout(layout);
    this.layout = parsed.layout;
    this.structSize = parsed.structSize;
    this.length = length;
    this.floatArray = new Float32Array(this.structSize * this.length);
    this.intArray = new Int32Array(this.floatArray.buffer);
    this.structNode = struct(this.layout);
    this.buffer = instancedArray(this.floatArray, this.structNode).label(label);
  }

  setAtomic(element: string, value: boolean) {
    const index = Object.keys(this.layout).findIndex((key) => key === element);
    if (index < 0) {
      console.error(`Unknown element '${element}'`);
      return;
    }
    this.buffer.structTypeNode.membersLayout[index].atomic = value;
  }

  set(index: number, element: string, value: number | number[] | THREE.Vector3 | THREE.Vector4) {
    const member = this.layout[element];
    if (!member) {
      console.error(`Unknown element '${element}'`);
      return;
    }
    const offset = index * this.structSize + member.offset;
    const array = member.isFloat ? this.floatArray : this.intArray;

    if (member.size === 1) {
      if (typeof value !== "number") {
        console.error(`Expected numeric value for element '${element}'`);
        return;
      }
      array[offset] = value;
      return;
    }

    let source: number[];
    if (Array.isArray(value)) {
      source = value;
    } else if (typeof value === "object" && value !== null) {
      const vec = value as THREE.Vector4;
      source = [vec.x, vec.y ?? 0, vec.z ?? 0, vec.w ?? 0];
    } else {
      console.error(`Expected array or vector for element '${element}'`);
      return;
    }

    if (source.length < member.size) {
      console.error(`Expected array length ${member.size} for element '${element}'`);
      return;
    }

    for (let i = 0; i < member.size; i += 1) {
      array[offset + i] = source[i];
    }
  }

  element(index: number) {
    return this.buffer.element(index);
  }

  get(index: number, element: string) {
    return this.buffer.element(index).get(element);
  }

  private parseLayout(layout: LayoutDescription): { layout: ParsedLayout; structSize: number } {
    let offset = 0;
    const parsed: ParsedLayout = {};
    const keys = Object.keys(layout);

    for (const key of keys) {
      const raw = layout[key];
      const member = typeof raw === "string" ? { type: raw } : { ...raw };
      const spec = TYPES[member.type];
      if (!spec) {
        console.error(`Unknown type '${member.type}'`);
        continue;
      }
      const rest = offset % spec.alignment;
      if (rest !== 0) {
        offset += spec.alignment - rest;
      }
      parsed[key] = {
        ...member,
        ...spec,
        offset,
      };
      offset += spec.size;
    }

    const rest = offset % 4;
    if (rest !== 0) {
      offset += 4 - rest;
    }

    return {
      layout: parsed,
      structSize: offset,
    };
  }
}
