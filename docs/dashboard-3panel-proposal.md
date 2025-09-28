## AuroraSV2 Dashboard & Control Panel – Three-Panel UX Proposal

### Goals
- Deliver a cohesive, beautiful glassmorphism dashboard with three focused panels.
- Provide intuitive, creative controls for visuals, audio reactivity, physics, and settings.
- Preserve existing configuration/store patterns and module contracts.
- Ensure real-time feedback with lightweight visualizations and responsive UX.

### Information Architecture
- Panel 1 – Visuals & Scene
  - Render: mode selector (mesh/points/hybrid), size, bloom mask.
  - PostFX: bloom toggle + threshold/strength/radius.
  - Environment: tone mapping exposure, environment intensity, HDRI selector (future), background/environment rotation (future).
  - Camera: FOV, target/position nudge (future), orbit control limits (future).
  - Lights: basic rig intensity/sweep (future; currently animated rig only).
- Panel 2 – Audio Reactivity
  - Enable + source (microphone/file/loop).
  - Dynamics: sensitivity, smoothing, dynamics curve.
  - Bands: bass/mid/treble gains.
  - Motion: flow, swirl, displacement.
  - Color: color boost.
  - Beat: hold, decay, release.
  - Visualization: live compact bars for level, beat, bass, mid, treble.
- Panel 3 – Physics & Settings
  - Physics runtime: run, speed, iterations, stiffness, viscosity, particle count (read-only or gated, see notes).
  - Diagnostics: perf HUD, debug logging.
  - Presets (future): save/load, quick presets.

### Visual Design (Glassmorphism)
- Panels: frosted translucent cards, blurred backdrop, soft borders, rounded corners.
- Elevation: subtle shadows, layered depth for separate panels.
- Controls: compact grid layout, 8–12px gaps, consistent label weights, precise sliders.
- Motion: micro-interactions on hover/focus; expandable sections with smooth transitions.
- Accessibility: high-contrast text, focus outlines, keyboard operability for all inputs.

### Component Structure (No Framework)
- Dashboard module (`src/io/dashboard.ts`) creates:
  - Root container with CSS-in-JS styles (consistent with existing style approach).
  - Three panel cards: `Visuals`, `Audio`, `Physics & Settings`.
  - Shared control builders: toggle, select, slider, metrics rows, accordion helpers.
  - Audio mini-visualizer (canvas) updated in `update()` using `context.services.audio.metrics`.

### Data Flow & Config Mapping
- All UI patches configuration via `context.config.patch(DeepPartial<AppConfig>)`.
- Modules already consume config:
  - Stage: camera/controls/pointer/environment.
  - PostFX: bloom and parameters.
  - Audio: full reactive parameters; sync each update.
  - Physics: reads `physics` config (runtime mutability varies; keep conservative).
- Live sync: dashboard subscribes to config store to reflect external changes.

### Interaction Details
- Sliders: immediate patch on input; values rendered with small numeric labels.
- Selects/toggles: immediate patch.
- Accordion sections per panel for advanced options to reduce clutter.
- Panels are stacked (v1). Future: draggable/resizable windows with docking.

### Performance Considerations
- Avoid heavy DOM; reuse elements; throttle expensive updates if needed.
- Audio visualization draws simple bars for five metrics.
- Inline styles reduce external dependencies; reuse existing dashboard style language.

### Milestones
1) Plan document (this).
2) Implement three-panel layout and glassmorphism base.
3) Wire Visuals controls (render + postfx + env + camera FOV).
4) Wire Audio controls + mini-visualizer.
5) Wire Physics & Settings + diagnostics.
6) QA pass and UX polish; iterate micro-interactions.

### Risks & Notes
- Physics live mutability: some parameters may require simulator reinit. We will patch config conservatively and avoid destructive runtime changes until verified.
- HDRI and rotation pickers are future scope to avoid asset bloat.


