import * as THREE from "three/webgpu";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
import { chromaticAberration } from "three/examples/jsm/tsl/display/ChromaticAberrationNode.js";
import { anamorphic } from "three/examples/jsm/tsl/display/AnamorphicNode.js";
import { afterImage } from "three/examples/jsm/tsl/display/AfterImageNode.js";
import { clamp, Fn, mix, pass, smoothstep, uniform, uv, vec3, vec4, float } from "three/tsl";
import type { ModuleInstance, TickInfo, AppContext, PostFxService, AppConfig, PostFxConfig } from "../app/appContext";

// Small builder helpers for clarity
const buildScenePass = (stage: { scene: THREE.Scene; camera: THREE.Camera }) => pass(stage.scene, stage.camera);

// Efficient dual Kawase blur approximation using gaussian blur
const buildEfficientBlur = (
  input: ReturnType<ReturnType<typeof pass>["getTextureNode"]>,
  strength: ReturnType<typeof uniform>,
  directionX: ReturnType<typeof uniform>,
  directionY: ReturnType<typeof uniform>
) => {
  // Single-pass efficient blur with directional control
  const blurredH = gaussianBlur(input, directionX.mul(strength));
  const blurredV = gaussianBlur(blurredH, directionY.mul(strength));
  return blurredV;
};

const buildFocusMask = (
  outputPass: ReturnType<ReturnType<typeof pass>["getTextureNode"]>,
  focusCenter: ReturnType<typeof uniform>,
  inner: ReturnType<typeof uniform>,
  outer: ReturnType<typeof uniform>,
  bias: ReturnType<typeof uniform>,
  blurStrength: ReturnType<typeof uniform>,
  blurDirectionX: ReturnType<typeof uniform>,
  blurDirectionY: ReturnType<typeof uniform>
) => {
  // Use efficient gaussian blur instead of expensive hash blur
  const blurred = buildEfficientBlur(outputPass, blurStrength, blurDirectionX, blurDirectionY);
  const uvNode = outputPass.uvNode || uv();
  const mask = smoothstep(inner, outer, uvNode.sub(focusCenter).length().pow(bias));
  const composite = mix(outputPass, blurred, mask);
  return { composite, mask } as const;
};

interface PipelineNodes {
  blurStrength: ReturnType<typeof uniform>;
  blurDirectionX: ReturnType<typeof uniform>;
  blurDirectionY: ReturnType<typeof uniform>;
  focusCenter: ReturnType<typeof uniform>;
  focusInnerRadius: ReturnType<typeof uniform>;
  focusOuterRadius: ReturnType<typeof uniform>;
  focusBias: ReturnType<typeof uniform>;
  chromaStrength: ReturnType<typeof uniform>;
  chromaScale: ReturnType<typeof uniform>;
  bloomEnabled: ReturnType<typeof uniform>;
  lensThreshold: ReturnType<typeof uniform>;
  lensStretch: ReturnType<typeof uniform>;
  lensIntensity: ReturnType<typeof uniform>;
  lensEnabled: ReturnType<typeof uniform>;
  temporalBlend: ReturnType<typeof uniform>;
  exposure: ReturnType<typeof uniform>;
  toneMapMode: ReturnType<typeof uniform>;
  // New visual enhancements
  vignetteStrength: ReturnType<typeof uniform>;
  vignetteRadius: ReturnType<typeof uniform>;
  vignetteSmoothness: ReturnType<typeof uniform>;
  filmGrainStrength: ReturnType<typeof uniform>;
  saturation: ReturnType<typeof uniform>;
  contrast: ReturnType<typeof uniform>;
  brightness: ReturnType<typeof uniform>;
  sharpenStrength: ReturnType<typeof uniform>;
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
  const scenePass = buildScenePass(stage);

  const outputPass = scenePass.getTextureNode();
  
  // Efficient blur controls (no iterations needed!)
  const blurStrength = uniform(2.0);  // Single strength value
  const blurDirectionX = uniform(1.0); // Horizontal direction
  const blurDirectionY = uniform(1.0); // Vertical direction
  
