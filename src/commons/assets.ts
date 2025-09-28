import * as THREE from "three/webgpu";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

type AssetEntry =
  | { kind: "url"; value: string }
  | { kind: "raw"; value: string };

const assetModules = import.meta.glob("../assets/**/*", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const assetLookup = new Map<string, AssetEntry>();
const externalAssetEntries = new Map<string, AssetEntry>();

const normalizePath = (value: string) => value.replace(/\\/g, "/");

const isLikelyUrl = (value: string) =>
  /^https?:\/\//.test(value) ||
  value.startsWith("data:") ||
  value.startsWith("blob:") ||
  value.startsWith("/") ||
  value.startsWith("./") ||
  value.startsWith("../");

const createAssetEntry = (key: string, value: string): AssetEntry => {
  const extension = key.split(".").pop()?.toLowerCase();
  if (extension === "obj" && !isLikelyUrl(value) && value.includes("\n")) {
    return { kind: "raw", value };
  }
  return { kind: "url", value };
};

const addAlias = (aliases: Set<string>, candidate: string) => {
  if (candidate.length > 0) {
    aliases.add(candidate);
  }
};

const registerAsset = (key: string, rawValue: string) => {
  const normalizedKey = normalizePath(key);
  const value = String(rawValue);
  const entry = createAssetEntry(normalizedKey, value);

  const withoutLeadingDots = normalizedKey.replace(/^\.\//, "").replace(/^(\.\.\/)+/, "");
  const withoutPrefix = normalizedKey.replace(/^(?:\.\.\/)?assets\//, "");
  const basename = withoutPrefix.split("/").pop() ?? withoutPrefix;

  const aliases = new Set<string>();
  addAlias(aliases, normalizedKey);
  addAlias(aliases, withoutLeadingDots);
  addAlias(aliases, withoutPrefix);
  addAlias(aliases, basename);
  if (withoutPrefix.length > 0) {
    addAlias(aliases, `assets/${withoutPrefix}`);
    addAlias(aliases, `../assets/${withoutPrefix}`);
  }

  for (const alias of aliases) {
    assetLookup.set(alias, entry);
  }
};

for (const [key, url] of Object.entries(assetModules)) {
  registerAsset(key, url);
}

const resolveAssetEntry = (path: string): AssetEntry => {
  if (isLikelyUrl(path)) {
    let entry = externalAssetEntries.get(path);
    if (!entry) {
      entry = { kind: "url", value: path };
      externalAssetEntries.set(path, entry);
    }
    return entry;
  }

  const normalized = normalizePath(path);
  const withoutLeadingDots = normalized.replace(/^\.\//, "").replace(/^(\.\.\/)+/, "");
  const withoutPrefix = normalized.replace(/^(?:\.\.\/)?assets\//, "");
  const basename = withoutPrefix.split("/").pop() ?? withoutPrefix;

  const candidates = new Set<string>();
  addAlias(candidates, normalized);
  addAlias(candidates, withoutLeadingDots);
  addAlias(candidates, withoutPrefix);
  addAlias(candidates, basename);
  if (withoutPrefix.length > 0) {
    addAlias(candidates, `assets/${withoutPrefix}`);
    addAlias(candidates, `../assets/${withoutPrefix}`);
  }

  for (const candidate of candidates) {
    const entry = assetLookup.get(candidate);
    if (entry) {
      return entry;
    }
  }

  throw new Error(`[assets] Unknown asset: ${path}`);
};

const hdriCache = new Map<AssetEntry, Promise<THREE.DataTexture>>();
const textureCache = new Map<AssetEntry, Promise<THREE.Texture>>();
const objCache = new Map<AssetEntry, Promise<THREE.Group>>();

const rgbLoader = new RGBELoader();
const textureLoader = new THREE.TextureLoader();
const objLoader = new OBJLoader();

export const loadHdri = (path: string): Promise<THREE.DataTexture> => {
  const entry = resolveAssetEntry(path);
  if (entry.kind !== "url") {
    throw new Error(`[assets] HDR must be referenced by URL: ${path}`);
  }
  if (!hdriCache.has(entry)) {
    const promise = new Promise<THREE.DataTexture>((resolve, reject) => {
      rgbLoader.load(
        entry.value,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
    hdriCache.set(entry, promise);
  }
  return hdriCache.get(entry)!;
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
  const entry = resolveAssetEntry(path);
  if (entry.kind !== "url") {
    throw new Error(`[assets] Texture must be referenced by URL: ${path}`);
  }
  if (!textureCache.has(entry)) {
    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      textureLoader.load(
        entry.value,
        (texture) => {
          resolve(applyTextureOptions(texture, options));
        },
        undefined,
        reject
      );
    });
    textureCache.set(entry, promise);
  }
  return textureCache.get(entry)!.then((texture) => applyTextureOptions(texture, options));
};

export const loadObj = (path: string): Promise<THREE.Group> => {
  const entry = resolveAssetEntry(path);
  if (!objCache.has(entry)) {
    const promise = entry.kind === "raw"
      ? Promise.resolve(objLoader.parse(entry.value))
      : objLoader.loadAsync(entry.value);
    objCache.set(entry, promise);
  }
  return objCache.get(entry)!;
};

export const clearAssetCaches = () => {
  hdriCache.clear();
  textureCache.clear();
  objCache.clear();
};
