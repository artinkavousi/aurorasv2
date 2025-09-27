# AuroraSV2 Single-File Module Refactor Proposal

## 1. Deep Analysis
- **Current structure overview.** The runtime entrypoint `app.js` now delegates renderer/camera/background setup to the new `stage` module while still orchestrating simulation lifecycle, post-processing toggles, and input bridging, with supporting files handling lights, background geometry, simulation buffers, and UI controls.【F:src/app.js†L1-L105】【F:src/stage/stage.js†L1-L160】【F:src/stage/lights.js†L1-L58】【F:src/backgroundGeometry.js†L1-L73】【F:src/mls-mpm/mlsMpmSimulator.js†L1-L400】【F:src/conf.js†L1-L121】【F:src/info.js†L1-L48】 Assets are colocated under `src/assets`, and MLS-MPM helpers sit in `src/mls-mpm` with shared math in `src/common`.
- **Redundancies & fragmentation.** Rendering responsibilities split across `ParticleRenderer` and `PointRenderer`, yet both depend on raw simulator buffers and duplicate transform logic; their materials also hard-code bloom routing instead of sharing a material hub.【F:src/mls-mpm/particleRenderer.js†L1-L179】【F:src/mls-mpm/pointRenderer.js†L1-L35】 Post-processing, stage management, and IO/presence text are embedded in `app.js`, leaving no reusable stage pipeline. Config (`conf.js`) mixes runtime state, tweakpane bindings, and sensor hooks, making it difficult to reuse or test.【F:src/conf.js†L6-L119】
- **Interface gaps & tight coupling.** Modules still rely on global singletons (e.g., `conf`, `Info`) and direct simulator references rather than typed handles, so `app.js` must imperatively wire every dependency and forward state instead of negotiating contracts.【F:src/app.js†L24-L105】【F:src/mls-mpm/particleRenderer.js†L122-L178】【F:src/mls-mpm/mlsMpmSimulator.js†L371-L397】 Lifecycle hooks remain implicit.
- **Performance & DX pain points.** Stage initialization continues to perform sequential async loads for HDRI and background geometry with manual progress updates, and the render loop still branches per frame for bloom instead of routing through a configurable pipeline manager.【F:src/stage/stage.js†L79-L119】【F:src/app.js†L75-L91】 The MLS-MPM simulator is a 400+ line monolith without separation between data schema, compute kernels, and frame update, complicating profiling or worker offloading.【F:src/mls-mpm/mlsMpmSimulator.js†L1-L400】

## 2. Architecture & Pipeline Proposal
- **Target module tree**
  ```
  src/
    main.ts
    config.ts
    commons/
      assets.ts
      math.ts
    io/
      dashboard.ts
      sensors.ts
    presents/presets.ts
    stage/stage.ts
    stage/lights.ts
    physics/mls-mpm.ts
    renders/materials.ts
    renders/meshRenderer.ts
    renders/pointRenderer.ts
    postfx/postfx.ts
    postfx/cameralens.ts
    audio/audio.ts
    audio/audioPanel.ts
  ```
- **Flow description.** `main.ts` loads `config`, builds shared context (renderer, event bus, asset loader), then initializes `stage`, `physics`, `renders`, `postfx`, `audio`, and `io`. Each module registers with the scheduler via a lifecycle contract (`create → init → ready → update → dispose`). Presets feed configuration snapshots into modules; IO/dashboard dispatches parameter changes through typed channels.
- **Boundary definitions.**
  - *Stage* owns canvas, renderer, resize events, camera rigs, environment maps, and lighting, exposing `StageHandle` for renderers and physics to attach objects. Lighting logic migrates into `stage/lights.ts` with a pure factory.
  - *Physics* isolates MLS-MPM logic; it exports compute buffers and a derived view API for render modules (readonly typed views), plus hot-swappable worker entrypoints.
  - *Rendering* modules consume only published physics interfaces and stage handles; materials/material factory centralizes TSL nodes.
  - *PostFX* wraps composer setup and exposes toggles/pipelines for bloom/camera lens.
  - *Audio* handles WebAudio + analysis nodes; `audioPanel` bridges to dashboard while remaining optional.
  - *IO/dashboard* encapsulates tweakpane setup, sensor bridging, and event dispatch to config observers.
  - *Config* contains schema (zod or TS types) plus defaults and serialization.
  - *Assets/presents* provide lazy loaders and curated presets for runtime scenes.
- **Module interfaces (TypeScript-style).**
  ```ts
  export interface LifecycleModule<C, R = void> {
    create(options: C): ModuleInstance<R>;
  }

  export interface ModuleInstance<R> {
    init(ctx: AppContext): Promise<void>;
    ready?(): Promise<void>;
    update(dt: number, elapsed: number): Promise<R> | R;
    dispose(): Promise<void> | void;
  }

  export interface StageHandle {
    renderer: WebGPURenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    add(object: THREE.Object3D): void;
    remove(object: THREE.Object3D): void;
  }

  export interface PhysicsHandle {
    particles: StructuredView;
    setPointerInteraction(ray: PointerRay): void;
  }

  export interface DashboardAPI {
    onChange<T>(channel: DashboardChannel<T>, handler: (value: T) => void): () => void;
    setMetrics(metrics: Partial<Metrics>): void;
  }
  ```
