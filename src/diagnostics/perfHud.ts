import type { ModuleInstance, TickInfo, AppContext, PerfHudService } from "../config";

interface PerfHudState {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  samples: number[];
  maxSamples: number;
}

const createCanvas = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 80;
  canvas.style.position = "absolute";
  canvas.style.bottom = "16px";
  canvas.style.right = "16px";
  canvas.style.zIndex = "18";
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  canvas.style.pointerEvents = "none";
  canvas.style.opacity = "0.85";
  canvas.style.filter = "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.45))";
  document.body.appendChild(canvas);
  return canvas;
};

const drawHud = (ctx: CanvasRenderingContext2D, samples: number[]) => {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(10, 14, 20, 0.7)";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, height * 0.5);
  ctx.lineTo(width, height * 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  if (samples.length === 0) {
    return;
  }

  const maxFps = 120;
  ctx.strokeStyle = "rgba(80, 200, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const step = width / Math.max(samples.length - 1, 1);
  samples.forEach((value, index) => {
    const x = index * step;
    const norm = Math.min(value / maxFps, 1);
    const y = height - norm * height;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  const latest = samples[samples.length - 1];
  ctx.fillStyle = "white";
  ctx.font = "600 12px Inter, system-ui, sans-serif";
  ctx.fillText(`${latest.toFixed(1)} fps`, 12, 20);
};

export const createPerfHudModule = (): ModuleInstance => {
  const id = "diagnostics.perfHud";
  const state: PerfHudState = {
    canvas: null,
    ctx: null,
    samples: [],
    maxSamples: 120,
  };

  return {
    id,
    label: "Perf HUD",
    priority: 180,
    autoStart: true,
    async init(context: AppContext) {
      const canvas = createCanvas();
      state.canvas = canvas;
      state.ctx = canvas.getContext("2d");
      context.services.perfHud = {
        canvas,
      } as PerfHudService;
    },
    async update(tick: TickInfo) {
      if (!state.ctx) {
        return;
      }
      const fps = tick.delta > 0 ? 1 / tick.delta : 0;
      state.samples.push(fps);
      if (state.samples.length > state.maxSamples) {
        state.samples.splice(0, state.samples.length - state.maxSamples);
      }
      drawHud(state.ctx, state.samples);
    },
    async dispose(context: AppContext) {
      if (state.canvas) {
        state.canvas.remove();
      }
      state.canvas = null;
      state.ctx = null;
      state.samples = [];
      delete context.services.perfHud;
    },
  };
};
