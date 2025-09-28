# Sound Reactivity Component & Panel Redesign Proposal

1. **Introduction & Goals**

The current AuroraSV2 experience showcases advanced MLS-MPM fluid simulations and cinematic lighting, yet visuals remain disconnected from incoming audio. No dedicated sound-reactive pipeline, analysis layer, or control panel exists, so creators cannot synchronize motion, color, or post-processing to musical energy. This redesign aims to deliver a holistic audio-reactive subsystem that fuses deep sonic analysis with expressive, groove-rich visual behaviors. Goals include:

- Introduce a modular audio ingestion and analysis stack with low-latency responsiveness.
- Craft a performance-ready sound reactivity panel that balances power and clarity.
- Ship a collection of flagship visualization modes featuring kinetic, spatial, and emotionally resonant motion tied to audio features.
- Elevate creative workflows through presets, routing, and live feedback overlays.

2. **Project Scope**

- Audio inputs: microphone, local file upload, and future-ready stream hooks.
- Feature extraction: multi-band FFT, spectral flux, harmonic onset, beat grids, envelope followers, and timbre descriptors.
- Sound Reactivity Panel: preset gallery, audio source management, feature lab, modulation matrix, macros, and HUD.
- Visualization modes: Resonant Lattice, Vorticity Bloom, and Sonoluminal Ribbons, each with audio-reactive parameter handles.
- Performance safeguards: adaptive quality tiers, latency calibration, and graceful degradation to amplitude-only mode.
- Documentation, automated tests, and onboarding presets for immediate use.

3. **Design Overview**

- **Visual Enhancements**
  - *Resonant Lattice*: Elastic particle lattice driven by tonal centroid shifts and bass energy, blending inverse-kinematics stretching with chromatic dispersion shaders.
  - *Vorticity Bloom*: Fluidic plumes whose curl noise intensity responds to percussive onsets while spectral centroid modulates color halos.
  - *Sonoluminal Ribbons*: Spline-based light trails with torsion, shimmer, and bloom pulses synced to mid/high frequency content and groove markers.
- **Interaction Model**
  - Overview Deck presenting preset previews and quick stats.
  - Audio Source bay with gain staging, limiter, latency calibration, and monitoring meters.
  - Feature Lab featuring waveform, spectrum, beat tracker, and smoothing controls.
  - Routing Matrix enabling drag-to-map audio features to visual targets with bezier response curves and modulation depth indicators.
  - Macro surface (“Hype”, “Flow”, “Chill”) that scales sets of mappings for live performance agility.
  - Performance HUD overlays pinning essential meters and macros for stage visibility.
- **Motion Language**
  - Spring-mass easing, beat-aligned impulses, and temporal supersampling for smooth yet energetic motion.
  - Spatialized camera orbits and depth parallax reinforcing 3D presence.
  - Expressive color grading shifts tied to harmonic or rhythmic analysis.

4. **Technical Architecture**

- **Stack**
  - Rendering: Three.js with WebGPU primary path and WebGL fallback.
  - Audio: Web Audio API, AudioWorklet for DSP, MediaDevices for input selection.
  - UI: Tweakpane core with custom plugins (node graph, sparklines, preview canvas) and lightweight reactive store.
  - Data Flow: RxJS-style observable event bus connecting audio features to visual modules.
- **Audio Analysis Pipeline**
  - Capture node → AnalyserWorklet (FFT, spectral flux) → BeatWorklet (phase vocoder + tempo tracking) → Feature Smoother.
  - Configurable FFT size (2048–8192) with adaptive downsampling by device capabilities.
  - Envelope followers per band using exponential moving averages plus attack/decay envelopes.
  - Timbre metrics (centroid, rolloff, flatness) computed per frame.
  - Latency calibration storing offsets by source type.
- **Feature Routing & Presets**
  - `AudioFeatureBus` exposes normalized values with metadata.
  - `ModulationGraph` nodes: Source → Filter (range, smoothing, curve) → Target (visual parameter handle with setValue / setRamp / triggerImpulse).
  - JSON schemas for presets, including versioning and dependency declarations.
  - Snapshot and undo/redo support stored via immer-based state history.
- **Visualization Modules**
  - `SoundReactiveModule` orchestrates audio-reactive shaders and particle systems.
  - GPU-driven particle buffers with compute-like updates via storage buffers.
  - Ribbon trails built from instanced Catmull-Rom splines with multi-pass bloom.
  - Mini-preview OffscreenCanvas rendering for panel hero tiles.
