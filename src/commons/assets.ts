import * as THREE from "three/webgpu";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const assetModules = import.meta.glob("../assets/**/*", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const assetUrlLookup = new Map<string, string>();

const normalizePath = (value: string) => value.replace(/\\/g, "/");

const registerAssetUrl = (key: string, url: string) => {
  const normalizedKey = normalizePath(key);
  const withoutPrefix = normalizedKey.replace(/^(\.\.\/)?assets\//, "");
  const basename = withoutPrefix.split("/").pop() ?? withoutPrefix;
  assetUrlLookup.set(normalizedKey, url);
  assetUrlLookup.set(withoutPrefix, url);
  assetUrlLookup.set(`assets/${withoutPrefix}`, url);
  assetUrlLookup.set(`../assets/${withoutPrefix}`, url);
  assetUrlLookup.set(basename, url);
};

for (const [key, url] of Object.entries(assetModules)) {
  registerAssetUrl(key, url);
}

const resolveAssetUrl = (path: string): string => {
  if (/^https?:\/\//.test(path) || path.startsWith("data:")) {
    return path;
  }
  const normalized = normalizePath(path).replace(/^\.\//, "").replace(/^\/+/, "");
  const direct = assetUrlLookup.get(normalized);
  if (direct) {
    return direct;
  }
  const fallback = assetUrlLookup.get(normalized.split("/").pop() ?? normalized);
  if (fallback) {
    return fallback;
  }
  throw new Error(`[assets] Unknown asset: ${path}`);
};

const hdriCache = new Map<string, Promise<THREE.DataTexture>>();
const textureCache = new Map<string, Promise<THREE.Texture>>();
const objCache = new Map<string, Promise<THREE.Group>>();

const rgbLoader = new RGBELoader();
const textureLoader = new THREE.TextureLoader();
const objLoader = new OBJLoader();

export const loadHdri = (path: string): Promise<THREE.DataTexture> => {
  const url = resolveAssetUrl(path);
  if (!hdriCache.has(url)) {
    const promise = new Promise<THREE.DataTexture>((resolve, reject) => {
      rgbLoader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
    hdriCache.set(url, promise);
  }
  return hdriCache.get(url)!;
};

export interface TextureOptions {
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  repeat?: THREE.Vector2 | [number, number];
  flipY?: boolean;
}

const applyTextureOptions = (texture: THREE.Texture, options: TextureOptions) => {
  if (options.wrapS !== undefined) {
    texture.wrapS = options.wrapS;
  }
  if (options.wrapT !== undefined) {
    texture.wrapT = options.wrapT;
  }
  if (options.flipY !== undefined) {
    texture.flipY = options.flipY;
  }
  if (options.repeat) {
    const repeat = Array.isArray(options.repeat)
      ? new THREE.Vector2(options.repeat[0], options.repeat[1])
      : options.repeat;
    texture.repeat.copy(repeat);
  }
  return texture;
};

export const loadTexture = (path: string, options: TextureOptions = {}): Promise<THREE.Texture> => {
  const url = resolveAssetUrl(path);
  if (!textureCache.has(url)) {
    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      textureLoader.load(
        url,
        (texture) => {
          resolve(applyTextureOptions(texture, options));
        },
        undefined,
        reject
      );
    });
    textureCache.set(url, promise);
  }
  return textureCache.get(url)!.then((texture) => applyTextureOptions(texture, options));
};

export const loadObj = (path: string): Promise<THREE.Group> => {
  const url = resolveAssetUrl(path);
  if (!objCache.has(url)) {
    objCache.set(url, objLoader.loadAsync(url));
  }
  return objCache.get(url)!;
};

export const clearAssetCaches = () => {
  hdriCache.clear();
  textureCache.clear();
  objCache.clear();
};
