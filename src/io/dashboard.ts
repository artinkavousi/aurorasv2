// @ts-nocheck
import type { ModuleInstance, TickInfo, AppContext, DashboardService } from "../app/appContext";
import type { AppConfig } from "../app/appContext";
import { Pane } from "tweakpane";
// @ts-ignore - plugin types may not be available in this project
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
// @ts-ignore - optional plugin exports as namespace, not default
import * as InfoDumpPlugin from "tweakpane-plugin-infodump";
import { createPanel } from "./ui/panels";

interface SliderControl {
  input: HTMLInputElement;
  setValue: (value: number) => void;
}

interface DashboardState {
  container: HTMLDivElement | null;
  // Tweakpane panes and wrappers
  visualsWrapper: HTMLDivElement | null;
  visualsHeader: HTMLDivElement | null;
  visualsContent: HTMLDivElement | null;
  visualsPane: any | null;
  audioWrapper: HTMLDivElement | null;
  audioHeader: HTMLDivElement | null;
  audioContent: HTMLDivElement | null;
  audioPane: any | null;
  physicsWrapper: HTMLDivElement | null;
  physicsHeader: HTMLDivElement | null;
  physicsContent: HTMLDivElement | null;
  physicsPane: any | null;
  // Audio viz
  audioViz: HTMLCanvasElement | null;
  audioVizCtx: CanvasRenderingContext2D | null;
  // Metrics labels
  fpsLabel: HTMLSpanElement | null;
  frameLabel: HTMLSpanElement | null;
  audioLevelLabel: HTMLSpanElement | null;
  beatLabel: HTMLSpanElement | null;
  unsubscribeConfig: (() => void) | null;
  fpsAvg: number;
  focusX: SliderControl | null;
  focusY: SliderControl | null;
  focusRadius: SliderControl | null;
  focusFeather: SliderControl | null;
  blurStrength: SliderControl | null;
  chromaStrength: SliderControl | null;
  bloomStrength: SliderControl | null;
  lensIntensity: SliderControl | null;
  temporalBlend: SliderControl | null;
  temporalFeedback: SliderControl | null;
}

const createContainer = () => {
  const container = document.createElement("div");
  container.className = "aurora-dashboard";
  container.style.position = "absolute";
  container.style.top = "16px";
  container.style.right = "16px";
  container.style.minWidth = "260px";
  container.style.padding = "0";
  container.style.background = "transparent";
  container.style.backdropFilter = "blur(0px)";
  container.style.border = "none";
  container.style.borderRadius = "0";
  container.style.fontFamily = "Inter, system-ui, sans-serif";
  container.style.fontSize = "12px";
  container.style.color = "#f0f3f8";
  container.style.zIndex = "20";
  container.style.pointerEvents = "auto";
  container.style.userSelect = "none";
  container.style.lineHeight = "1.4";
  container.style.display = "grid";
  container.style.rowGap = "12px";
  document.body.appendChild(container);
  return container;
};

const createSectionTitle = (text: string) => {
  const title = document.createElement("div");
  title.textContent = text.toUpperCase();
  title.style.fontSize = "10px";
  title.style.letterSpacing = "0.12em";
  title.style.fontWeight = "600";
  title.style.opacity = "0.7";
  return title;
};

const createToggle = (label: string) => {
  const wrapper = document.createElement("label");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "space-between";
  wrapper.style.gap = "12px";

  const text = document.createElement("span");
  text.textContent = label;
  text.style.fontWeight = "500";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.style.width = "16px";
  input.style.height = "16px";
  input.style.flexShrink = "0";

  wrapper.appendChild(text);
  wrapper.appendChild(input);
  return { wrapper, input };
};

// Note: Legacy DOM slider helpers from a prior UI variant were removed in favor of Tweakpane bindings.

const createSelect = (label: string, options: Array<{ value: string; text: string }>) => {
  const wrapper = document.createElement("label");
  wrapper.style.display = "grid";
  wrapper.style.rowGap = "4px";

  const text = document.createElement("span");
  text.textContent = label;
  text.style.fontWeight = "500";

  const select = document.createElement("select");
  select.style.padding = "4px 8px";
  select.style.borderRadius = "6px";
  select.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  select.style.background = "rgba(10, 10, 16, 0.85)";
  select.style.color = "inherit";

  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.text;
    select.appendChild(opt);
  });

  wrapper.appendChild(text);
  wrapper.appendChild(select);
  return { wrapper, select };
};

const createMetricsRow = (label: string) => {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "space-between";

  const name = document.createElement("span");
  name.textContent = label;
  name.style.opacity = "0.7";
  name.style.fontWeight = "500";

  const value = document.createElement("span");
  value.textContent = "0";
  value.style.fontVariantNumeric = "tabular-nums";
  value.style.fontWeight = "600";

  wrapper.appendChild(name);
  wrapper.appendChild(value);
  return { wrapper, value };
};

// using shared panel utility now

const applyConfigToControls = (state: DashboardState, config: AppConfig) => {
  // Tweakpane bindings reflect model values; keep subscription for future sync if needed
};

