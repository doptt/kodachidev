/**
 * The stage: one canvas and one WebGL2 context for the whole site.
 *
 * Every 3D scene on the page (the purple field behind the first sections, the
 * black hole, the lensed sky, the moon) is a `StageScene` that draws into that
 * one canvas when it is the active scene. The canvas is fixed behind the page;
 * the sections themselves are ordinary DOM laid over it, and each tells the
 * stage when its scene should be showing.
 *
 * Rules every scene follows:
 *
 *  - It does not own the canvas or the context. It never calls getContext,
 *    never sets the canvas size or style, never loses the context on purpose.
 *  - `render` fills the whole drawing buffer of the default framebuffer with
 *    an opaque image (the canvas has no alpha). Whatever size it renders at
 *    internally is its own business; it works that out from the frame's size
 *    and the tier.
 *  - It assumes nothing about GL state on entry: another scene, or three.js,
 *    may have drawn the frame before. It binds its own VAO, program, textures
 *    and framebuffers and sets blend, depth, cull, scissor, colour mask and
 *    pixel-store state for itself. A scene drawn with three.js calls
 *    `renderer.resetState()` first. On exit the default framebuffer is bound.
 *  - It never blocks. Shaders are compiled in the background
 *    (KHR_parallel_shader_compile, or `renderer.compileAsync` in three.js) and
 *    `prepare` reports 'pending' until they are in. Textures and models are
 *    loaded asynchronously; a scene that is still loading says 'pending'.
 *  - It reads scroll, pointer targets and the like through whatever it was
 *    constructed with (closures). The stage only hands it time and size.
 */
import type { TierName } from '@/blackhole/quality'

export type StageFrame = {
  /** Seconds the stage has been running. Stops while the tab is hidden. */
  time: number
  /** Seconds since the previous frame, never more than 0.1. */
  dt: number
  /** Eased pointer position, -1..1 on both axes, y up. [0, 0] with no pointer, and under reduced motion. */
  pointer: readonly [number, number]
  /** Size of the drawing buffer the scene must fill, in pixels. */
  width: number
  height: number
  /** Size of the canvas in CSS pixels (for framing by aspect, and for placing DOM over the picture). */
  cssWidth: number
  cssHeight: number
  /** True under prefers-reduced-motion: draw a settled picture, nothing that moves on its own. */
  still: boolean
}

export type StageContext = {
  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement
  /** Name of the GPU, when the browser will say ('' otherwise). */
  gpu: string
  /** Quality tier picked for this device. A scene may run below it, never above. */
  tier: TierName
  /** Present when shaders can be compiled without blocking. */
  parallel: KHR_parallel_shader_compile | null
  /**
   * A three.js renderer on this same canvas and context, made the first time
   * it is asked for (three.js is not loaded until then). Scenes that use it
   * must not change its size, pixel ratio or output target permanently: set
   * what you need at the start of `render` and leave the default framebuffer
   * bound at the end.
   */
  three: () => Promise<import('three').WebGLRenderer>
}

export interface StageScene {
  /**
   * Called every frame until it says 'ready'. 'pending' while shaders compile
   * or assets load; 'failed' if the scene cannot run here (the section then
   * shows its fallback).
   */
  prepare(): 'pending' | 'ready' | 'failed'
  /** Draws one frame. Only called once `prepare` has said 'ready'. */
  render(frame: StageFrame): void
  /**
   * Called once, soon after the scene becomes ready, if it is not the scene on
   * screen: the chance to do the work a first frame costs (allocating render
   * targets, the driver's own compile of each shader on first use) ahead of
   * time, so that it does not land on the frame the scene first appears. It
   * must leave the default framebuffer's picture alone. Optional.
   */
  warm?(frame: StageFrame): void
  /** The quality tier changed (the frame rate could not hold). Optional. */
  setTier?(tier: TierName): void
  /** A line or two for the dev overlay and the screenshot scripts. Optional. */
  stats?(): Record<string, string | number>
  /** Frees every GPU object the scene made. The context itself stays. */
  dispose(): void
}

/** Makes a scene for a stage. May be async (to import its code and start its downloads). */
export type SceneFactory = (ctx: StageContext) => StageScene | Promise<StageScene>