  const focusCenter = uniform(new THREE.Vector2(0.5, 0.5));
  const focusInnerRadius = uniform(0.2);
  const focusOuterRadius = uniform(0.62);
  const focusBias = uniform(1.0);
  const chromaStrength = uniform(0.8);
  const chromaScale = uniform(1.1);
  const bloomEnabled = uniform(1);
  const lensThreshold = uniform(0.88);
  const lensStretch = uniform(2.4);
  const lensIntensity = uniform(0.25);
  const lensEnabled = uniform(1);
  const temporalBlend = uniform(0.5);
  const exposure = uniform(1.0);
  // 0 = none, 1 = reinhard, 2 = filmic, 3 = aces
  const toneMapMode = uniform(1);
  
  // Visual enhancements
  const vignetteStrength = uniform(0.3);
  const vignetteRadius = uniform(0.75);
  const vignetteSmoothness = uniform(0.5);
  const filmGrainStrength = uniform(0.0);
  const saturation = uniform(1.0);
  const contrast = uniform(1.0);
  const brightness = uniform(0.0);
  const sharpenStrength = uniform(0.0);

  const { composite: focusComposite, mask: radialMask } = buildFocusMask(
    outputPass,
    focusCenter,
    focusInnerRadius,
    focusOuterRadius,
    focusBias,
    blurStrength,
    blurDirectionX,
    blurDirectionY
  );

  const chroma = chromaticAberration(
    focusComposite,
    radialMask.mul(chromaStrength),
    focusCenter,
    chromaScale
  );
  const bloomPass = bloom(focusComposite);
  const lensPass = anamorphic(focusComposite, lensThreshold, lensStretch, 48);
  lensPass.colorNode = vec3(0.85, 0.9, 1.0);

  // Enhanced tonemapping functions
  const applyTonemapping = Fn(([color, mode]) => {
    const c = color.toVar();
    // 0 = none
    const none = c;
    // 1 = reinhard
    const reinhard = c.div(c.add(vec3(1)));
    // 2 = filmic (John Hable's Uncharted 2 - simplified)
    const filmicHelper = Fn(([x]) => {
      const A = float(0.15);
      const B = float(0.50);
      const C = float(0.10);
      const D = float(0.20);
      const E = float(0.02);
      const F = float(0.30);
      return x.mul(x.mul(A).add(C.mul(B))).add(D.mul(E)).div(x.mul(x.mul(A).add(B)).add(D.mul(F))).sub(E.div(F));
    });
    const filmic = filmicHelper(c.mul(2.0)).div(filmicHelper(vec3(11.2)));
    // 3 = ACES approximation
    const aces = c.mul(c.mul(2.51).add(0.03)).div(c.mul(c.mul(2.43).add(0.59)).add(0.14)).clamp(0, 1);
    
    // Blend between modes
    const modeVal = mode.toVar();
    const step1 = mix(none, reinhard, clamp(modeVal, 0, 1));
    const step2 = mix(step1, filmic, clamp(modeVal.sub(1), 0, 1));
    const final = mix(step2, aces, clamp(modeVal.sub(2), 0, 1));
    return final;
  });

  // Film grain noise generator
  const filmGrain = Fn(([uvCoord, strength, time]) => {
    const x = uvCoord.x.mul(uvCoord.y).mul(time.mul(1000.0));
    const noise = x.sin().mul(43758.5453).fract();
    return noise.sub(0.5).mul(strength);
  });

  // Vignette effect
  const vignette = Fn(([uvCoord, strength, radius, smoothness]) => {
    const center = uvCoord.sub(vec3(0.5, 0.5, 0.0));
    const dist = center.length();
    const vig = smoothstep(radius, radius.sub(smoothness), dist);
    return mix(1.0, vig, strength);
  });

  // Color adjustments
  const adjustColor = Fn(([color, sat, cont, bright]) => {
    // Brightness
    const brightened = color.add(bright).toVar();
    // Contrast
    const contrasted = brightened.sub(0.5).mul(cont).add(0.5).toVar();
    // Saturation
    const gray = contrasted.dot(vec3(0.299, 0.587, 0.114));
    const saturated = mix(vec3(gray), contrasted, sat);
    return saturated;
  });

  // Note: Sharpen disabled for now due to complexity with TSL texture sampling
  // Can be re-enabled with proper texture node access patterns

