# AuroraSV2 Upgrade Proposal

## Vision
AuroraSV2 should evolve into a modular, high-performance audiovisual playground that can showcase experimental physics-driven visuals, advanced rendering techniques, and deeply interactive sound reactivity. The upgrade aims to separate responsibilities into independently swappable modules, deliver a design system that makes the experience feel polished and immersive, and ensure the runtime can scale to heavier simulations without dropping frames.

## Strategic Pillars
1. **Modular Physics & Rendering Architecture.** Adopt a single-file module (SFM) pattern for physics kernels, renderers, and controllers so every subsystem can be reasoned about, hot-swapped, and tested in isolation.
2. **High-Fidelity Visuals.** Introduce cinematic lighting, customizable post-processing stacks, and dynamic material systems that respond to user input and audio events.
3. **Expressive Audio Reactivity.** Build a robust audio analysis pipeline with multi-band analysis, beat/onset detection, and event routing that any component can subscribe to.
4. **Performance & Tooling Excellence.** Optimize the main loop, leverage WebGPU-ready abstractions, and provide development tooling that keeps performance budgets visible.
5. **Creative Extensibility.** Offer preset management, procedural scene composition, and a documented API so artists can author new experiences without touching core internals.

## Feature Initiatives

### 1. Physics System Modernization
- **Modular physics kernels.** Repackage MLS-MPM into `physics/modules/*` directories, with each module exposing `createPhysics(options)` that returns lifecycle hooks plus typed buffer accessors.
- **Alternative solvers.** Add SPH (Smoothed Particle Hydrodynamics) and spring-mass cloth modules to complement MLS-MPM, sharing a common interface so renderers can switch physics backends.
- **Worker offloading.** Provide a web worker facade that can host any physics module. Serialize initialization data via transferable objects to keep main thread responsive.
- **Deterministic stepping.** Introduce a fixed-step integrator with interpolation to decouple simulation timestep from render framerate, improving stability.
- **Debug visualizers.** Build lightweight renderers (wireframe grids, constraint visualizers) that read from physics debug channels.

### 2. Rendering & Material Enhancements
- **Renderer registry.** Maintain a registry of render modules (instanced mesh, point sprite, volumetric raymarch) that can be stacked or toggled at runtime.
- **Node-based materials.** Implement a shared `materials.ts` factory using three.js NodeMaterial or TSL to author dynamic shaders with clear parameter sets.
- **Physically-based lighting.** Add HDR environment rotation controls, cascaded shadow maps, and area lights to elevate scene realism.
- **Procedural geometry layers.** Include background geometry generators (e.g., metaball fog, Voronoi planes) that can react to physics data.
- **Post-processing pipeline.** Expand the composer to support filmic tone mapping, chromatic aberration, motion blur, and LUT grading, each controllable through presets.

### 3. Audio & Interaction
- **Audio analysis graph.** Create an `audio/engine.ts` module that exposes FFT, wavelet, and RMS streams; implement beat and onset detectors with adjustable sensitivity.
- **Event bus integration.** Broadcast audio events on the global scheduler so physics/material modules can subscribe without tight coupling.
- **Visual parameter mapping.** Provide mapping utilities (`audio/mappings.ts`) to convert frequency bands or beat events into easing curves, color palettes, or particle emission bursts.
- **Input fusion.** Combine audio with pointer/keyboard sensors to drive hybrid effects (e.g., audio-driven camera shakes modulated by mouse drag).
- **Reactive UI feedback.** Update dashboards and HUD elements to pulse or animate based on audio intensity, reinforcing immersion.

### 4. Experience & UI Improvements
- **Responsive layout.** Redesign the HUD/dashboard with a card-based system, light/dark themes, and keyboard navigation to feel like a professional control surface.
- **Preset browser.** Add a modal or docked panel that previews presets with thumbnails and audio tags; allow saving/loading custom presets.
- **Onboarding tour.** Provide an optional guided overlay explaining controls, toggles, and performance metrics for first-time visitors.
- **Live coding hooks.** Expose a sandbox where users can tweak shader or physics parameters with immediate visual feedback, backed by validation.
- **Accessibility.** Include configurable contrast, reduce motion toggles, and descriptive text for major controls.

### 5. Performance & Infrastructure
- **Frame graph scheduling.** Implement a frame graph that orchestrates physics, rendering, and post-processing, enabling conditional execution (skip expensive passes when off-screen or idle).
- **GPU resource pooling.** Reuse render targets and buffers, with a global allocator to minimize churn during preset switches.
- **Profiling overlays.** Integrate WebGL/WebGPU timer queries plus CPU profiling, surfaced via dashboard charts and timeline.
- **Build tooling.** Enable TypeScript strict mode, ESLint, Prettier, and playwright smoke tests to guard against regressions. Add bundle analysis to monitor asset size.
- **Continuous delivery.** Configure GitHub Actions to run lint, typecheck, tests, and build; publish preview deployments for rapid feedback.

### 6. Content & Extensibility
- **Scene composition API.** Define a declarative scene format (JSON or YAML) that describes physics module choice, renderer stack, audio mappings, and preset parameters.
- **Asset pipeline.** Automate HDRI compression, texture mipmap generation, and audio normalization via scripts, ensuring consistent quality.
- **Plugin model.** Allow third parties to author physics or renderer plugins by exposing documented lifecycle interfaces and packaging guidelines.
- **Documentation hub.** Expand `/docs` with tutorials, API references, and example recipes for creating new experiences.

## Implementation Roadmap
1. **Foundations (Weeks 1-3)**
   - Establish TypeScript baseline, strict linting, and module manager skeleton.
   - Port current MLS-MPM and renderers into the new lifecycle contracts.
   - Build dashboard redesign with modular panels and performance readouts.

2. **Audio & Visual Expansion (Weeks 4-7)**
   - Implement audio engine, event bus integration, and sample visual mappings.
   - Introduce enhanced materials, lighting upgrades, and post-processing suite.
   - Add preset browser and onboarding flows.

3. **Advanced Physics & Extensibility (Weeks 8-11)**
   - Ship additional physics modules (SPH, cloth) with worker support.
   - Implement frame graph scheduler, resource pooling, and profiling overlays.
   - Deliver scene composition API and plugin documentation.

4. **Polish & Release (Weeks 12-14)**
   - Conduct load testing, accessibility review, and cross-device QA.
   - Finalize documentation, tutorials, and promotional demo scenes.
   - Launch with automated deployment and monitoring dashboards.

## Success Metrics
- Maintain ≥60 FPS on target hardware with 2× current particle count.
- Achieve sub-100ms audio-to-visual response latency.
- Provide at least three interchangeable physics modules and render stacks.
- Deliver 10+ curated presets demonstrating sound-reactive scenarios.
- Reduce shader/physics hot-swap time to <500ms through modular loading.

## Risks & Mitigations
- **Complexity creep.** Mitigate by enforcing module contracts and automated tests for each subsystem.
- **Audio analysis accuracy.** Validate detectors with diverse music genres and offer manual calibration controls.
- **Worker compatibility.** Provide graceful fallback for browsers lacking required features and document limitations.
- **Design divergence.** Maintain a Figma or design token source of truth; automate token sync into the codebase.

## Next Steps
- Run stakeholder review of the proposal and prioritize feature scope.
- Begin TypeScript migration sprint and scaffold module manager.
- Prototype audio engine with sample mappings to prove interaction model.
- Plan user testing sessions with artists to refine UI/UX priorities.

