export type Vector3Tuple = [number, number, number];

export interface StageConfig {
  hdri: string;
  toneMappingExposure: number;
  environmentIntensity: number;
  environmentRotation: Vector3Tuple;
  backgroundRotation: Vector3Tuple;
  camera: {
    fov: number;
    near: number;
    far: number;
    position: Vector3Tuple;
    target: Vector3Tuple;
  };
  controls: {
    enableDamping: boolean;
    enablePan: boolean;
    touches: Record<string, number>;
    minPolarAngle: number;
    maxPolarAngle: number;
    minAzimuthAngle: number;
    maxAzimuthAngle: number;
    maxDistance: number;
  };
  pointerPlane: {
    normal: Vector3Tuple;
    constant: number;
  };
}

export interface PhysicsConfig {
  maxParticles: number;
  particleCount: number;
  run: boolean;
  speed: number;
  noise: number;
  workerEnabled: boolean;
  fixedTimestep: number;
  iterations: number;
  stiffness: number;
  density: number;
  restDensity: number;
  viscosity: number;
  gravity: Vector3Tuple;
  gravitySensor: Vector3Tuple;
  accelerometer: Vector3Tuple;
}

export interface RenderConfig {
  mode: "mesh" | "points" | "hybrid";
  size: number;
  bloomMask: number;
}

export interface PostFxConfig {
  bloom: boolean;
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  focusCenter: [number, number];
  focusInnerRadius: number;
  focusOuterRadius: number;
  blurStrength: number;
  blurIterations: number;
  chromaticAberrationStrength: number;
  chromaticAberrationScale: number;
  lensStreaks: boolean;
  lensStreakIntensity: number;
  lensStreakThreshold: number;
  lensStreakStretch: number;
  temporalEnabled: boolean;
  temporalFeedback: number;
  temporalBlend: number;
}

export interface AudioConfig {
  enabled: boolean;
  source: "microphone" | "file" | "loop";
  sensitivity: number;
  smoothing: number;
  dynamics: number;
  bassGain: number;
  midGain: number;
  trebleGain: number;
  flow: number;
  swirl: number;
  displacement: number;
  colorBoost: number;
  beatHold: number;
  beatDecay: number;
  beatRelease: number;
}

export interface DiagnosticsConfig {
  perfHud: boolean;
  debugLogging: boolean;
}

export interface PresetConfig {
  active: string | null;
  autoLoad: boolean;
}

export interface AppConfig {
  stage: StageConfig;
  physics: PhysicsConfig;
  render: RenderConfig;
  postfx: PostFxConfig;
  audio: AudioConfig;
  diagnostics: DiagnosticsConfig;
  presets: PresetConfig;
}

export const APP_CONFIG_STORAGE_KEY = "aurorasv2:config";

export const defaultConfig: AppConfig = {
  stage: {
    hdri: "autumn_field_puresky_1k.hdr",
    toneMappingExposure: 0.66,
    environmentIntensity: 0.5,
    environmentRotation: [0, -2.15, 0],
    backgroundRotation: [0, 2.15, 0],
    camera: {
      fov: 60,
      near: 0.01,
      far: 5,
      position: [0, 0.5, -1],
      target: [0, 0.5, 0.2],
    },
    controls: {
      enableDamping: true,
      enablePan: false,
      touches: { TWO: 2 },
      minPolarAngle: 0.2 * Math.PI,
      maxPolarAngle: 0.8 * Math.PI,
      minAzimuthAngle: 0.7 * Math.PI,
      maxAzimuthAngle: 1.3 * Math.PI,
      maxDistance: 2,
    },
    pointerPlane: {
      normal: [0, 0, -1],
      constant: 0.2,
    },
  },
  physics: {
    maxParticles: 8192 * 16,
    particleCount: 8192 * 4,
    run: true,
    speed: 1,
    noise: 1,
    workerEnabled: false,
    fixedTimestep: 1 / 120,
    iterations: 3,
    stiffness: 3,
    density: 1,
    restDensity: 1,
    viscosity: 0.1,
    gravity: [0, -0.8, 0],
    gravitySensor: [0, 0, 0],
    accelerometer: [0, 0, 0],
  },
  render: {
    mode: "mesh",
    size: 1,
    bloomMask: 1,
  },
  postfx: {
    bloom: true,
    bloomThreshold: 0.82,
    bloomStrength: 0.9,
    bloomRadius: 0.6,
    focusCenter: [0.5, 0.5],
    focusInnerRadius: 0.2,
    focusOuterRadius: 0.62,
    blurStrength: 0.045,
    blurIterations: 36,
    chromaticAberrationStrength: 0.9,
    chromaticAberrationScale: 1.1,
    lensStreaks: true,
    lensStreakIntensity: 0.28,
    lensStreakThreshold: 0.88,
    lensStreakStretch: 2.4,
    temporalEnabled: true,
    temporalFeedback: 0.85,
    temporalBlend: 0.5,
  },
  audio: {
    enabled: false,
    source: "microphone",
    sensitivity: 1,
    smoothing: 0.65,
    dynamics: 0.8,
    bassGain: 1.1,
    midGain: 1,
    trebleGain: 1,
    flow: 0.6,
    swirl: 0.55,
    displacement: 0.35,
    colorBoost: 0.8,
    beatHold: 0.12,
    beatDecay: 0.92,
    beatRelease: 1.6,
  },
  diagnostics: {
    perfHud: false,
    debugLogging: false,
  },
  presets: {
    active: null,
    autoLoad: true,
  },
};