  const composite = Fn(() => {
    const focused = chroma.toVar();
    const bloomColor = bloomPass.rgb.mul(bloomEnabled).toVar();
    const lensColor = lensPass
      .getTextureNode()
      .rgb.mul(lensIntensity)
      .mul(lensEnabled)
      .toVar();
    
    // Combine effects with exposure
    const combined = focused.rgb.add(bloomColor).add(lensColor).toVar();
    
    // Exposure (sharpen effect disabled for now)
    const exposed = combined.mul(exposure).toVar();
    
    // Tonemapping
    const mapped = applyTonemapping(exposed, toneMapMode).toVar();
    
    // Color adjustments
    const adjusted = adjustColor(mapped, saturation, contrast, brightness).toVar();
    
    // Film grain
    const uvNode = outputPass.uvNode || uv();
    const grain = filmGrain(uvNode, filmGrainStrength, float(0.0)).toVar();
    const grained = adjusted.add(grain).toVar();
    
    // Vignette
    const vigMask = vignette(uvNode, vignetteStrength, vignetteRadius, vignetteSmoothness).toVar();
    const vignetted = grained.mul(vigMask).toVar();
    
    const final = vignetted.clamp(0, 1);
    return vec4(final, focused.a);
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
    blurStrength,
    blurDirectionX,
    blurDirectionY,
    focusCenter,
    focusInnerRadius,
    focusOuterRadius,
    focusBias,
    chromaStrength,
    chromaScale,
    bloomEnabled,
    lensThreshold,
    lensStretch,
    lensIntensity,
    lensEnabled,
    temporalBlend,
    exposure,
    toneMapMode,
    vignetteStrength,
    vignetteRadius,
    vignetteSmoothness,
    filmGrainStrength,
    saturation,
    contrast,
    brightness,
    sharpenStrength,
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
  try {
    state.pipeline?.dispose();
  } catch (error) {
    console.warn("[PostFX] Error disposing pipeline:", error);
  }
  state.pipeline = null;
  state.scenePass = null;
  
  try {
    state.bloomPass?.dispose?.();
  } catch (error) {
    console.warn("[PostFX] Error disposing bloom:", error);
  }
  state.bloomPass = null;
  
  try {
    state.lensPass?.dispose?.();
  } catch (error) {
    console.warn("[PostFX] Error disposing lens:", error);
  }
  state.lensPass = null;
  
  try {
    state.temporalNode?.dispose?.();
  } catch (error) {
    console.warn("[PostFX] Error disposing temporal:", error);
  }
  state.temporalNode = null;
  
  state.stageHandle = null;
  state.nodes = null;
};

// Validate and clamp config values
const validateConfig = (config: PostFxConfig) => {
  const extended = config as PostFxConfig & Record<string, unknown>;
  return {
    ...config,
    blurStrength: Math.max(0, Math.min(10, config.blurStrength)),
    blurIterations: 1, // Not used anymore, always 1 pass
    focusCenter: [
      Math.max(0, Math.min(1, config.focusCenter[0])),
      Math.max(0, Math.min(1, config.focusCenter[1])),
    ] as [number, number],
    focusInnerRadius: Math.max(0, Math.min(1, config.focusInnerRadius)),
    focusOuterRadius: Math.max(0, Math.min(2, config.focusOuterRadius)),
    focusBias: Math.max(0.25, Math.min(4, config.focusBias ?? 1)),
    chromaticAberrationStrength: Math.max(0, Math.min(3, config.chromaticAberrationStrength)),
    chromaticAberrationScale: Math.max(0.5, Math.min(3, config.chromaticAberrationScale)),
    bloomThreshold: Math.max(0, Math.min(2, config.bloomThreshold)),
    bloomStrength: Math.max(0, Math.min(5, config.bloomStrength)),
    bloomRadius: Math.max(0, Math.min(2, config.bloomRadius)),
    lensStreakThreshold: Math.max(0, Math.min(1, config.lensStreakThreshold)),
    lensStreakStretch: Math.max(0.5, Math.min(10, config.lensStreakStretch)),
    lensStreakIntensity: Math.max(0, Math.min(3, config.lensStreakIntensity)),
    temporalBlend: Math.max(0, Math.min(1, config.temporalBlend)),
    temporalFeedback: Math.max(0, Math.min(0.98, config.temporalFeedback)),
    exposure: Math.max(0, Math.min(5, config.exposure ?? 1)),
    // Extended visual parameters
    vignetteStrength: Math.max(0, Math.min(1, extended.vignetteStrength as number ?? 0.3)),
    vignetteRadius: Math.max(0, Math.min(2, extended.vignetteRadius as number ?? 0.75)),
    vignetteSmoothness: Math.max(0, Math.min(1, extended.vignetteSmoothness as number ?? 0.5)),
    filmGrainStrength: Math.max(0, Math.min(1, extended.filmGrainStrength as number ?? 0)),
    saturation: Math.max(0, Math.min(2, extended.saturation as number ?? 1)),
    contrast: Math.max(0, Math.min(3, extended.contrast as number ?? 1)),
    brightness: Math.max(-0.5, Math.min(0.5, extended.brightness as number ?? 0)),
    sharpenStrength: Math.max(0, Math.min(1, extended.sharpenStrength as number ?? 0)),
  };
};

const applyConfig = (state: PostfxState, config: PostFxConfig) => {
  const validated = validateConfig(config);
  state.currentConfig = config;
  const nodes = state.nodes;
  if (!nodes || !state.bloomPass || !state.lensPass || !state.temporalNode) {
    return;
  }

  try {
    // New efficient blur - single strength parameter
    nodes.blurStrength.value = validated.blurStrength;
    nodes.blurDirectionX.value = 1.0;
    nodes.blurDirectionY.value = 1.0;
    nodes.focusCenter.value.set(validated.focusCenter[0], validated.focusCenter[1]);
    
    const innerRadius = Math.min(validated.focusInnerRadius, validated.focusOuterRadius - 0.001);
    const outerRadius = Math.max(innerRadius + 0.001, validated.focusOuterRadius);
    nodes.focusInnerRadius.value = innerRadius;
    nodes.focusOuterRadius.value = outerRadius;
    
    nodes.chromaStrength.value = validated.chromaticAberrationStrength;
    nodes.chromaScale.value = validated.chromaticAberrationScale;
    nodes.focusBias.value = validated.focusBias;
    nodes.bloomEnabled.value = validated.bloom ? 1 : 0;
    nodes.lensThreshold.value = validated.lensStreakThreshold;
    nodes.lensStretch.value = validated.lensStreakStretch;
    nodes.lensIntensity.value = validated.lensStreakIntensity;
    nodes.lensEnabled.value = validated.lensStreaks ? 1 : 0;
    nodes.temporalBlend.value = validated.temporalEnabled ? validated.temporalBlend : 0;
    nodes.exposure.value = validated.exposure;
    
    // Map tone mapping mode
    const toneMode: string = validated.toneMapping;
    const toneMapValue = 
      toneMode === "reinhard" ? 1 :
      toneMode === "filmic" ? 2 :
      toneMode === "aces" ? 3 : 0;
    nodes.toneMapMode.value = toneMapValue;
    
    // New visual parameters
    const extended = validated as PostFxConfig & Record<string, unknown>;
    nodes.vignetteStrength.value = extended.vignetteStrength as number ?? 0.3;
    nodes.vignetteRadius.value = extended.vignetteRadius as number ?? 0.75;
    nodes.vignetteSmoothness.value = extended.vignetteSmoothness as number ?? 0.5;
    nodes.filmGrainStrength.value = extended.filmGrainStrength as number ?? 0;
    nodes.saturation.value = extended.saturation as number ?? 1;
    nodes.contrast.value = extended.contrast as number ?? 1;
    nodes.brightness.value = extended.brightness as number ?? 0;
    nodes.sharpenStrength.value = extended.sharpenStrength as number ?? 0;

    state.bloomPass.threshold.value = validated.bloomThreshold;
    state.bloomPass.strength.value = validated.bloomStrength;
    state.bloomPass.radius.value = validated.bloomRadius;

    // Adaptive resolution scaling for lens effect (more aggressive for performance)
    state.lensPass.resolutionScale = 0.4;
    state.temporalNode.damp.value = validated.temporalFeedback;
  } catch (error) {
    console.warn("[PostFX] Error applying config:", error);
  }
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
  
  try {
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
  } catch (error) {
    console.error("[PostFX] Failed to create pipeline:", error);
    disposePipeline(state);
    delete context.services.postfx;
    return false;
  }
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
        const enabled = (tick.config.postfx as PostFxConfig).enabled !== false;
        if (state.pipeline && enabled) {
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