- **Hot-swap strategy.** Provide `moduleManager.swap(name, loader)` that awaits `import()` for replacement modules, calls `dispose()` on old instance, instantiates new via `create()`, and reuses shared context (renderer, config, assets). Physics can run inside a Worker; swapping tears down worker and loads next script via dynamic import URL.
- **Error handling & lifecycle.** Central scheduler wraps lifecycle promises with try/catch, forwarding errors to a logging/reporting module. Initialization order: config → assets registry → stage → physics → renders → postfx → audio → io/presets. Each module signals readiness; failures trigger `dispose()` on previously initialized modules. Update loop ensures modules opt-in to execution based on flags; disposal flushes event listeners, GPU resources, and workers.

## 3. Consolidated File Map (final)
- `src/main.ts` — Bootstraps renderer, instantiates module manager, loads config/presets, wires update loop. **Exports:** `bootstrap(options?: Partial<Config>): Promise<AppRuntime>`. **Dependencies:** `config`, `commons/assets`, `stage/stage`, `physics/mls-mpm`, renderers, postfx, audio, io. **Lifecycle hooks:** orchestrates all module `create/init/update/dispose` calls.
- `src/config.ts` — Zod/TypeScript schema for runtime settings (particles, bloom, material params), default presets, persistence helpers. **Exports:** `Config`, `ConfigDefaults`, `applyPreset(name)`. **Dependencies:** none. **Hooks:** notifies subscribers via simple observable.
- `src/commons/assets.ts` — Central asset registry, async loaders for HDRI, OBJ, textures, with progress events to replace ad-hoc `RGBELoader` calls.【F:src/stage/stage.js†L79-L109】【F:src/backgroundGeometry.js†L17-L61】 **Exports:** `createAssetStore()`, `loadAsset(id)`, `preload(list)`. **Hooks:** handles `init/dispose` for loaders and caches.
- `src/commons/math.ts` — Packs reusable TSL functions (`triNoise3Dvec`, `hsvtorgb`, look-at helpers) into one module with named exports for reuse across physics/renderers.【F:src/common/noise.js†L1-L80】【F:src/common/hsv.js†L1-L55】【F:src/mls-mpm/particleRenderer.js†L7-L21】
- `src/io/dashboard.ts` — Encapsulates tweakpane UI, stats graph, simulation controls, and sensor bridging with typed channels replacing singleton `conf`.【F:src/conf.js†L6-L119】 **Exports:** `createDashboard(config, channels)`. **Hooks:** registers DOM nodes on `init`, cleans up listeners on `dispose`.
- `src/io/sensors.ts` — Gravity/accelerometer abstraction that returns unsubscribe handles, isolating browser sensor usage from config module.【F:src/conf.js†L44-L53】
- `src/presents/presets.ts` — Provides named presets, stage themes, asset bundles, and UI metadata.
- `src/stage/stage.ts` — Owns renderer, camera, controls, environment maps, resize, pointer events; exposes `StageHandle` and pointer ray emitter instead of `app.js` monolith.【F:src/stage/stage.js†L25-L160】
- `src/stage/lights.js` — Contains light rig creation/updater with parameterized presets, factoring out `Lights` class for reuse.【F:src/stage/lights.js†L1-L58】
- `src/physics/mls-mpm.ts` — Consolidates simulator creation, structured buffer schema, compute kernels, pointer interactions, update loop; splits compute definitions (schema, kernels, update) within file via regions to honor SFM.【F:src/mls-mpm/mlsMpmSimulator.js†L1-L400】【F:src/mls-mpm/structuredArray.js†L1-L119】 **Exports:** `createMlsMpm(options)` returning lifecycle instance and readonly buffer views.
- `src/renders/materials.ts` — Material factory with NodeMaterial presets, bloom MRT routing, and shared uniforms for render modules.【F:src/mls-mpm/particleRenderer.js†L122-L178】
- `src/renders/meshRenderer.ts` — Encapsulates instanced mesh renderer logic (current particle mesh) with hooks into `physics` data; optional shadow toggles.
- `src/renders/pointRenderer.ts` — Lightweight point renderer for debugging/alternative viz; toggled via config channels.【F:src/mls-mpm/pointRenderer.js†L9-L33】
- `src/postfx/postfx.ts` — Wraps `THREE.PostProcessing`, bloom, tone mapping, and MRT integration with parameterized controls.【F:src/postfx/postProcessing.js†L1-L45】
- `src/postfx/cameralens.ts` — Additional lens distortion/DOF pipeline, factoring optional camera effects.
- `src/audio/audio.ts` — WebAudio analyzer, beat detection, event stream for modules.
- `src/audio/audioPanel.ts` — Dashboard integration for audio controls.

