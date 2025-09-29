import * as THREE from "three/webgpu";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { hashBlur } from "three/examples/jsm/tsl/display/hashBlur.js";
import { chromaticAberration } from "three/examples/jsm/tsl/display/ChromaticAberrationNode.js";
import { anamorphic } from "three/examples/jsm/tsl/display/AnamorphicNode.js";
import { afterImage } from "three/examples/jsm/tsl/display/AfterImageNode.js";
import {
  clamp,
  float,
  Fn,
  mix,
  mrt,
  output,
  pass,
  smoothstep,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import type { ModuleInstance, TickInfo, AppContext, PostFxService } from "../config";
import type { AppConfig, PostFxConfig } from "../config";

interface PipelineNodes {
  blurAmount: ReturnType<typeof uniform>;
  blurIterations: ReturnType<typeof uniform>;
  focusCenter: ReturnType<typeof uniform>;
  focusInnerRadius: ReturnType<typeof uniform>;
  focusOuterRadius: ReturnType<typeof uniform>;
  chromaStrength: ReturnType<typeof uniform>;
  chromaScale: ReturnType<typeof uniform>;
  bloomEnabled: ReturnType<typeof uniform>;
  lensThreshold: ReturnType<typeof uniform>;
  lensStretch: ReturnType<typeof uniform>;
  lensIntensity: ReturnType<typeof uniform>;
  lensEnabled: ReturnType<typeof uniform>;
  temporalBlend: ReturnType<typeof uniform>;
}

interface PostfxState {
  scenePass: ReturnType<typeof pass> | null;
  bloomPass: ReturnType<typeof bloom> | null;
  lensPass: ReturnType<typeof anamorphic> | null;
  temporalNode: ReturnType<typeof afterImage> | null;
  pipeline: THREE.PostProcessing | null;
  stageHandle: { renderer: THREE.WebGPURenderer; scene: THREE.Scene; camera: THREE.Camera } | null;
  unsubscribeConfig: (() => void) | null;
  currentConfig: AppConfig["postfx"] | null;
  nodes: PipelineNodes | null;
}

const createPipeline = (
  renderer: THREE.WebGPURenderer,
  stage: { scene: THREE.Scene; camera: THREE.Camera }
) => {
  const scenePass = pass(stage.scene, stage.camera);
  scenePass.setMRT(
    mrt({
      output,
      bloomIntensity: float(0),
    })
  );

  const outputPass = scenePass.getTextureNode();
  const bloomIntensityPass = scenePass.getTextureNode("bloomIntensity");
  const blurAmount = uniform(0.04);
  const blurIterations = uniform(32);
  const focusCenter = uniform(new THREE.Vector2(0.5, 0.5));
  const focusInnerRadius = uniform(0.2);
  const focusOuterRadius = uniform(0.62);
  const chromaStrength = uniform(0.8);
  const chromaScale = uniform(1.1);
  const bloomEnabled = uniform(1);
  const lensThreshold = uniform(0.88);
  const lensStretch = uniform(2.4);
  const lensIntensity = uniform(0.25);
  const lensEnabled = uniform(1);
  const temporalBlend = uniform(0.5);

  const blurredScene = hashBlur(outputPass, blurAmount, { repeats: blurIterations });
  const uvNode = outputPass.uvNode || uv();
  const radialMask = smoothstep(
    focusInnerRadius,
    focusOuterRadius,
    uvNode.sub(focusCenter).length()
  );
  const focusComposite = mix(outputPass, blurredScene, radialMask);

  const chroma = chromaticAberration(
    focusComposite,
    radialMask.mul(chromaStrength),
    focusCenter,
    chromaScale
  );
  const bloomSource = focusComposite.mul(bloomIntensityPass);
  const bloomPass = bloom(bloomSource);
  const lensPass = anamorphic(focusComposite, lensThreshold, lensStretch, 48);
  lensPass.colorNode = vec3(0.85, 0.9, 1.0);

  const composite = Fn(() => {
    const focused = chroma.toVar();
    const bloomColor = bloomPass.rgb.mul(bloomEnabled).toVar();
    const lensColor = lensPass
      .getTextureNode()
      .rgb.mul(lensIntensity)
      .mul(lensEnabled)
      .toVar();
    const combined = focused.rgb.add(bloomColor).add(lensColor).clamp(0, 1);
    return vec4(combined, focused.a);
  });

  const compositeNode = composite();
  const temporalResolved = afterImage(compositeNode, 0.85);

  const outputNode = Fn(() => {
    const current = compositeNode.toVar();
    const temporal = temporalResolved.toVar();
    const mixed = mix(current, temporal, temporalBlend);
    const color = clamp(mixed.rgb, 0, 1);
    return vec4(color, current.a);
  })().renderOutput();

  const pipeline = new THREE.PostProcessing(renderer);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = outputNode;

  const nodes: PipelineNodes = {
    blurAmount,
    blurIterations,
    focusCenter,
    focusInnerRadius,
    focusOuterRadius,
    chromaStrength,
    chromaScale,
    bloomEnabled,
    lensThreshold,
    lensStretch,
    lensIntensity,
    lensEnabled,
    temporalBlend,
  };

  return {
    scenePass,
    bloomPass,
    lensPass,
    temporalNode: temporalResolved,
    pipeline,
    nodes,
  } as const;
};

const disposePipeline = (state: PostfxState) => {
  state.pipeline?.dispose();
  state.pipeline = null;
  state.scenePass = null;
  state.bloomPass?.dispose?.();
  state.bloomPass = null;
  state.lensPass?.dispose?.();
  state.lensPass = null;
  state.temporalNode?.dispose?.();
  state.temporalNode = null;
  state.stageHandle = null;
  state.nodes = null;
};

const applyConfig = (state: PostfxState, config: PostFxConfig) => {
  state.currentConfig = config;
  const nodes = state.nodes;
  if (!nodes || !state.bloomPass || !state.lensPass || !state.temporalNode) {
    return;
  }

  nodes.blurAmount.value = Math.max(0, config.blurStrength);
  nodes.blurIterations.value = Math.max(1, config.blurIterations);
  const centerX = Math.min(Math.max(config.focusCenter[0], 0), 1);
  const centerY = Math.min(Math.max(config.focusCenter[1], 0), 1);
  nodes.focusCenter.value.set(centerX, centerY);
  const innerRadius = Math.max(0, Math.min(config.focusInnerRadius, config.focusOuterRadius - 0.001));
  const outerRadius = Math.max(innerRadius + 0.001, config.focusOuterRadius);
  nodes.focusInnerRadius.value = innerRadius;
  nodes.focusOuterRadius.value = outerRadius;
  nodes.chromaStrength.value = Math.max(0, config.chromaticAberrationStrength);
  nodes.chromaScale.value = Math.max(0.5, config.chromaticAberrationScale);
  nodes.bloomEnabled.value = config.bloom ? 1 : 0;
  nodes.lensThreshold.value = config.lensStreakThreshold;
  nodes.lensStretch.value = config.lensStreakStretch;
  nodes.lensIntensity.value = Math.max(0, config.lensStreakIntensity);
  nodes.lensEnabled.value = config.lensStreaks ? 1 : 0;
  nodes.temporalBlend.value = config.temporalEnabled ? Math.min(Math.max(config.temporalBlend, 0), 1) : 0;

  state.bloomPass.threshold.value = config.bloomThreshold;
  state.bloomPass.strength.value = config.bloomStrength;
  state.bloomPass.radius.value = config.bloomRadius;

  state.lensPass.resolutionScale = 0.5;
  state.temporalNode.damp.value = Math.min(Math.max(config.temporalFeedback, 0), 0.98);
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
  state.lensPass = resources.lensPass;
  state.temporalNode = resources.temporalNode;
  state.pipeline = resources.pipeline;
  state.stageHandle = stage;
  state.nodes = resources.nodes;
  applyConfig(state, state.currentConfig ?? context.config.value.postfx);
  context.services.postfx = {
    pipeline: state.pipeline,
    bloomPass: state.bloomPass,
    scenePass: state.scenePass,
    lensPass: state.lensPass,
    temporalNode: state.temporalNode,
  } as PostFxService;
  return true;
};

export const createPostfxModule = (): ModuleInstance => {
  const id = "postfx";
  const state: PostfxState = {
    scenePass: null,
    bloomPass: null,
    lensPass: null,
    temporalNode: null,
    pipeline: null,
    stageHandle: null,
    unsubscribeConfig: null,
    currentConfig: null,
    nodes: null,
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
      tick.setRenderOverride(async () => {
        if (state.pipeline) {
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
