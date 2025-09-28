import type { ModuleInstance, TickInfo, AppContext, DashboardService } from "../context";
import type { AppConfig } from "../config";

interface DashboardState {
  container: HTMLDivElement | null;
  audioToggle: HTMLInputElement | null;
  bloomToggle: HTMLInputElement | null;
  renderSelect: HTMLSelectElement | null;
  fpsLabel: HTMLSpanElement | null;
  frameLabel: HTMLSpanElement | null;
  audioLevelLabel: HTMLSpanElement | null;
  beatLabel: HTMLSpanElement | null;
  unsubscribeConfig: (() => void) | null;
  fpsAvg: number;
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
  if (state.renderSelect) {
    state.renderSelect.value = config.render.mode;
  }
};

export const createDashboardModule = (): ModuleInstance => {
  const id = "io.dashboard";
  const state: DashboardState = {
    container: null,
    audioToggle: null,
    bloomToggle: null,
    renderSelect: null,
    fpsLabel: null,
    frameLabel: null,
    audioLevelLabel: null,
    beatLabel: null,
    unsubscribeConfig: null,
    fpsAvg: 0,
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