Each file adheres to SFM by exporting `createX(options)` returning lifecycle-compliant instances; dependencies are injected via context rather than singleton imports.

## 4. Refactor Plan (step-by-step)
1. **Establish TypeScript/ESM baseline.** Configure Vite to use TS entry, enable strict mode, migrate existing JS files to `.ts` with type annotations for public APIs.
2. **Introduce lifecycle scaffold.** Add `main.ts` with scheduler + context types; wrap current `App` logic to ensure behavior parity while prepping module splits.
3. **Modularize stage.** Move renderer/camera/controls/environment setup from `app.js` into `stage/stage.ts`; migrate light factory to `stage/lights.ts`; adjust consumers to request handles instead of instantiating classes directly.
4. **Create config/dashboard separation.** Replace `conf` singleton with `config.ts` schema and `io/dashboard.ts` UI binding; update modules to subscribe to config values via injected channels rather than global import.
5. **Repackage physics.** Merge `mlsMpmSimulator.js`, `structuredArray.js`, and helper math into `physics/mls-mpm.ts`, exposing typed buffer views and pointer interaction API; adapt renderers to new interface.
6. **Split render modules.** Move `ParticleRenderer` and `PointRenderer` into `renders/*`, refactoring to accept `PhysicsHandle` and stage references while delegating material setup to `renders/materials.ts`.
7. **Centralize post-processing.** Extract bloom/composer logic into `postfx/postfx.ts`, providing toggles to config and stage.
8. **Integrate assets/presets.** Build `commons/assets.ts` and `presents/presets.ts` to manage HDRI/geometry/textures and user-selectable scenarios.
9. **Optional audio integration.** Create `audio/*` modules; integrate with dashboard when enabled.
10. **Cleanup & normalization.** Remove deprecated files (`app.js`, `conf.js`, `info.js`, old `mls-mpm/*`), update import paths, ensure naming consistency, and document module interfaces for downstream callers.

## 5. Performance & Optimization Checklist
- Target 60 FPS budget with ~4 ms render, ~6 ms physics; monitor via dashboard metrics.
- Build frame graph mapping stage render, postfx, physics compute dispatch order; allow toggling modules for profiling.
- Implement lazy asset imports and code-split optional modules (audio, presets) via dynamic `import()`.
- Evaluate workerizing physics by moving compute kernels into WebGPU-compatible worker when available; ensure transferable state.
- Pool GPU resources (render targets, buffers) inside modules with explicit disposal.
- Provide profiling hooks (GPU timestamp queries, CPU timers) exposed through dashboard.

## 6. Coding Standard & Conventions
- Use **ESM with named exports**, no default exports except when required by tooling.
- Prefer `.ts` with strict typing; fallback to JSDoc when binding to third-party JS.
- Follow SFM: single cohesive component per file with clearly marked regions (`// #region setup`, `// #endregion`).
- Lifecycle: every module implements `create/options`, `init`, optional `ready`, `update`, `dispose` with deterministic cleanup.
- No hidden singletons; share state via injected context or event emitters.
- Logging via structured logger with levels; disable in production builds.

## 7. Acceptance Criteria & Tests
- Vite build (`npm run build`) and dev server (`npm run dev`) succeed without runtime errors.
- Type checking (`npm run typecheck`) and lint (`npm run lint`) run clean after TS migration.
- Each module verifies standalone usage through unit smoke tests or story-style harness (import, init, update, dispose).
- Demonstrate hot-swap by dynamically replacing `physics/mls-mpm.ts` or `renders/meshRenderer.ts` via dashboard toggle without page reload.
- Performance smoke test: maintain ≥50 FPS at default particle count on reference hardware; document metrics in dashboard.
- Regression scenes from presets render identical visuals compared to pre-refactor baseline.

## 8. Implementation Progress
- Extracted a dedicated `createStage` module that encapsulates camera, controls, lighting, HDRI environment, background geometry, and pointer projection, allowing `app.js` to focus on simulation orchestration.【F:src/stage/stage.js†L25-L160】【F:src/app.js†L24-L105】
- Replaced the legacy `Lights` class with a configurable factory that supports optional animated rigs and shadow tuning for downstream presets.【F:src/stage/lights.js†L1-L58】
- Moved bloom and MRT composition into `createPostProcessing`, enabling lifecycle-driven disposal and future configurability from the dashboard/API surface.【F:src/postfx/postProcessing.js†L1-L45】【F:src/app.js†L48-L91】
- Updated pointer interaction flow so MLS-MPM receives normalized ray data from the stage layer rather than duplicating raycaster math inside the application shell.【F:src/stage/stage.js†L121-L158】【F:src/app.js†L56-L67】
- Upgraded Three.js to r180 to track the latest WebGPU fixes ahead of broader module refactors.【F:package.json†L20-L26】