export const createDashboardModule = (): ModuleInstance => {
  const id = "io.dashboard";
  const state: DashboardState = {
    container: null,
    visualsWrapper: null,
    visualsHeader: null,
    visualsContent: null,
    visualsPane: null,
    audioWrapper: null,
    audioHeader: null,
    audioContent: null,
    audioPane: null,
    physicsWrapper: null,
    physicsHeader: null,
    physicsContent: null,
    physicsPane: null,
    audioViz: null,
    audioVizCtx: null,
    // metrics
    fpsLabel: null,
    frameLabel: null,
    audioLevelLabel: null,
    beatLabel: null,
    unsubscribeConfig: null,
    fpsAvg: 0,
    focusX: null,
    focusY: null,
    focusRadius: null,
    focusFeather: null,
    blurStrength: null,
    chromaStrength: null,
    bloomStrength: null,
    lensIntensity: null,
    temporalBlend: null,
    temporalFeedback: null,
  };

  const updateMetrics = (tick: TickInfo) => {
    const fps = tick.delta > 0 ? 1 / tick.delta : 0;
    state.fpsAvg = state.fpsAvg === 0 ? fps : state.fpsAvg + (fps - state.fpsAvg) * 0.12;
    const frameTimeMs = tick.delta * 1000;
    if (state.fpsLabel) {
      state.fpsLabel.textContent = `${state.fpsAvg.toFixed(1)} fps`;
    }
    if (state.frameLabel) {
      state.frameLabel.textContent = `${frameTimeMs.toFixed(2)} ms`;
    }

    const audioService = tick.context.services.audio as
      | { engine: { metrics: { level: number; beat: number } } }
      | undefined;
    if (audioService?.engine && state.audioLevelLabel && state.beatLabel) {
      const { level, beat } = audioService.engine.metrics;
      state.audioLevelLabel.textContent = level.toFixed(2);
      state.beatLabel.textContent = beat.toFixed(2);
    }
  };

  const drawAudioViz = (tick: TickInfo) => {
    if (!state.audioViz || !state.audioVizCtx) return;
    const ctx = state.audioVizCtx;
    const { width, height } = state.audioViz;
    ctx.clearRect(0, 0, width, height);
    const audio = tick.context.services.audio;
    if (!audio) return;
    const metrics = audio.metrics;
    const bars = [
      { v: metrics.level, c: "#9ad8ff" },
      { v: metrics.beat, c: "#ffd59a" },
      { v: metrics.bass, c: "#ff9ab3" },
      { v: metrics.mid, c: "#b39aff" },
      { v: metrics.treble, c: "#9affc7" },
    ];
    const gap = 6;
    const bw = (width - gap * (bars.length - 1)) / bars.length;
    bars.forEach((b, i) => {
      const h = Math.max(2, b.v * height);
      const x = i * (bw + gap);
      const y = height - h;
      ctx.fillStyle = b.c;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, y, bw, h);
      ctx.globalAlpha = 1;
    });
  };

  return {
    id,
    label: "Dashboard",
    priority: -80,
    autoStart: true,
    async init(context: AppContext) {
      const container = createContainer();
      state.container = container;

      const config = context.config.value;
      // Register plugins
      try {
        // @ts-ignore
        (Pane as unknown as { registerPlugin?: (p: unknown) => void }).registerPlugin?.(EssentialsPlugin);
        // @ts-ignore
        (Pane as unknown as { registerPlugin?: (p: unknown) => void }).registerPlugin?.(InfoDumpPlugin);
      } catch {}

      // Visuals Pane
      const visuals = createPanel({ id: "panel.visuals", title: "Visuals & Scene", position: { top: 16, right: 16 } });
      state.visualsWrapper = visuals.wrapper;
      state.visualsHeader = visuals.header;
      state.visualsContent = visuals.content;
      const visualsPane = new Pane({ container: visuals.body as HTMLElement });
      state.visualsPane = visualsPane;
      const visualsModel = {
        // Render
        renderMode: config.render.mode,
        renderSize: config.render.size,
        lodMeshRatio: config.render.lodMeshRatio,
        pointSizeMin: config.render.pointSizeMin,
        pointSizeMax: config.render.pointSizeMax,
        // PostFX
        bloom: config.postfx.bloom,
        bloomThreshold: config.postfx.bloomThreshold,
        bloomStrength: config.postfx.bloomStrength,
        bloomRadius: config.postfx.bloomRadius,
        blurStrength: config.postfx.blurStrength,
        focusCenterX: config.postfx.focusCenter[0],
        focusCenterY: config.postfx.focusCenter[1],
        focusInnerRadius: config.postfx.focusInnerRadius,
        focusOuterRadius: config.postfx.focusOuterRadius,
        focusBias: config.postfx.focusBias ?? 1,
        chromaStrength: config.postfx.chromaticAberrationStrength,
        chromaScale: config.postfx.chromaticAberrationScale,
        lensStreaks: config.postfx.lensStreaks,
        lensIntensity: config.postfx.lensStreakIntensity,
        lensThreshold: config.postfx.lensStreakThreshold,
        lensStretch: config.postfx.lensStreakStretch,
        temporalEnabled: config.postfx.temporalEnabled,
        temporalFeedback: config.postfx.temporalFeedback,
        temporalBlend: config.postfx.temporalBlend,
        // PostFX Exposure
        toneExposure: config.postfx.exposure,
        envIntensity: config.stage.environmentIntensity,
        cameraFov: config.stage.camera.fov,
      } as const as any;
      const fRender = visualsPane.addFolder({ title: "Render" });
      const bRender = fRender.addBinding(visualsModel, "renderMode", { options: { Mesh: "mesh", Points: "points", Hybrid: "hybrid" } });
      bRender.on("change", (ev: any) => context.config.patch({ render: { mode: ev.value as AppConfig["render"]["mode"] } }));
      const bSize = fRender.addBinding(visualsModel, "renderSize", { min: 0.2, max: 2.5, step: 0.01, label: "Size" });
      bSize.on("change", (ev: any) => context.config.patch({ render: { size: Number(ev.value) } }));
      const bLod = fRender.addBinding(visualsModel, "lodMeshRatio", { min: 0.05, max: 1, step: 0.01, label: "LOD Ratio" });
      bLod.on("change", (ev: any) => context.config.patch({ render: { lodMeshRatio: Number(ev.value) } }));
      const fPoint = visualsPane.addFolder({ title: "Points" });
      const bPmin = fPoint.addBinding(visualsModel, "pointSizeMin", { min: 0.05, max: 3, step: 0.01, label: "Min Size" });
      bPmin.on("change", (ev: any) => context.config.patch({ render: { pointSizeMin: Number(ev.value) } }));
      const bPmax = fPoint.addBinding(visualsModel, "pointSizeMax", { min: 0.05, max: 3, step: 0.01, label: "Max Size" });
      bPmax.on("change", (ev: any) => context.config.patch({ render: { pointSizeMax: Number(ev.value) } }));
      const fPost = visualsPane.addFolder({ title: "PostFX" });
      const bPostOn = fPost.addBinding({ enabled: config.postfx.enabled }, "enabled", { label: "Enable" });
      bPostOn.on("change", (ev: any) => context.config.patch({ postfx: { enabled: !!ev.value } }));
      
      // Quality Presets
      visualsModel.qualityPreset = config.postfx.qualityPreset ?? "high";
      const bPreset = fPost.addBinding(visualsModel, "qualityPreset", { 
        options: { Low: "low", Medium: "medium", High: "high", Ultra: "ultra", Custom: "custom" },
        label: "Quality"
      });
      bPreset.on("change", (ev: any) => {
        const preset = ev.value as string;
        const presets = {
          low: { blurStrength: 1.5, bloomRadius: 0.4, lensStreaks: false, temporalEnabled: false },
          medium: { blurStrength: 2.0, bloomRadius: 0.5, lensStreaks: true, temporalEnabled: true, temporalFeedback: 0.75 },
          high: { blurStrength: 2.5, bloomRadius: 0.6, lensStreaks: true, temporalEnabled: true, temporalFeedback: 0.85 },
          ultra: { blurStrength: 4.0, bloomRadius: 0.8, lensStreaks: true, temporalEnabled: true, temporalFeedback: 0.9 },
        };
        if (preset !== "custom" && presets[preset as keyof typeof presets]) {
          context.config.patch({ postfx: { qualityPreset: preset, ...presets[preset as keyof typeof presets] } as any });
        }
      });
      
      const bBloom = fPost.addBinding(visualsModel, "bloom", { label: "Bloom" });
      bBloom.on("change", (ev: any) => context.config.patch({ postfx: { bloom: !!ev.value } }));
      const bBt = fPost.addBinding(visualsModel, "bloomThreshold", { min: 0, max: 1, step: 0.001 });
      bBt.on("change", (ev: any) => context.config.patch({ postfx: { bloomThreshold: Number(ev.value) } }));
      const bBs = fPost.addBinding(visualsModel, "bloomStrength", { min: 0, max: 2, step: 0.01 });
      bBs.on("change", (ev: any) => context.config.patch({ postfx: { bloomStrength: Number(ev.value) } }));
      const bBr = fPost.addBinding(visualsModel, "bloomRadius", { min: 0, max: 2, step: 0.01 });
      bBr.on("change", (ev: any) => context.config.patch({ postfx: { bloomRadius: Number(ev.value) } }));
      const fFocus = fPost.addFolder({ title: "Focus / DOF Blur" });
      const bBlur = fFocus.addBinding(visualsModel, "blurStrength", { min: 0, max: 10, step: 0.1, label: "Blur Amount" });
      bBlur.on("change", (ev: any) => context.config.patch({ postfx: { blurStrength: Number(ev.value) } }));
      // Note: Iterations removed - new efficient single-pass blur!
      const bFx = fFocus.addBinding(visualsModel, "focusCenterX", { min: 0, max: 1, step: 0.001, label: "Center X" });
      bFx.on("change", (ev: any) => context.config.patch({ postfx: { focusCenter: [Number(ev.value), context.config.value.postfx.focusCenter[1]] } }));
      const bFy = fFocus.addBinding(visualsModel, "focusCenterY", { min: 0, max: 1, step: 0.001, label: "Center Y" });
      bFy.on("change", (ev: any) => context.config.patch({ postfx: { focusCenter: [context.config.value.postfx.focusCenter[0], Number(ev.value)] } }));
      const bFir = fFocus.addBinding(visualsModel, "focusInnerRadius", { min: 0, max: 1, step: 0.001, label: "Inner" });
      bFir.on("change", (ev: any) => context.config.patch({ postfx: { focusInnerRadius: Number(ev.value) } }));
      const bFor = fFocus.addBinding(visualsModel, "focusOuterRadius", { min: 0, max: 1.5, step: 0.001, label: "Outer" });
      bFor.on("change", (ev: any) => context.config.patch({ postfx: { focusOuterRadius: Number(ev.value) } }));
      const bFbias = fFocus.addBinding(visualsModel, "focusBias", { min: 0.25, max: 4, step: 0.01, label: "Bias" });
      bFbias.on("change", (ev: any) => context.config.patch({ postfx: { focusBias: Number(ev.value) } }));

      const fChroma = fPost.addFolder({ title: "Chromatic Aberration" });
      const bCs = fChroma.addBinding(visualsModel, "chromaStrength", { min: 0, max: 2.5, step: 0.01, label: "Strength" });
      bCs.on("change", (ev: any) => context.config.patch({ postfx: { chromaticAberrationStrength: Number(ev.value) } }));
      const bCscale = fChroma.addBinding(visualsModel, "chromaScale", { min: 0.5, max: 2, step: 0.01, label: "Scale" });
      bCscale.on("change", (ev: any) => context.config.patch({ postfx: { chromaticAberrationScale: Number(ev.value) } }));

      const fLens = fPost.addFolder({ title: "Lens Streaks" });
      const bLensOn = fLens.addBinding(visualsModel, "lensStreaks", { label: "Enable" });
      bLensOn.on("change", (ev: any) => context.config.patch({ postfx: { lensStreaks: !!ev.value } }));
      const bLi = fLens.addBinding(visualsModel, "lensIntensity", { min: 0, max: 2, step: 0.01, label: "Intensity" });
      bLi.on("change", (ev: any) => context.config.patch({ postfx: { lensStreakIntensity: Number(ev.value) } }));
      const bLt = fLens.addBinding(visualsModel, "lensThreshold", { min: 0, max: 1, step: 0.001, label: "Threshold" });
      bLt.on("change", (ev: any) => context.config.patch({ postfx: { lensStreakThreshold: Number(ev.value) } }));
      const bLs = fLens.addBinding(visualsModel, "lensStretch", { min: 0.5, max: 4, step: 0.01, label: "Stretch" });
      bLs.on("change", (ev: any) => context.config.patch({ postfx: { lensStreakStretch: Number(ev.value) } }));

      const fTemporal = fPost.addFolder({ title: "Temporal" });
      const bTempOn = fTemporal.addBinding(visualsModel, "temporalEnabled", { label: "Enable" });
      bTempOn.on("change", (ev: any) => context.config.patch({ postfx: { temporalEnabled: !!ev.value } }));
      const bTfb = fTemporal.addBinding(visualsModel, "temporalFeedback", { min: 0, max: 0.98, step: 0.001, label: "Feedback" });
      bTfb.on("change", (ev: any) => context.config.patch({ postfx: { temporalFeedback: Number(ev.value) } }));
      const bTbl = fTemporal.addBinding(visualsModel, "temporalBlend", { min: 0, max: 1, step: 0.001, label: "Blend" });
      bTbl.on("change", (ev: any) => context.config.patch({ postfx: { temporalBlend: Number(ev.value) } }));
      
      // Visual Enhancements
      const fVignette = fPost.addFolder({ title: "Vignette" });
      visualsModel.vignetteStrength = config.postfx.vignetteStrength ?? 0.3;
      visualsModel.vignetteRadius = config.postfx.vignetteRadius ?? 0.75;
      visualsModel.vignetteSmoothness = config.postfx.vignetteSmoothness ?? 0.5;
      const bVigStr = fVignette.addBinding(visualsModel, "vignetteStrength", { min: 0, max: 1, step: 0.01, label: "Strength" });
      bVigStr.on("change", (ev: any) => context.config.patch({ postfx: { vignetteStrength: Number(ev.value) } as any }));
      const bVigRad = fVignette.addBinding(visualsModel, "vignetteRadius", { min: 0, max: 2, step: 0.01, label: "Radius" });
      bVigRad.on("change", (ev: any) => context.config.patch({ postfx: { vignetteRadius: Number(ev.value) } as any }));
      const bVigSmooth = fVignette.addBinding(visualsModel, "vignetteSmoothness", { min: 0, max: 1, step: 0.01, label: "Smoothness" });
      bVigSmooth.on("change", (ev: any) => context.config.patch({ postfx: { vignetteSmoothness: Number(ev.value) } as any }));
      
      const fColorGrade = fPost.addFolder({ title: "Color Grading" });
      visualsModel.saturation = config.postfx.saturation ?? 1.0;
      visualsModel.contrast = config.postfx.contrast ?? 1.0;
      visualsModel.brightness = config.postfx.brightness ?? 0.0;
      const bSat = fColorGrade.addBinding(visualsModel, "saturation", { min: 0, max: 2, step: 0.01, label: "Saturation" });
      bSat.on("change", (ev: any) => context.config.patch({ postfx: { saturation: Number(ev.value) } as any }));
      const bCont = fColorGrade.addBinding(visualsModel, "contrast", { min: 0, max: 3, step: 0.01, label: "Contrast" });
      bCont.on("change", (ev: any) => context.config.patch({ postfx: { contrast: Number(ev.value) } as any }));
      const bBright = fColorGrade.addBinding(visualsModel, "brightness", { min: -0.5, max: 0.5, step: 0.01, label: "Brightness" });
      bBright.on("change", (ev: any) => context.config.patch({ postfx: { brightness: Number(ev.value) } as any }));
      
      const fEffects = fPost.addFolder({ title: "Effects" });
      visualsModel.filmGrainStrength = config.postfx.filmGrainStrength ?? 0.0;
      visualsModel.sharpenStrength = config.postfx.sharpenStrength ?? 0.0;
      const bGrain = fEffects.addBinding(visualsModel, "filmGrainStrength", { min: 0, max: 0.5, step: 0.001, label: "Film Grain" });
      bGrain.on("change", (ev: any) => context.config.patch({ postfx: { filmGrainStrength: Number(ev.value) } as any }));
      const bSharp = fEffects.addBinding(visualsModel, "sharpenStrength", { min: 0, max: 1, step: 0.01, label: "Sharpen" });
      bSharp.on("change", (ev: any) => context.config.patch({ postfx: { sharpenStrength: Number(ev.value) } as any }));
      
      const fEnv = visualsPane.addFolder({ title: "Environment" });
      const bExp = fEnv.addBinding(visualsModel, "toneExposure", { min: 0, max: 3, step: 0.01, label: "Exposure" });
      bExp.on("change", (ev: any) => {
        const value = Number(ev.value);
        context.config.patch({ postfx: { exposure: value } });
      });
      fEnv.addBinding({ tonemap: config.postfx.toneMapping }, "tonemap", { 
        options: { None: "none", Reinhard: "reinhard", Filmic: "filmic", ACES: "aces" }, 
        label: "Tone Map" 
      }).on("change", (ev: any) => {
        context.config.patch({ postfx: { toneMapping: ev.value } });
      });
      const bEnvI = fEnv.addBinding(visualsModel, "envIntensity", { min: 0, max: 2, step: 0.01, label: "Env Intensity" });
      bEnvI.on("change", (ev: any) => {
        const value = Number(ev.value);
        context.config.patch({ stage: { environmentIntensity: value } });
        if (context.stage) context.stage.scene.environmentIntensity = value;
      });
      const fCam = visualsPane.addFolder({ title: "Camera" });
      const bFov = fCam.addBinding(visualsModel, "cameraFov", { min: 20, max: 100, step: 1, label: "FOV" });
      bFov.on("change", (ev: any) => {
        const fov = Number(ev.value);
        context.config.patch({ stage: { camera: { fov } } });
        if (context.stage) {
          const cam = context.stage.camera as any;
          if (cam && typeof cam.updateProjectionMatrix === "function") {
            cam.fov = fov;
            cam.updateProjectionMatrix();
          }
        }
      });
      const vMetrics = document.createElement("div");
      vMetrics.style.display = "grid";
      vMetrics.style.rowGap = "6px";
      vMetrics.appendChild(createSectionTitle("Metrics"));
      const fpsRow = createMetricsRow("Framerate");
      vMetrics.appendChild(fpsRow.wrapper);
      state.fpsLabel = fpsRow.value;
      const frameRow = createMetricsRow("Frame Time");
      vMetrics.appendChild(frameRow.wrapper);
      state.frameLabel = frameRow.value;
      visuals.content.appendChild(vMetrics);

      // Audio Pane
      const audio = createPanel({ id: "panel.audio", title: "Audio Reactivity", position: { top: 16 + 320, right: 16 } });
      state.audioWrapper = audio.wrapper;
      state.audioHeader = audio.header;
      state.audioContent = audio.content;
      const audioPane = new Pane({ container: audio.body as HTMLElement });
      state.audioPane = audioPane;
      const audioModel: any = { ...config.audio };
      const fAudio = audioPane.addFolder({ title: "General" });
      fAudio.addBinding(audioModel, "enabled", { label: "Enable" }).on("change", (ev: any) => context.config.patch({ audio: { enabled: !!ev.value } }));
      fAudio.addBinding(audioModel, "source", {
        options: { Microphone: "microphone", File: "file", Loop: "loop" },
        label: "Source",
      }).on("change", (ev: any) => context.config.patch({ audio: { source: ev.value } }));
      fAudio.addButton({ title: "Load Audio File" }).on("click", () => {
        try {
          (tick?.context?.services?.audio as any)?.engine?.openFileDialog?.();
        } catch {}
      });
      const fDyn = audioPane.addFolder({ title: "Dynamics" });
      fDyn.addBinding(audioModel, "sensitivity", { min: 0, max: 3, step: 0.01 }).on("change", (ev: any) => context.config.patch({ audio: { sensitivity: Number(ev.value) } }));
      fDyn.addBinding(audioModel, "smoothing", { min: 0, max: 0.99, step: 0.01 }).on("change", (ev: any) => context.config.patch({ audio: { smoothing: Number(ev.value) } }));
      fDyn.addBinding(audioModel, "dynamics", { min: 0.1, max: 3, step: 0.01 }).on("change", (ev: any) => context.config.patch({ audio: { dynamics: Number(ev.value) } }));
      const fBands = audioPane.addFolder({ title: "Bands" });
      fBands.addBinding(audioModel, "bassGain", { min: 0, max: 2, step: 0.01, label: "Bass" }).on("change", (ev: any) => context.config.patch({ audio: { bassGain: Number(ev.value) } }));
      fBands.addBinding(audioModel, "midGain", { min: 0, max: 2, step: 0.01, label: "Mid" }).on("change", (ev: any) => context.config.patch({ audio: { midGain: Number(ev.value) } }));
      fBands.addBinding(audioModel, "trebleGain", { min: 0, max: 2, step: 0.01, label: "Treble" }).on("change", (ev: any) => context.config.patch({ audio: { trebleGain: Number(ev.value) } }));
      const fMotion = audioPane.addFolder({ title: "Motion" });
      fMotion.addBinding(audioModel, "flow", { min: 0, max: 2, step: 0.01 }).on("change", (ev: any) => context.config.patch({ audio: { flow: Number(ev.value) } }));
      fMotion.addBinding(audioModel, "swirl", { min: 0, max: 2, step: 0.01 }).on("change", (ev: any) => context.config.patch({ audio: { swirl: Number(ev.value) } }));
      fMotion.addBinding(audioModel, "displacement", { min: 0, max: 2, step: 0.01 }).on("change", (ev: any) => context.config.patch({ audio: { displacement: Number(ev.value) } }));
      const fColor = audioPane.addFolder({ title: "Color" });
      fColor.addBinding(audioModel, "colorBoost", { min: 0, max: 2, step: 0.01 }).on("change", (ev: any) => context.config.patch({ audio: { colorBoost: Number(ev.value) } }));
      const fBeat = audioPane.addFolder({ title: "Beat" });
      fBeat.addBinding(audioModel, "beatHold", { min: 0.05, max: 1, step: 0.01, label: "Hold" }).on("change", (ev: any) => context.config.patch({ audio: { beatHold: Number(ev.value) } }));
      fBeat.addBinding(audioModel, "beatDecay", { min: 0.5, max: 0.999, step: 0.001, label: "Decay" }).on("change", (ev: any) => context.config.patch({ audio: { beatDecay: Number(ev.value) } }));
      fBeat.addBinding(audioModel, "beatRelease", { min: 0.5, max: 3, step: 0.01, label: "Release" }).on("change", (ev: any) => context.config.patch({ audio: { beatRelease: Number(ev.value) } }));

      // Mini audio viz and metrics
      const viz = document.createElement("canvas");
      viz.width = 260;
      viz.height = 48;
      viz.style.width = "100%";
      viz.style.height = "48px";
      viz.style.borderRadius = "8px";
      viz.style.background = "rgba(255,255,255,0.05)";
      viz.style.border = "1px solid rgba(255,255,255,0.08)";
      audio.content.appendChild(viz);
      state.audioViz = viz;
      state.audioVizCtx = viz.getContext("2d");
      const aMetrics = document.createElement("div");
      aMetrics.style.display = "grid";
      aMetrics.style.rowGap = "6px";
      aMetrics.appendChild(createSectionTitle("Audio Metrics"));
      const audioLevelRow = createMetricsRow("Audio Level");
      const beatRow = createMetricsRow("Beat");
      aMetrics.appendChild(audioLevelRow.wrapper);
      aMetrics.appendChild(beatRow.wrapper);
      state.audioLevelLabel = audioLevelRow.value;
      state.beatLabel = beatRow.value;
      audio.content.appendChild(aMetrics);

      // Physics & Settings Pane
      const phys = createPanel({ id: "panel.physics", title: "Physics & Settings", position: { top: 16 + 320 + 340, right: 16 } });
      state.physicsWrapper = phys.wrapper;
      state.physicsHeader = phys.header;
      state.physicsContent = phys.content;
      const physicsPane = new Pane({ container: phys.body as HTMLElement });
      state.physicsPane = physicsPane;
      const physicsModel: any = {
        run: config.physics.run,
        speed: config.physics.speed,
        iterations: config.physics.iterations,
        stiffness: config.physics.stiffness,
        viscosity: config.physics.viscosity,
        noise: config.physics.noise,
        particleCount: config.physics.particleCount,
        gravityMode: config.physics.gravityMode ?? "back",
        gravityX: config.physics.gravity[0],
        gravityY: config.physics.gravity[1],
        gravityZ: config.physics.gravity[2],
        boundariesEnabled: !!config.physics.boundariesEnabled,
        perfHud: config.diagnostics.perfHud,
        debugLogging: config.diagnostics.debugLogging,
      };
      const fPhys = physicsPane.addFolder({ title: "Physics" });
      fPhys.addBinding(physicsModel, "run", { label: "Run" }).on("change", (ev: any) => context.config.patch({ physics: { run: !!ev.value } }));
      fPhys.addBinding(physicsModel, "speed", { min: 0, max: 3, step: 0.01 }).on("change", (ev: any) => context.config.patch({ physics: { speed: Number(ev.value) } }));
      fPhys.addBinding(physicsModel, "iterations", { min: 1, max: 8, step: 1 }).on("change", (ev: any) => context.config.patch({ physics: { iterations: Number(ev.value) } }));
      fPhys.addBinding(physicsModel, "stiffness", { min: 0, max: 10, step: 0.1 }).on("change", (ev: any) => context.config.patch({ physics: { stiffness: Number(ev.value) } }));
      fPhys.addBinding(physicsModel, "viscosity", { min: 0, max: 2, step: 0.01 }).on("change", (ev: any) => context.config.patch({ physics: { viscosity: Number(ev.value) } }));

      // Additional legacy-like controls
      fPhys.addBinding(physicsModel, "noise", { min: 0, max: 2, step: 0.01, label: "noise" }).on("change", (ev: any) => context.config.patch({ physics: { noise: Number(ev.value) } }));
      fPhys.addBinding(physicsModel, "particleCount", { min: 4096, max: config.physics.maxParticles, step: 4096, label: "Particles" }).on("change", (ev: any) => context.config.patch({ physics: { particleCount: Number(ev.value) } }));

      // Boundaries
      const fBounds = physicsPane.addFolder({ title: "Boundaries" });
      fBounds.addBinding(physicsModel, "boundariesEnabled", { label: "Enable Container" }).on("change", (ev: any) => {
        context.config.patch({ physics: { boundariesEnabled: !!ev.value } });
      });

      const fGrav = physicsPane.addFolder({ title: "Gravity" });
      fGrav.addBinding(physicsModel, "gravityMode", {
        label: "Mode",
        options: { Back: "back", Down: "down", Center: "center", Sensor: "sensor", Vector: "vector" },
      }).on("change", (ev: any) => context.config.patch({ physics: { gravityMode: ev.value as any } }));
      const fGravVec = fGrav.addFolder({ title: "Vector" });
      fGravVec.addBinding(physicsModel, "gravityX", { min: -2, max: 2, step: 0.01, label: "X" }).on("change", (ev: any) => {
        const v = context.config.value.physics.gravity;
        context.config.patch({ physics: { gravity: [Number(ev.value), v[1], v[2]] } });
      });
      fGravVec.addBinding(physicsModel, "gravityY", { min: -2, max: 2, step: 0.01, label: "Y" }).on("change", (ev: any) => {
        const v = context.config.value.physics.gravity;
        context.config.patch({ physics: { gravity: [v[0], Number(ev.value), v[2]] } });
      });
      fGravVec.addBinding(physicsModel, "gravityZ", { min: -2, max: 2, step: 0.01, label: "Z" }).on("change", (ev: any) => {
        const v = context.config.value.physics.gravity;
        context.config.patch({ physics: { gravity: [v[0], v[1], Number(ev.value)] } });
      });
      const fDiag = physicsPane.addFolder({ title: "Diagnostics" });
      fDiag.addBinding(physicsModel, "perfHud", { label: "Perf HUD" }).on("change", (ev: any) => context.config.patch({ diagnostics: { perfHud: !!ev.value } }));
      fDiag.addBinding(physicsModel, "debugLogging", { label: "Debug Logging" }).on("change", (ev: any) => context.config.patch({ diagnostics: { debugLogging: !!ev.value } }));

      // Quick creative modifiers
      const fCreative = physicsPane.addFolder({ title: "Creative Modifiers" });
      const creative = {
        swirlBurst: 0,
        gravityPulse: 0,
        focusPush: 0,
      } as any;
      fCreative.addBinding(creative, "swirlBurst", { min: 0, max: 1, step: 0.01, label: "Swirl Burst" }).on("change", (ev: any) => {
        const s = Number(ev.value);
        const base = context.config.value.audio.swirl;
        context.config.patch({ audio: { swirl: Math.max(0, base + s * 0.6) } });
      });
      fCreative.addBinding(creative, "gravityPulse", { min: 0, max: 1, step: 0.01, label: "Gravity Pulse" }).on("change", (ev: any) => {
        const p = Number(ev.value);
        const g = context.config.value.physics.gravity;
        context.config.patch({ physics: { gravity: [g[0], g[1] - p * 0.4, g[2]] } });
      });
      fCreative.addBinding(creative, "focusPush", { min: 0, max: 1, step: 0.01, label: "Focus Push" }).on("change", (ev: any) => {
        const k = Number(ev.value);
        const cfg = context.config.value.postfx;
        const inner = Math.max(0, Math.min(0.8, cfg.focusInnerRadius + k * 0.1));
        const outer = Math.max(inner + 0.05, Math.min(1.2, cfg.focusOuterRadius + k * 0.15));
        context.config.patch({ postfx: { focusInnerRadius: inner, focusOuterRadius: outer } });
      });

      // Sync back if config changes externally
      state.unsubscribeConfig = context.config.subscribe((nextConfig) => {
        visualsModel.renderMode = nextConfig.render.mode;
        visualsModel.renderSize = nextConfig.render.size;
        visualsModel.lodMeshRatio = nextConfig.render.lodMeshRatio;
        visualsModel.pointSizeMin = nextConfig.render.pointSizeMin;
        visualsModel.pointSizeMax = nextConfig.render.pointSizeMax;
        visualsModel.bloom = nextConfig.postfx.bloom;
        visualsModel.bloomThreshold = nextConfig.postfx.bloomThreshold;
        visualsModel.bloomStrength = nextConfig.postfx.bloomStrength;
        visualsModel.bloomRadius = nextConfig.postfx.bloomRadius;
        visualsModel.blurStrength = nextConfig.postfx.blurStrength;
        visualsModel.focusCenterX = nextConfig.postfx.focusCenter[0];
        visualsModel.focusCenterY = nextConfig.postfx.focusCenter[1];
        visualsModel.focusInnerRadius = nextConfig.postfx.focusInnerRadius;
        visualsModel.focusOuterRadius = nextConfig.postfx.focusOuterRadius;
        visualsModel.focusBias = nextConfig.postfx.focusBias ?? 1;
        visualsModel.chromaStrength = nextConfig.postfx.chromaticAberrationStrength;
        visualsModel.chromaScale = nextConfig.postfx.chromaticAberrationScale;
        visualsModel.lensStreaks = nextConfig.postfx.lensStreaks;
        visualsModel.lensIntensity = nextConfig.postfx.lensStreakIntensity;
        visualsModel.lensThreshold = nextConfig.postfx.lensStreakThreshold;
        visualsModel.lensStretch = nextConfig.postfx.lensStreakStretch;
        visualsModel.temporalEnabled = nextConfig.postfx.temporalEnabled;
        visualsModel.temporalFeedback = nextConfig.postfx.temporalFeedback;
        visualsModel.temporalBlend = nextConfig.postfx.temporalBlend;
        visualsModel.toneExposure = nextConfig.postfx.exposure;
        visualsModel.qualityPreset = nextConfig.postfx.qualityPreset ?? "high";
        visualsModel.vignetteStrength = nextConfig.postfx.vignetteStrength ?? 0.3;
        visualsModel.vignetteRadius = nextConfig.postfx.vignetteRadius ?? 0.75;
        visualsModel.vignetteSmoothness = nextConfig.postfx.vignetteSmoothness ?? 0.5;
        visualsModel.filmGrainStrength = nextConfig.postfx.filmGrainStrength ?? 0;
        visualsModel.saturation = nextConfig.postfx.saturation ?? 1;
        visualsModel.contrast = nextConfig.postfx.contrast ?? 1;
        visualsModel.brightness = nextConfig.postfx.brightness ?? 0;
        visualsModel.sharpenStrength = nextConfig.postfx.sharpenStrength ?? 0;
        visualsModel.envIntensity = nextConfig.stage.environmentIntensity;
        visualsModel.cameraFov = nextConfig.stage.camera.fov;
        audioModel.enabled = nextConfig.audio.enabled;
        audioModel.source = nextConfig.audio.source;
        audioModel.sensitivity = nextConfig.audio.sensitivity;
        audioModel.smoothing = nextConfig.audio.smoothing;
        audioModel.dynamics = nextConfig.audio.dynamics;
        audioModel.bassGain = nextConfig.audio.bassGain;
        audioModel.midGain = nextConfig.audio.midGain;
        audioModel.trebleGain = nextConfig.audio.trebleGain;
        audioModel.flow = nextConfig.audio.flow;
        audioModel.swirl = nextConfig.audio.swirl;
        audioModel.displacement = nextConfig.audio.displacement;
        audioModel.colorBoost = nextConfig.audio.colorBoost;
        audioModel.beatHold = nextConfig.audio.beatHold;
        audioModel.beatDecay = nextConfig.audio.beatDecay;
        audioModel.beatRelease = nextConfig.audio.beatRelease;
        physicsModel.run = nextConfig.physics.run;
        physicsModel.speed = nextConfig.physics.speed;
        physicsModel.iterations = nextConfig.physics.iterations;
        physicsModel.stiffness = nextConfig.physics.stiffness;
        physicsModel.viscosity = nextConfig.physics.viscosity;
        physicsModel.noise = nextConfig.physics.noise;
        physicsModel.particleCount = nextConfig.physics.particleCount;
        physicsModel.gravityMode = nextConfig.physics.gravityMode ?? physicsModel.gravityMode;
        physicsModel.gravityX = nextConfig.physics.gravity[0];
        physicsModel.gravityY = nextConfig.physics.gravity[1];
        physicsModel.gravityZ = nextConfig.physics.gravity[2];
        physicsModel.boundariesEnabled = !!nextConfig.physics.boundariesEnabled;
        physicsModel.perfHud = nextConfig.diagnostics.perfHud;
        physicsModel.debugLogging = nextConfig.diagnostics.debugLogging;
      });

      context.services.dashboard = { container } as DashboardService;
    },
    async update(tick: TickInfo) {
      updateMetrics(tick);
      drawAudioViz(tick);
    },
    async dispose(context: AppContext) {
      state.unsubscribeConfig?.();
      state.unsubscribeConfig = null;
      // panes
      state.visualsPane?.dispose?.();
      state.audioPane?.dispose?.();
      state.physicsPane?.dispose?.();
      state.visualsPane = null;
      state.audioPane = null;
      state.physicsPane = null;
      if (state.visualsWrapper) state.visualsWrapper.remove();
      if (state.audioWrapper) state.audioWrapper.remove();
      if (state.physicsWrapper) state.physicsWrapper.remove();
      state.visualsWrapper = null;
      state.audioWrapper = null;
      state.physicsWrapper = null;
      state.visualsHeader = null;
      state.audioHeader = null;
      state.physicsHeader = null;
      state.visualsContent = null;
      state.audioContent = null;
      state.physicsContent = null;
      if (state.audioViz) {
        state.audioViz.remove();
        state.audioViz = null;
        state.audioVizCtx = null;
      }
      // metrics
      state.fpsLabel = null;
      state.frameLabel = null;
      state.audioLevelLabel = null;
      state.beatLabel = null;
      if (state.container) {
        state.container.remove();
        state.container = null;
      }
      delete context.services.dashboard;
    },
  };
};
