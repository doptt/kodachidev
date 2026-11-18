import { FileLoader } from 'three'
import type * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { trouble } from './trouble'

/**
 * three.js's KTX2Loader, with its transcoder workers started from a file of
 * the site's own, public/basis/ktx2-worker.js.
 *
 * As it comes, the loader builds its worker at run time, from a blob: URL, and
 * the Basis transcoder inside it compiles small functions from text. The
 * site's Content-Security-Policy forbids both. The worker file is the same
 * code put together ahead of time with the text-compiling parts replaced by
 * ordinary closures (assets-src/scripts/ktx2-worker.mjs makes it, and says
 * more): a plain same-origin script, which every browser will run under the
 * page's own policy.
 *
 * It replaces an earlier arrangement, a worker started from a file with a
 * looser policy of its own that then imported the loader's blob. Chrome took
 * that; Safari on the iPhone refused the import, and nothing drawn from a
 * KTX2 texture (the moon, the alien) ever appeared there.
 */
class HostedKTX2Loader extends KTX2Loader {
  /**
   * Rejects if a transcoder worker dies. three.js only listens for a worker's
   * answers: one that cannot start (a browser that will not let it run its
   * code, a file that did not arrive) leaves every texture waiting for ever,
   * and the scene that wanted them with it. Race a load against this.
   */
  readonly broken: Promise<never>
  private breakIt: (err: Error) => void = () => {}

  constructor() {
    super()
    this.broken = new Promise<never>((_, reject) => (this.breakIt = reject))
    // Nobody may be listening: that is not an error of its own
    this.broken.catch(() => {})
  }

  /** Fetches the transcoder's WebAssembly and says how workers are made. The JavaScript side is the worker file itself. */
  override init(): Promise<void> {
    if (this.transcoderPending) return this.transcoderPending
    const binary = new FileLoader(this.manager)
    binary.setPath(this.transcoderPath)
    binary.setResponseType('arraybuffer')
    binary.setWithCredentials(this.withCredentials)
    this.transcoderPending = binary.loadAsync('basis_transcoder.wasm').then((wasm) => {
      this.transcoderBinary = wasm as ArrayBuffer
      this.workerPool.setWorkerCreator(() => {
        const worker = new Worker(`${this.transcoderPath}ktx2-worker.js`)
        const died = (e: Event) => {
          const err = new Error(`the texture transcoder's worker failed${e instanceof ErrorEvent && e.message ? `: ${e.message}` : ''}`)
          trouble('ktx2', err)
          this.breakIt(err)
        }
        worker.addEventListener('error', died)
        worker.addEventListener('messageerror', died)
        const transcoderBinary = this.transcoderBinary!.slice(0)
        worker.postMessage({ type: 'init', config: this.workerConfig, transcoderBinary }, [transcoderBinary])
        return worker
      })
    })
    return this.transcoderPending
  }
}

/** A KTX2 loader for the site's own transcoder (public/basis/). Dispose of it when the files are in. */
export function createKTX2Loader(renderer: THREE.WebGLRenderer): KTX2Loader & { broken: Promise<never> } {
  return new HostedKTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(renderer) as HostedKTX2Loader
}
