import * as THREE from "three/webgpu";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createLogger, Logger } from "./commons/logger";
import { AppConfig, ConfigStore } from "./config";

export type RenderOverrideFn = (tick: TickInfo) => Promise<void> | void;

export interface RenderOverride {
  fn: RenderOverrideFn;
  priority: number;
}

export interface ModuleInstance {
  id: string;
  label?: string;
  autoStart?: boolean;
  priority?: number;
  init(context: AppContext): Promise<void> | void;
  ready?(context: AppContext): Promise<void> | void;
  update?(tick: TickInfo): Promise<void> | void;
  resize?(size: ResizeInfo, context: AppContext): Promise<void> | void;
  dispose(context: AppContext): Promise<void> | void;
}

export type ModuleFactory<TInstance extends ModuleInstance = ModuleInstance> = () => TInstance;

export interface ModuleDefinition<TInstance extends ModuleInstance = ModuleInstance> {
  id: string;
  factory: ModuleFactory<TInstance>;
  label?: string;
  autoStart?: boolean;
  priority?: number;
}

export interface ModuleEvents {
  "module:init:start": { id: string };
  "module:init:ready": { id: string };
  "module:init:error": { id: string; error: unknown };
  "module:dispose": { id: string };
}

export type EventHandler<TPayload> = (payload: TPayload) => void;

export interface EventBus<TEvents> {
  on<TKey extends keyof TEvents>(type: TKey, handler: EventHandler<TEvents[TKey]>): () => void;
  emit<TKey extends keyof TEvents>(type: TKey, payload: TEvents[TKey]): void;
}

const createEventBus = <TEvents>(): EventBus<TEvents> => {
  const handlers = new Map<keyof TEvents, Set<EventHandler<TEvents[keyof TEvents]>>>();
  return {
    on<TKey extends keyof TEvents>(type: TKey, handler: EventHandler<TEvents[TKey]>) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set as Set<EventHandler<TEvents[keyof TEvents]>>);
      }
      set.add(handler as EventHandler<TEvents[keyof TEvents]>);
      return () => {
        set?.delete(handler as EventHandler<TEvents[keyof TEvents]>);
      };
    },
    emit<TKey extends keyof TEvents>(type: TKey, payload: TEvents[TKey]) {
      const set = handlers.get(type);
      if (!set) {
        return;
      }
      set.forEach((handler) => {
        try {
          (handler as EventHandler<TEvents[TKey]>)(payload);
        } catch (error) {
          console.error(`[event-bus] handler error for ${String(type)}`, error);
        }
      });
    },
  };
};


export interface PointerRay {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  point: THREE.Vector3;
  active: boolean;
  raycaster?: THREE.Raycaster;
  plane?: THREE.Plane;
  ndc?: THREE.Vector2;
}

export interface StageService {
  scene: THREE.Scene;
  camera: THREE.Camera;
  controls?: OrbitControls;
  pointer: PointerRay;
}

export interface AudioProfile {
  level: number;
  beat: number;
  bands: { low: number; mid: number; high: number };
  flow: THREE.Vector3;
  colorPulse: number;
}

export interface AudioMetrics {
  level: number;
  beat: number;
  bass: number;
  mid: number;
  treble: number;
}

export interface AudioEngineHandle {
  metrics: AudioMetrics;
}

export interface AudioService {
  engine: AudioEngineHandle;
  readonly profile: AudioProfile;
  metrics: AudioMetrics;
}

export interface PhysicsSimulatorHandle {
  particleBuffer: {
    element(index: number): {
      get(key: string): unknown;
    };
  };
  numParticles: number;
  setParams?: (config: unknown) => void;
  update?: (delta: number) => Promise<void> | void;
  setAudioProfile?: (profile: AudioProfile | null | undefined) => void;
}

export interface PhysicsService {
  simulator: PhysicsSimulatorHandle;
  setAudioProfile(profile: AudioProfile | null | undefined): void;
}

export interface MeshRendererService {
  mesh: THREE.Object3D;
  material: THREE.Material;
}

export interface PointRendererService {
  points: THREE.Points;
}

export interface PostFxService {
  pipeline: THREE.PostProcessing;
  bloomPass: unknown;
  scenePass: unknown;
  lensPass?: unknown;
  temporalNode?: unknown;
}

export interface DashboardService {
  container: HTMLDivElement;
}

export interface PerfHudService {
  canvas: HTMLCanvasElement;
}

export interface AuroraServices {
  stage?: StageService;
  pointer?: PointerRay;
  audio?: AudioService;
  physics?: PhysicsService;
  meshRenderer?: MeshRendererService;
  pointRenderer?: PointRendererService;
  postfx?: PostFxService;
  dashboard?: DashboardService;
  perfHud?: PerfHudService;
}

export type ServicesRegistry = AuroraServices;

export interface StageHandle {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  add: (object: THREE.Object3D) => void;
  remove: (object: THREE.Object3D) => void;
}

export interface ResizeInfo {
  width: number;
  height: number;
}

export interface AppContext {
  renderer: THREE.WebGPURenderer;
  clock: THREE.Clock;
  config: ConfigStore;
  services: ServicesRegistry;
  events: EventBus<ModuleEvents>;
  modules: ModuleRegistry;
  stage: StageHandle | null;
  logger: Logger;
  setStage(handle: StageHandle | null): void;
}

