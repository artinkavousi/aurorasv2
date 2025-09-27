# AuroraSV2 Sound Reactivity Redesign Proposal

## 1. Current State & Gaps
- **No dedicated audio pipeline.** The runtime bootstraps MLS-MPM simulation, renderers, and UI from `app.js`, but it never instantiates WebAudio nodes or propagates audio-driven uniforms, so visuals cannot respond to sound.【F:src/app.js†L1-L171】
- **Configuration lacks audio controls.** `conf.js` exposes particle, simulation, and bloom controls via Tweakpane, yet there are no bindings for audio sensitivity, source selection, or feedback metrics, limiting user interaction with sound-driven behavior.【F:src/conf.js†L1-L117】
- **Simulation uniforms ignore sonic cues.** The MLS-MPM kernels animate forces, noise, and coloration purely from simulation state, without channels for beat pulses or band-specific energy, preventing rhythm-synchronized motion or palette shifts.【F:src/mls-mpm/mlsMpmSimulator.js†L240-L360】
- **Visualization feedback is static.** Particle color gradients rely on density and velocity only, missing opportunities for hue shifts, bloom surges, or spatial choreography aligned with musical dynamics.【F:src/mls-mpm/mlsMpmSimulator.js†L334-L379】

## 2. Experience Goals
- Deliver a **dance-like, kinematic particle performance** that breathes with music—bass swells sculpt volume, mids weave lateral grooves, treble sparks aerial glitter.
- Provide **intuitive, tactile controls** for selecting inputs (microphone, local file), calibrating sensitivity, sculpting band gains, and tuning groove directionality.
- Visualize **live audio analytics** (levels, beat envelope, spectral centroid) directly in the dashboard so performers can read the instrument.
- Support **creative adaptability**: presets for ambient flow vs. percussive burst, toggles for gravity modulation, swirl, and bloom accents.
- Ensure the system is **resilient and optional**—runs silently when disabled, tolerates missing media devices, and exposes clear lifecycle hooks.

## 3. Target Architecture
```
src/
  audio/
    soundReactivity.js        # WebAudio engine + feature extraction
    soundReactivityPanel.js   # Panel wiring (future split once dashboard refactors)
```
- **SoundReactivity** orchestrates AudioContext, analyser graph, beat detector, and feature smoothing. It outputs a profile `{ level, beat, bands, flow, color }` consumed by simulation/render modules.
- **SoundReactivityPanel** (initially co-located within `conf.attachSoundReactivity`) builds advanced Tweakpane controls, file selection buttons, and live monitors. When broader dashboard refactor lands, this migrates into a dedicated module.
- **Uniform bridge.** `mlsMpmSimulator.setAudioProfile()` maps profile data into new uniforms (`audioLevel`, `audioBands`, `audioBeat`, `audioFlow`, `audioColorPulse`) that animate kernels and shading.
- **Config integration.** New `conf` fields capture calibration knobs (smoothing, sensitivity, dynamics, band gains, flow/swirl/color weights, beat decay/hold/release) and expose real-time metrics.

## 4. Visualization Strategy
- **Bass gravity sculpting.** Low-frequency energy injects upward/downward flows and radial breathing, modulating particle confinement and bloom intensity during drops.
- **Mid groove vectors.** Mid-band levels steer horizontal flow using a phyllotaxis-inspired swirl, introducing kinematic ribbons that orbit the core.
- **Treble sparkles.** High-band pulses trigger quick color temperature shifts and micro velocity jitter, generating glittering halos synced to hi-hats.
- **Beat envelopes.** A resilient beat detector triggers shockwave impulses propagating from the simulation centroid, modulating both motion (velocity pushes) and shading (value bursts).
- **Adaptive palettes.** Audio color pulse influences HSV conversion to amplify chroma and brightness, yielding vibrant splashes during crescendos while staying calm in silence.

## 5. Implementation Roadmap
1. **Lay foundation** – add `src/audio/soundReactivity.js` with lifecycle (`init`, `enable/disable`, `setSource`, `openFileDialog`, `update`). Implement analyser graph, smoothing, beat detection, and flow vector synthesis. Export profile each frame.
2. **Panel integration** – extend `conf.js` with audio configuration fields, metrics storage, `attachSoundReactivity()` hook, and Tweakpane folder (source selection, calibration sliders, band gains, flow/color controls, metrics monitors, action buttons).
3. **Simulation bridge** – introduce audio uniforms and `setAudioProfile()` in `mlsMpmSimulator`. Inject flow/beat impulses into `g2p` velocity integration and feed audio-driven HSV adjustments for color pulses.
4. **App wiring** – instantiate `SoundReactivity` in `app.js`, call `conf.attachSoundReactivity(soundReactivity)` after initialization, and feed the returned profile into the simulator each frame.
5. **Polish & presets** – add default parameter presets (e.g., “Chill Flow”, “Percussive Punch”), optional audio output mute, and refine kernels for worker safety (future iteration alongside broader refactor).

## 6. Acceptance Criteria
- App loads with sound-reactivity disabled by default; enabling microphone/file streams updates dashboard metrics without console errors.
- Particle motion responds to music: bass drives breathing, beat pulses propagate visible surges, and treble adjusts sparkles.
- Dashboard monitors reflect real-time band levels and beat envelope within ±1 frame of analyser data.
- Controls (source switch, calibration sliders, reset button, file picker) react immediately and persist settings across toggles.
- Feature gracefully deactivates (zeroed uniforms, stopped streams) when disabled or on error.