export type ConfigListener = (config: AppConfig) => void;

export interface ConfigStore {
  readonly value: AppConfig;
  subscribe(listener: ConfigListener): () => void;
  patch(next: DeepPartial<AppConfig>): AppConfig;
  replace(next: AppConfig): AppConfig;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergeDeep = <T>(target: T, patch: DeepPartial<T>): T => {
  if (patch === undefined || patch === null) {
    return target;
  }
  if (Array.isArray(patch)) {
    return patch as unknown as T;
  }
  if (!isPlainObject(target) || !isPlainObject(patch)) {
    return (patch as unknown as T) ?? target;
  }
  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const key of Object.keys(patch)) {
    const patchValue = (patch as Record<string, unknown>)[key];
    const currentValue = (target as Record<string, unknown>)[key];
    if (patchValue === undefined) {
      continue;
    }
    if (isPlainObject(currentValue) && isPlainObject(patchValue)) {
      result[key] = mergeDeep(currentValue, patchValue as DeepPartial<unknown>) as unknown;
    } else {
      result[key] = patchValue as unknown;
    }
  }
  return result as T;
};

const cloneConfig = (config: AppConfig): AppConfig =>
  JSON.parse(JSON.stringify(config)) as AppConfig;

class ConfigStoreImpl implements ConfigStore {
  #value: AppConfig;
  #listeners = new Set<ConfigListener>();

  constructor(initial: AppConfig) {
    this.#value = cloneConfig(initial);
  }

  get value(): AppConfig {
    return this.#value;
  }

  subscribe(listener: ConfigListener): () => void {
    this.#listeners.add(listener);
    listener(this.#value);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  patch(next: DeepPartial<AppConfig>): AppConfig {
    this.#value = mergeDeep(this.#value, next);
    this.#emit();
    return this.#value;
  }

  replace(next: AppConfig): AppConfig {
    this.#value = cloneConfig(next);
    this.#emit();
    return this.#value;
  }

  #emit() {
    for (const listener of this.#listeners) {
      listener(this.#value);
    }
  }
}

export interface ConfigStoreOptions {
  initial?: DeepPartial<AppConfig>;
  persist?: boolean;
  storage?: Storage;
}

const loadPersistedConfig = (storage: Storage | undefined, persist: boolean): DeepPartial<AppConfig> | undefined => {
  if (!persist || !storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(APP_CONFIG_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as DeepPartial<AppConfig>;
  } catch (error) {
    console.warn("[config] Failed to parse persisted config", error);
    return undefined;
  }
};

const persistConfig = (storage: Storage | undefined, persist: boolean, config: AppConfig) => {
  if (!persist || !storage) {
    return;
  }
  try {
    storage.setItem(APP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn("[config] Failed to persist config", error);
  }
};

export const createConfigStore = (options: ConfigStoreOptions = {}): ConfigStore => {
  const storage = options.storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  const persist = options.persist ?? true;
  const persisted = loadPersistedConfig(storage, persist);
  const base = mergeDeep(defaultConfig, options.initial ?? {});
  const initial = mergeDeep(base, persisted ?? {});
  const store = new ConfigStoreImpl(initial);
  if (persist && storage) {
    store.subscribe((config) => persistConfig(storage, persist, config));
  }
  return store;
};

export const resetConfigStore = (store: ConfigStore) => {
  store.replace(defaultConfig);
};
