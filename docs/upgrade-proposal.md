# AuroraSV2 Upgrade & Refactor Proposal

## 1. Executive Summary
AuroraSV2 is moving to a modular, hot-swappable runtime centered on an application context and ESM-first architecture. This proposal distills the Refactor Master Plan into a sequenced delivery roadmap, adds polish tasks for launch quality, and highlights operational guardrails. The goal is to shift from the legacy monolith to a predictable, documented system without disrupting show production.

## 2. Guiding Objectives
- Deliver the architecture described in `docs/refactor-master-plan.md` with every module owned by a clear API surface and lifecycle contract.
- Preserve visual parity (or better) with current stage presets while enabling runtime swapping of physics, renderers, and audio pipelines.
- Make the developer workflow type-safe, testable, and ready for automated builds.
- Document decisions, diagnostics, and hot-swap recipes so future iterations can evolve without rediscovery.

## 3. Current Pain Points
- Cross-file singletons and ad-hoc module managers make state brittle and difficult to hot-reload.
- Configuration is scattered across JSON snippets and hard-coded constants, preventing reproducible show presets.
- Diagnostics are manual (console logs, ad-hoc overlays) making regressions costly to track.
- Build pipeline lacks strict type coverage and smoke testing, causing regressions to reach stage rehearsals.

## 4. Target Architecture Snapshot
The new structure (see `docs/refactor-master-plan.md`, sections 2 through 4) defines one module per subsystem with `create*Module()` factories and `init -> ready? -> update -> dispose` lifecycles inside a shared `AppContext`. Key responsibilities:
- `stage/stage.ts`: Owns the Three.js scene, camera, and environment controls.
- `audio/audio.ts`: Streams audio inputs, runs FFT/beat detection, and exposes normalized profiles.
- `physics/mls-mpm.ts`: Handles MLS-MPM simulation and responds to audio and pointer signals.
- `renders/meshRenderer.ts` and `renders/pointRenderer.ts`: Render surfaces and diagnostics using simulator buffers.
- `postfx/postfx.ts`: Controls the MRT plus bloom stack and provides render overrides.
- `io/dashboard.ts` and `diagnostics/perfHud.ts`: Surface metrics and interaction controls backed by the config store.

## 5. Workstreams & Deliverables
### Phase 0 - Foundations
- Create `config.ts`, `context.ts`, and module registry primitives with strict typing.
- Set up logging (`commons/logger.ts`) and asset loaders (`commons/assets.ts`).
- Define the baseline `AppConfig` schema and seed presets (default, performance, showcase).

### Phase 1 - Core Systems
- Port stage creation to `stage/stage.ts` with deterministic init and dispose hooks.
- Implement WebAudio pipeline in `audio/audio.ts` and connect to the context services layer.
- Bring the MLS-MPM simulator into `physics/mls-mpm.ts` using `physics/structuredArray.ts` helpers.

### Phase 2 - Rendering & PostFX
- Rebuild mesh and point renderers as separate modules consuming physics outputs.
- Integrate post-processing in `postfx/postfx.ts` with config-driven bloom toggles and overrides.
- Ensure modules register render overrides via `TickInfo.setRenderOverride` when bloom is active.

### Phase 3 - UX & Diagnostics
- Implement the dashboard overlay with live metrics, toggles, and preset switching.
- Add the performance HUD canvas and tie sampling to the render loop.
- Produce how-to guides for module swaps and diagnostics usage.

### Phase 4 - Hardening & Polish
- Sweep for `// @ts-nocheck` usage and replace with typed definitions where feasible.
- Add smoke tests for module lifecycle (init, update, dispose) and configuration persistence.
- Script a baseline profiling pass (camera orbit plus audio playlist) and capture metrics.

## 6. Milestones & Acceptance Gates
- **M1: Context & Config Ready** - `npm run build` passes with new `main.ts` bootstrapping the registry, legacy bootstrap removed.
- **M2: Core Modules Online** - Stage, audio, and physics modules update together without runtime errors; config toggles propagate.
- **M3: Visual Parity** - Mesh renderer, postFX, and presets replicate current showcase visuals within +/- 5 percent frame time variance.
- **M4: Diagnostics Complete** - Dashboard controls, perf HUD, and logging documented; profiling script produces baseline CSV or log.
- **M5: Release Candidate** - `npm run build`, `npm run typecheck`, and smoke tests succeed on CI; upgrade checklist signed off.

## 7. Testing Strategy
- **Static**: Enforce strict TypeScript config, ESLint, and Prettier; ban unchecked `any` casts on new modules.
- **Unit**: Module-level lifecycle tests (init, update, dispose) using lightweight harnesses.
- **Integration**: Headless render pipeline smoke runs verifying stage, physics, and renderer interplay.
- **Performance**: Record FPS and budget metrics via perf HUD logging during scripted scene runs.
- **Regression**: Hot-swap drills replacing renderer or physics modules mid-session to ensure context cleanup works.

## 8. Tooling & Workflow Updates
- Add npm scripts for `typecheck`, `lint`, `test:smoke`, and `profile:record` (future Playwright integration).
- Wire CI (GitHub Actions or Azure Pipelines) to run build, typecheck, and lint on every PR; attach perf log artifacts on nightly runs.
- Document the module template (factory signature, context usage, dispose contract) in `/docs` for contributors.
- Adopt conventional commits or similar to track feature readiness per milestone.

## 9. Risk Register & Mitigations
- **WebGPU availability**: Provide WebGL fallback or guard rails; detect capability before bootstrapping.
- **MLS-MPM performance**: Profile shader compilation and consider workerization if average frame cost exceeds 5 milliseconds.
- **Audio input variability**: Supply mocked audio sources for testing and fallback loops for demos.
- **Config drift**: Lock presets via schema versioning and add migration helpers when shape changes.
- **Team bandwidth**: Timebox each phase with clear exit criteria; avoid parallelizing beyond module boundaries.

## 10. Open Questions
- Do we need legacy scene compatibility layers for archived shows?
- Should the dashboard expose granular shader tuning or stay on curated toggles?
- What timeline exists for workerizing physics or audio, and do we reserve hooks now or later?
- Are there external stakeholders (show operators) requiring training sessions or documentation updates?

## 11. Implementation Checklist
- [ ] Legacy bootstrap removed and `main.ts` owns lifecycle.
- [ ] Config store persisted with presets documented.
- [ ] All modules implement the `create*Module` contract with typed surfaces.
- [ ] Dashboard plus perf HUD online with recorded baselines.
- [ ] Lint, typecheck, and smoke tests wired into CI.
- [ ] Release notes plus upgrade guide drafted for operators.

## 12. References
- `docs/refactor-master-plan.md` - canonical architecture and module contracts.
- `src/main.ts` - new bootstrap entry point (in progress).
- `src/postfx/postfx.ts`, `src/app.js` - legacy versus target implementations for cross-checking during migration.