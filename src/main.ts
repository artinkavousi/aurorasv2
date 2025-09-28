import * as THREE from "three/webgpu";
import { createConfigStore, createAppContext, ModuleRegistry, createStageModule } from "./config";
import { createAudioModule } from "./audio/audio";
import { createMlsMpmModule } from "./physics/mls-mpm";
import { createMeshRendererModule } from "./renders/meshRenderer";
import { createPointRendererModule } from "./renders/pointRenderer";
import { createPostfxModule } from "./postfx/postfx";
import { createDashboardModule } from "./io/dashboard";
import { createPerfHudModule } from "./diagnostics/perfHud";

THREE.ColorManagement.enabled = true;

const updateLoadingProgressBar = async (fraction = 1, delay = 0) =>
  new Promise<void>((resolve) => {
    const progress = document.getElementById("progress");
    if (progress) {
      progress.style.width = `${Math.max(0, Math.min(1, fraction)) * 200}px`;
    }
    if (delay <= 0) {
      resolve();
    } else {
      setTimeout(resolve, delay);
    }
  });

const showError = (message: string) => {
  const progressBar = document.getElementById("progress-bar");
  if (progressBar) {
    progressBar.style.opacity = "0";
  }
  const error = document.getElementById("error");
  if (error) {
    error.style.visibility = "visible";
    error.innerText = `Error: ${message}`;
    error.style.pointerEvents = "auto";
  }
};

const attachRenderer = (renderer: THREE.WebGPURenderer) => {
  const container = document.getElementById("container");
  if (!container) {
    throw new Error("Missing #container element");
  }
  container.appendChild(renderer.domElement);
};

const createRenderer = async () => {
  const renderer = new THREE.WebGPURenderer({});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  await renderer.init();
  const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
  if (backend && backend.isWebGPUBackend === false) {
    throw new Error("Couldn't initialize WebGPU. Make sure WebGPU is supported by your browser.");
  }
  return renderer;
};

const hideLoader = () => {
  const veil = document.getElementById("veil");
  if (veil) {
    veil.style.opacity = "0";
  }
  const progressBar = document.getElementById("progress-bar");
  if (progressBar) {
    progressBar.style.opacity = "0";
  }
};

const setupResize = (
  renderer: THREE.WebGPURenderer,
  registry: ModuleRegistry,
  context: ReturnType<typeof createAppContext>
) => {
  const handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    registry.resize(context, { width, height });
  };
  window.addEventListener("resize", handleResize);
  handleResize();
  return () => window.removeEventListener("resize", handleResize);
};

const registerModules = (registry: ModuleRegistry, context: ReturnType<typeof createAppContext>) => {
  registry
    .register({
      id: "stage",
      priority: -100,
      autoStart: true,
      factory: () => createStageModule({ config: context.config.value.stage }),
    })
    .register({
      id: "io.dashboard",
      priority: -80,
      autoStart: true,
      factory: () => createDashboardModule(),
    })
    .register({
      id: "audio",
      priority: -50,
      autoStart: true,
      factory: () => createAudioModule(),
    })
    .register({
      id: "physics.mls-mpm",
      priority: 0,
      autoStart: true,
      factory: () => createMlsMpmModule(),
    })
    .register({
      id: "postfx",
      priority: 90,
      autoStart: true,
      factory: () => createPostfxModule(),
    })
    .register({
      id: "render.mesh",
      priority: 50,
      autoStart: true,
      factory: () => createMeshRendererModule(),
    })
    .register({
      id: "render.points",
      priority: 55,
      autoStart: true,
      factory: () => createPointRendererModule(),
    })
    .register({
      id: "diagnostics.perfHud",
      priority: 180,
      autoStart: true,
      factory: () => createPerfHudModule(),
    });
};

const renderFrame = async (
  renderer: THREE.WebGPURenderer,
  context: ReturnType<typeof createAppContext>,
  tick: Awaited<ReturnType<ModuleRegistry["update"]>>
) => {
  if (tick.renderOverride) {
    await tick.renderOverride.fn(tick);
    return;
  }
  const stage = context.stage;
  if (stage) {
    await renderer.renderAsync(stage.scene, stage.camera);
  }
};

const bootstrap = async () => {
  if (!("gpu" in navigator)) {
    showError("Your device does not support WebGPU.");
    return;
  }
  try {
    const renderer = await createRenderer();
    attachRenderer(renderer);

    const config = createConfigStore({ persist: false });
    const modules = new ModuleRegistry();
    const context = createAppContext(renderer, config, modules);

    registerModules(modules, context);
    await updateLoadingProgressBar(0.2);

    await modules.initAll(context);
    await updateLoadingProgressBar(1, 150);
    hideLoader();

    const cleanupResize = setupResize(renderer, modules, context);

    const clock = context.clock;
    const animate = async () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      const tick = await modules.update(context, delta, elapsed);
      await renderFrame(renderer, context, tick);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    return () => {
      cleanupResize();
      modules.disposeAll(context);
    };
  } catch (error) {
    console.error(error);
    showError(error instanceof Error ? error.message : "Unknown error");
  }
};

bootstrap();



