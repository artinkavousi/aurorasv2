import type { ModuleInstance, TickInfo, AppContext, DashboardService } from "../context";
import type { AppConfig } from "../config";

interface SliderControl {
  input: HTMLInputElement;
  setValue: (value: number) => void;
}

interface DashboardState {
  container: HTMLDivElement | null;
  audioToggle: HTMLInputElement | null;
  bloomToggle: HTMLInputElement | null;
  lensToggle: HTMLInputElement | null;
  temporalToggle: HTMLInputElement | null;
  renderSelect: HTMLSelectElement | null;
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
  container.style.minWidth = "220px";
  container.style.padding = "12px";
  container.style.background = "rgba(12, 12, 18, 0.7)";
  container.style.backdropFilter = "blur(12px)";
  container.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  container.style.borderRadius = "12px";
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

const createSlider = (
  label: string,
  {
    min,
    max,
    step,
    initial,
    format,
  }: {
    min: number;
    max: number;
    step: number;
    initial?: number;
    format?: (value: number) => string;
  }
): { wrapper: HTMLDivElement; input: HTMLInputElement; setValue: (value: number) => void } => {
  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.rowGap = "4px";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";

  const text = document.createElement("span");
  text.textContent = label;
  text.style.fontWeight = "500";

  const valueLabel = document.createElement("span");
  valueLabel.style.opacity = "0.7";
  valueLabel.style.fontVariantNumeric = "tabular-nums";

  header.appendChild(text);
  header.appendChild(valueLabel);

  const input = document.createElement("input");
  input.type = "range";
  input.min = min.toString();
  input.max = max.toString();
  input.step = step.toString();
  input.value = (initial ?? min).toString();

  const setValue = (value: number) => {
    input.value = value.toString();
    const formatted = format ? format(value) : value.toFixed(2);
    valueLabel.textContent = formatted;
  };

  setValue(initial ?? min);

  wrapper.appendChild(header);
  wrapper.appendChild(input);

  return { wrapper, input, setValue };
};

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

const applyConfigToControls = (state: DashboardState, config: AppConfig) => {
  if (state.audioToggle) {
    state.audioToggle.checked = config.audio.enabled;
  }
  if (state.bloomToggle) {
    state.bloomToggle.checked = config.postfx.bloom;
  }
  if (state.lensToggle) {
    state.lensToggle.checked = config.postfx.lensStreaks;
  }
  if (state.temporalToggle) {
    state.temporalToggle.checked = config.postfx.temporalEnabled;
  }
  if (state.renderSelect) {
    state.renderSelect.value = config.render.mode;
  }
  state.focusX?.setValue(config.postfx.focusCenter[0]);
  state.focusY?.setValue(config.postfx.focusCenter[1]);
  state.focusRadius?.setValue(config.postfx.focusInnerRadius);
  state.focusFeather?.setValue(config.postfx.focusOuterRadius);
  state.blurStrength?.setValue(config.postfx.blurStrength);
  state.chromaStrength?.setValue(config.postfx.chromaticAberrationStrength);
  state.bloomStrength?.setValue(config.postfx.bloomStrength);
  state.lensIntensity?.setValue(config.postfx.lensStreakIntensity);
  state.temporalBlend?.setValue(config.postfx.temporalBlend);
  state.temporalFeedback?.setValue(config.postfx.temporalFeedback);
  if (state.lensIntensity) {
    state.lensIntensity.input.disabled = !config.postfx.lensStreaks;
  }
  if (state.temporalBlend) {
    state.temporalBlend.input.disabled = !config.postfx.temporalEnabled;
  }
  if (state.temporalFeedback) {
    state.temporalFeedback.input.disabled = !config.postfx.temporalEnabled;
  }
};

export const createDashboardModule = (): ModuleInstance => {
  const id = "io.dashboard";
  const state: DashboardState = {
    container: null,
    audioToggle: null,
    bloomToggle: null,
    lensToggle: null,
    temporalToggle: null,
    renderSelect: null,
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

  return {
    id,
    label: "Dashboard",
    priority: -80,
    autoStart: true,
    async init(context: AppContext) {
      const container = createContainer();
      state.container = container;

      const config = context.config.value;

      const controlsSection = document.createElement("div");
      controlsSection.style.display = "grid";
      controlsSection.style.rowGap = "8px";
      controlsSection.appendChild(createSectionTitle("Controls"));

      const audioToggle = createToggle("Audio Reactive");
      audioToggle.input.checked = config.audio.enabled;
      audioToggle.input.addEventListener("change", () => {
        context.config.patch({ audio: { enabled: audioToggle.input.checked } });
      });
      controlsSection.appendChild(audioToggle.wrapper);
      state.audioToggle = audioToggle.input;

      const bloomToggle = createToggle("Bloom");
      bloomToggle.input.checked = config.postfx.bloom;
      bloomToggle.input.addEventListener("change", () => {
        context.config.patch({ postfx: { bloom: bloomToggle.input.checked } });
      });
      controlsSection.appendChild(bloomToggle.wrapper);
      state.bloomToggle = bloomToggle.input;

      const renderSelect = createSelect("Render Mode", [
        { value: "mesh", text: "Mesh" },
        { value: "points", text: "Points" },
        { value: "hybrid", text: "Hybrid" },
      ]);
      renderSelect.select.value = config.render.mode;
      renderSelect.select.addEventListener("change", () => {
        context.config.patch({ render: { mode: renderSelect.select.value as AppConfig["render"]["mode"] } });
      });
      controlsSection.appendChild(renderSelect.wrapper);
      state.renderSelect = renderSelect.select;

      container.appendChild(controlsSection);

      const focusSection = document.createElement("div");
      focusSection.style.display = "grid";
      focusSection.style.rowGap = "6px";
      focusSection.appendChild(createSectionTitle("Focus & Blur"));

      const focusX = createSlider("Focus X", {
        min: 0,
        max: 1,
        step: 0.01,
        initial: config.postfx.focusCenter[0],
        format: (value) => value.toFixed(2),
      });
      focusX.input.addEventListener("input", () => {
        const value = parseFloat(focusX.input.value);
        focusX.setValue(value);
        const current = context.config.value.postfx.focusCenter;
        context.config.patch({ postfx: { focusCenter: [value, current[1]] } });
      });
      focusSection.appendChild(focusX.wrapper);
      state.focusX = focusX;

      const focusY = createSlider("Focus Y", {
        min: 0,
        max: 1,
        step: 0.01,
        initial: config.postfx.focusCenter[1],
        format: (value) => value.toFixed(2),
      });
      focusY.input.addEventListener("input", () => {
        const value = parseFloat(focusY.input.value);
        focusY.setValue(value);
        const current = context.config.value.postfx.focusCenter;
        context.config.patch({ postfx: { focusCenter: [current[0], value] } });
      });
      focusSection.appendChild(focusY.wrapper);
      state.focusY = focusY;

      const focusRadius = createSlider("Focus Radius", {
        min: 0.05,
        max: 0.6,
        step: 0.01,
        initial: config.postfx.focusInnerRadius,
        format: (value) => value.toFixed(2),
      });
      focusRadius.input.addEventListener("input", () => {
        const value = parseFloat(focusRadius.input.value);
        focusRadius.setValue(value);
        context.config.patch({ postfx: { focusInnerRadius: value } });
      });
      focusSection.appendChild(focusRadius.wrapper);
      state.focusRadius = focusRadius;

      const focusFeather = createSlider("Edge Feather", {
        min: 0.2,
        max: 0.95,
        step: 0.01,
        initial: config.postfx.focusOuterRadius,
        format: (value) => value.toFixed(2),
      });
      focusFeather.input.addEventListener("input", () => {
        const value = parseFloat(focusFeather.input.value);
        focusFeather.setValue(value);
        context.config.patch({ postfx: { focusOuterRadius: value } });
      });
      focusSection.appendChild(focusFeather.wrapper);
      state.focusFeather = focusFeather;

      const blurStrength = createSlider("Blur Strength", {
        min: 0,
        max: 0.12,
        step: 0.001,
        initial: config.postfx.blurStrength,
        format: (value) => value.toFixed(3),
      });
      blurStrength.input.addEventListener("input", () => {
        const value = parseFloat(blurStrength.input.value);
        blurStrength.setValue(value);
        context.config.patch({ postfx: { blurStrength: value } });
      });
      focusSection.appendChild(blurStrength.wrapper);
      state.blurStrength = blurStrength;

      container.appendChild(focusSection);

      const opticsSection = document.createElement("div");
      opticsSection.style.display = "grid";
      opticsSection.style.rowGap = "6px";
      opticsSection.appendChild(createSectionTitle("Optics"));

      const chromaStrength = createSlider("Chromatic Strength", {
        min: 0,
        max: 2,
        step: 0.01,
        initial: config.postfx.chromaticAberrationStrength,
        format: (value) => value.toFixed(2),
      });
      chromaStrength.input.addEventListener("input", () => {
        const value = parseFloat(chromaStrength.input.value);
        chromaStrength.setValue(value);
        context.config.patch({ postfx: { chromaticAberrationStrength: value } });
      });
      opticsSection.appendChild(chromaStrength.wrapper);
      state.chromaStrength = chromaStrength;

      const bloomStrength = createSlider("Bloom Strength", {
        min: 0,
        max: 2,
        step: 0.01,
        initial: config.postfx.bloomStrength,
        format: (value) => value.toFixed(2),
      });
      bloomStrength.input.addEventListener("input", () => {
        const value = parseFloat(bloomStrength.input.value);
        bloomStrength.setValue(value);
        context.config.patch({ postfx: { bloomStrength: value } });
      });
      opticsSection.appendChild(bloomStrength.wrapper);
      state.bloomStrength = bloomStrength;

      const lensToggle = createToggle("Lens Streaks");
      lensToggle.input.checked = config.postfx.lensStreaks;
      lensToggle.input.addEventListener("change", () => {
        context.config.patch({ postfx: { lensStreaks: lensToggle.input.checked } });
      });
      opticsSection.appendChild(lensToggle.wrapper);
      state.lensToggle = lensToggle.input;

      const lensIntensity = createSlider("Streak Intensity", {
        min: 0,
        max: 1,
        step: 0.01,
        initial: config.postfx.lensStreakIntensity,
        format: (value) => value.toFixed(2),
      });
      lensIntensity.input.addEventListener("input", () => {
        const value = parseFloat(lensIntensity.input.value);
        lensIntensity.setValue(value);
        context.config.patch({ postfx: { lensStreakIntensity: value } });
      });
      opticsSection.appendChild(lensIntensity.wrapper);
      state.lensIntensity = lensIntensity;
      lensIntensity.input.disabled = !config.postfx.lensStreaks;

      container.appendChild(opticsSection);

      const temporalSection = document.createElement("div");
      temporalSection.style.display = "grid";
      temporalSection.style.rowGap = "6px";
      temporalSection.appendChild(createSectionTitle("Temporal"));

      const temporalToggle = createToggle("Temporal Smoothing");
      temporalToggle.input.checked = config.postfx.temporalEnabled;
      temporalToggle.input.addEventListener("change", () => {
        context.config.patch({ postfx: { temporalEnabled: temporalToggle.input.checked } });
      });
      temporalSection.appendChild(temporalToggle.wrapper);
      state.temporalToggle = temporalToggle.input;

      const temporalBlend = createSlider("Blend Weight", {
        min: 0,
        max: 1,
        step: 0.01,
        initial: config.postfx.temporalBlend,
        format: (value) => value.toFixed(2),
      });
      temporalBlend.input.addEventListener("input", () => {
        const value = parseFloat(temporalBlend.input.value);
        temporalBlend.setValue(value);
        context.config.patch({ postfx: { temporalBlend: value } });
      });
      temporalBlend.input.disabled = !config.postfx.temporalEnabled;
      temporalSection.appendChild(temporalBlend.wrapper);
      state.temporalBlend = temporalBlend;

      const temporalFeedback = createSlider("Feedback", {
        min: 0,
        max: 0.98,
        step: 0.01,
        initial: config.postfx.temporalFeedback,
        format: (value) => value.toFixed(2),
      });
      temporalFeedback.input.addEventListener("input", () => {
        const value = parseFloat(temporalFeedback.input.value);
        temporalFeedback.setValue(value);
        context.config.patch({ postfx: { temporalFeedback: value } });
      });
      temporalFeedback.input.disabled = !config.postfx.temporalEnabled;
      temporalSection.appendChild(temporalFeedback.wrapper);
      state.temporalFeedback = temporalFeedback;

      container.appendChild(temporalSection);

      const metricsSection = document.createElement("div");
      metricsSection.style.display = "grid";
      metricsSection.style.rowGap = "6px";
      metricsSection.appendChild(createSectionTitle("Metrics"));

      const fpsRow = createMetricsRow("Framerate");
      metricsSection.appendChild(fpsRow.wrapper);
      state.fpsLabel = fpsRow.value;

      const frameRow = createMetricsRow("Frame Time");
      metricsSection.appendChild(frameRow.wrapper);
      state.frameLabel = frameRow.value;

      const audioLevelRow = createMetricsRow("Audio Level");
      metricsSection.appendChild(audioLevelRow.wrapper);
      state.audioLevelLabel = audioLevelRow.value;

      const beatRow = createMetricsRow("Beat");
      metricsSection.appendChild(beatRow.wrapper);
      state.beatLabel = beatRow.value;

      container.appendChild(metricsSection);

      state.unsubscribeConfig = context.config.subscribe((nextConfig) => {
        applyConfigToControls(state, nextConfig);
      });

      context.services.dashboard = {
        container,
      } as DashboardService;
    },
    async update(tick: TickInfo) {
      updateMetrics(tick);
    },
    async dispose(context: AppContext) {
      state.unsubscribeConfig?.();
      state.unsubscribeConfig = null;
      state.audioToggle = null;
      state.bloomToggle = null;
      state.renderSelect = null;
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
