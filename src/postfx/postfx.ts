// @ts-nocheck
import * as THREE from "three/webgpu";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { float, Fn, mrt, output, pass, vec3, vec4 } from "three/tsl";
import type { ModuleInstance, TickInfo, AppContext, PostFxService } from "../config";
import type { AppConfig } from "../config";

interface PostfxState {
  scenePass: ReturnType<typeof pass> | null;
  bloomPass: ReturnType<typeof bloom> | null;
  pipeline: THREE.PostProcessing | null;
  stageHandle: { renderer: THREE.WebGPURenderer; scene: THREE.Scene; camera: THREE.Camera } | null;
  unsubscribeConfig: (() => void) | null;
  currentConfig: AppConfig["postfx"] | null;
}

const createPipeline = (renderer: THREE.WebGPURenderer, stage: { scene: THREE.Scene; camera: THREE.Camera }) => {
  const scenePass = pass(stage.scene, stage.camera);
  scenePass.setMRT(
    mrt({
      output,
      bloomIntensity: float(0),
    })
  );

  const outputPass = scenePass.getTextureNode();
  const bloomIntensityPass = scenePass.getTextureNode("bloomIntensity");
  const bloomPass = bloom(outputPass.mul(bloomIntensityPass));

  const pipeline = new THREE.PostProcessing(renderer);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = Fn(() => {
    const a = outputPass.rgb.clamp(0, 1).toVar();
    const b = bloomPass.rgb.clamp(0, 1).mul(bloomIntensityPass.r.sign().oneMinus()).toVar();
    return vec4(vec3(1).sub(b).sub(b).mul(a).mul(a).add(b.mul(a).mul(2)).clamp(0, 1), 1);
  })().renderOutput();

  return {
    scenePass,
    bloomPass,
    pipeline,
  } as const;
};

const disposePipeline = (state: PostfxState) => {
  state.pipeline?.dispose();
  state.pipeline = null;
  state.scenePass = null;
  state.bloomPass = null;
  state.stageHandle = null;
};

const applyConfig = (state: PostfxState, config: AppConfig["postfx"]) => {
  state.currentConfig = config;
  if (!state.bloomPass) {
    return;
  }
  state.bloomPass.threshold.value = config.bloomThreshold;
  state.bloomPass.strength.value = config.bloomStrength;
  state.bloomPass.radius.value = config.bloomRadius;
};

const ensurePipeline = (state: PostfxState, context: AppContext) => {
  const stage = context.stage;
  if (!stage) {
    disposePipeline(state);
    delete context.services.postfx;
    return false;
  }
  if (state.stageHandle === stage && state.pipeline) {
    return true;
  }
  disposePipeline(state);
  const resources = createPipeline(context.renderer, stage);
  state.scenePass = resources.scenePass;
  state.bloomPass = resources.bloomPass;
  state.pipeline = resources.pipeline;
  state.stageHandle = stage;
  applyConfig(state, state.currentConfig ?? context.config.value.postfx);
  context.services.postfx = {
    pipeline: state.pipeline,
    bloomPass: state.bloomPass,
    scenePass: state.scenePass,
  } as PostFxService;
  return true;
};

export const createPostfxModule = (): ModuleInstance => {
  const id = "postfx";
  const state: PostfxState = {
    scenePass: null,
    bloomPass: null,
    pipeline: null,
    stageHandle: null,
    unsubscribeConfig: null,
    currentConfig: null,
  };

  return {
    id,
    label: "PostFX",
    priority: 90,
    autoStart: true,
    async init(context: AppContext) {
      if (!context.stage) {
        throw new Error("PostFX requires stage to be initialized first");
      }
      state.currentConfig = context.config.value.postfx;
      ensurePipeline(state, context);
      state.unsubscribeConfig = context.config.subscribe((next) => {
        applyConfig(state, next.postfx);
        ensurePipeline(state, context);
      });
    },
    async update(tick: TickInfo) {
      ensurePipeline(state, tick.context);
      const stage = tick.context.stage;
      if (!stage) {
        return;
      }
      const postfxConfig = tick.config.postfx;
      tick.setRenderOverride(async () => {
        if (postfxConfig.bloom && state.pipeline) {
          await state.pipeline.renderAsync();
        } else {
          await tick.context.renderer.renderAsync(stage.scene, stage.camera);
        }
      }, 100);
    },
    async dispose(context: AppContext) {
      state.unsubscribeConfig?.();
      state.unsubscribeConfig = null;
      disposePipeline(state);
      delete context.services.postfx;
    },
  };
};