export interface TickInfo {
  delta: number;
  elapsed: number;
  context: AppContext;
  config: AppConfig;
  renderOverride: RenderOverride | null;
  setRenderOverride: (fn: RenderOverrideFn, priority?: number) => void;
}

interface RegisteredModule {
  definition: ModuleDefinition;
  instance: ModuleInstance | null;
  active: boolean;
  status: "registered" | "initializing" | "active" | "error";
  registrationIndex: number;
}

export class ModuleRegistry {
  #modules = new Map<string, RegisteredModule>();
  #ordered: RegisteredModule[] = [];
  #registrationCounter = 0;
  #logger: Logger;

  constructor(logger: Logger = createLogger("modules")) {
    this.#logger = logger;
  }

  register(definition: ModuleDefinition): this {
    if (this.#modules.has(definition.id)) {
      throw new Error(`Module with id "${definition.id}" already registered`);
    }
    const record: RegisteredModule = {
      definition,
      instance: null,
      active: false,
      status: "registered",
      registrationIndex: this.#registrationCounter++,
    };
    this.#modules.set(definition.id, record);
    this.#ordered = this.#orderModules();
    return this;
  }

  has(id: string): boolean {
    return this.#modules.has(id);
  }

  get(id: string): ModuleInstance | null {
    const record = this.#modules.get(id);
    return record?.instance ?? null;
  }

  getDefinition(id: string): ModuleDefinition | undefined {
    return this.#modules.get(id)?.definition;
  }

  async initAll(context: AppContext): Promise<void> {
    for (const record of this.#ordered) {
      if (record.definition.autoStart === false) {
        continue;
      }
      await this.enable(record.definition.id, context);
    }
  }

  async enable(id: string, context: AppContext): Promise<void> {
    const record = this.#modules.get(id);
    if (!record) {
      throw new Error(`Unknown module: ${id}`);
    }
    if (record.active) {
      return;
    }
    const { factory } = record.definition;
    record.status = "initializing";
    context.events.emit("module:init:start", { id });
    try {
      const instance = factory();
      if (!instance || instance.id !== id) {
        throw new Error(`Module factory for "${id}" returned invalid instance`);
      }
      record.instance = instance;
      await instance.init(context);
      if (instance.ready) {
        await instance.ready(context);
      }
      record.active = true;
      record.status = "active";
      context.events.emit("module:init:ready", { id });
      this.#logger.debug(`Module ${id} initialized`);
    } catch (error) {
      record.status = "error";
      record.active = false;
      record.instance = null;
      context.events.emit("module:init:error", { id, error });
      this.#logger.error(`Failed to initialize module ${id}`, error);
      throw error;
    }
  }

  async disable(id: string, context: AppContext): Promise<void> {
    const record = this.#modules.get(id);
    if (!record || !record.active || !record.instance) {
      return;
    }
    try {
      await record.instance.dispose(context);
    } finally {
      context.events.emit("module:dispose", { id });
      record.instance = null;
      record.active = false;
      record.status = "registered";
    }
  }

  async swap(id: string, definition: ModuleDefinition, context: AppContext, activate = true): Promise<void> {
    await this.disable(id, context);
    this.#modules.delete(id);
    this.register(definition);
    if (activate && definition.autoStart !== false) {
      await this.enable(definition.id, context);
    }
  }

  async disposeAll(context: AppContext): Promise<void> {
    const active = this.#ordered.filter((record) => record.active && record.instance);
    for (const record of active.reverse()) {
      await this.disable(record.definition.id, context);
    }
  }

  async update(context: AppContext, delta: number, elapsed: number): Promise<TickInfo> {
    const tick: TickInfo = {
      delta,
      elapsed,
      context,
      config: context.config.value,
      renderOverride: null,
      setRenderOverride: (fn: RenderOverrideFn, priority = 0) => {
        if (!tick.renderOverride || priority >= tick.renderOverride.priority) {
          tick.renderOverride = { fn, priority };
        }
      },
    };
    for (const record of this.#ordered) {
      if (!record.active || !record.instance?.update) {
        continue;
      }
      await record.instance.update(tick);
    }
    return tick;
  }

  async resize(context: AppContext, size: ResizeInfo): Promise<void> {
    for (const record of this.#ordered) {
      if (!record.active || !record.instance?.resize) {
        continue;
      }
      await record.instance.resize(size, context);
    }
  }

  #orderModules(): RegisteredModule[] {
    return Array.from(this.#modules.values()).sort((a, b) => {
      const priorityA = a.definition.priority ?? 0;
      const priorityB = b.definition.priority ?? 0;
      if (priorityA === priorityB) {
        return a.registrationIndex - b.registrationIndex;
      }
      return priorityA - priorityB;
    });
  }
}

export const createAppContext = (
  renderer: THREE.WebGPURenderer,
  config: ConfigStore,
  modules: ModuleRegistry,
  logger: Logger = createLogger("app")
): AppContext => {
  const services: ServicesRegistry = {};
  let stage: StageHandle | null = null;
  const events = createEventBus<ModuleEvents>();
  const clock = new THREE.Clock();
  return {
    renderer,
    config,
    services,
    events,
    modules,
    stage,
    clock,
    logger,
    setStage(handle: StageHandle | null) {
      stage = handle;
      this.stage = handle;
    },
  };
};