- **Panel Architecture**
  - Tweakpane root hosts modular tabs; custom view for routing matrix using HTML canvas/SVG.
  - Shared `SoundReactivityStore` tracks sources, features, mappings, macros, and presets.
  - HUD overlay rendered in-scene using orthographic camera with dynamic text meshes or SDF-based labels.
- **Performance & Reliability**
  - Worklet graph isolates DSP on audio thread; UI heavy lifting uses Web Workers for data viz (beat grid, spectrogram history).
  - Graceful fallback to ScriptProcessor with limited metrics if Worklet unsupported.
  - Quality tier system toggles particle counts, post-processing, and shader branches based on GPU budget.

5. **Implementation Plan**

| Phase | Duration | Milestones | Deliverables |
|-------|----------|------------|--------------|
| Discovery & UX | 1.5 weeks | Audit current controls, compile motion references, wireframe panel | UX spec, wireframes, motion boards |
| Audio Core | 2 weeks | Implement audio engine, feature extraction, latency tools | AudioWorklet, feature APIs, unit tests |
| Routing & Panel | 2.5 weeks | Build modulation matrix, presets, HUD overlays | Panel MVP, presets, documentation |
| Visualization Modules | 3 weeks | Develop Resonant Lattice, Vorticity Bloom, Sonoluminal Ribbons | Shader modules, parameter handles, preview assets |
| Integration & Polish | 1.5 weeks | Optimize performance, calibrate macros, finalize UX copy | Performance tuning, curated presets, tutorial |
| QA & Launch | 1 week | Automated tests, cross-device validation, demo capture | Test reports, release notes, showcase video |

Total: ~11 weeks with overlapping QA buffer.

**Resource Needs**: 1 Creative Technologist (shader/motion), 1 Frontend Audio Engineer, 0.5 QA/UX support, optional sound designer for preset tuning.

6. **Acceptance Criteria**

- Audio engine supports mic and file sources with <40 ms round-trip latency under default settings.
- Users can map any analyzed feature to ≥12 visual parameters, with presets import/export functioning.
- Visualization modes sustain ≥60 FPS on RTX 2060-class hardware under standard quality tier; responsive fallback for lower tiers.
- Panel workflows (preset select, source switch, macro tweak) require ≤3 interactions each and receive positive heuristic review.
- HUD meters and routing indicators update within one frame of audio feature changes.
- >80% unit test coverage for audio analysis and routing logic; integration tests verifying preset serialization and macro scaling.
- Comprehensive documentation: setup, calibration, extension APIs, troubleshooting.
- Demo video showcasing all three visualization modes reacting to varied genres.

7. **Risk Assessment & Mitigation**

| Risk | Impact | Mitigation |
|------|--------|------------|
| AudioWorklet browser support gaps | Medium | Feature-detect and fallback to ScriptProcessor + simplified metrics; document limitations. |
| GPU performance regressions | High | Implement adaptive quality tiers, runtime telemetry, and user override controls. |
| Latency drift between audio and visuals | High | Provide calibration wizard, persistent offsets, and real-time drift monitoring. |
| Complexity overwhelming new users | Medium | Deliver curated presets, macro layers, tooltips, and a simplified quick-start mode. |
| Shader development time overruns | Medium | Reuse existing noise libraries, parallelize shader R&D, and stage deliverables per visualization. |
| Audio source permission friction | Low | Add clear prompts, fallback visual-only demo, and privacy notice. |

8. **Appendix**

- **References**
  - AuroraSV2 upgrade roadmap and simulation architecture docs.
  - Tweakpane configuration patterns from existing modules.
- **Assumptions**
  - WebGPU is default; WebGL fallback acceptable for legacy browsers.
  - Performance baseline: desktop RTX 2060 / recent MacBook Pro.
  - MLS-MPM simulation remains central; audio reactivity augments rather than replaces it.
- **Outstanding Questions**
  - Primary live audio sources (DJ line-in vs ambient mic) and expected switching cadence?
  - Preset sharing expectations (local JSON vs cloud sync)?
  - Launch requirement for external control surfaces (MIDI/OSC) or defer to later phase?
  - Branding guidelines for panel theming and HUD styling?
  - Accessibility needs (contrast, color blindness, keyboard navigation)?

