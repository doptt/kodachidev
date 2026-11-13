import type * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

/**
 * three.js's KTX2Loader, with its transcoder workers started from a file
 * (public/basis/worker.js) and not from a blob URL.
 *
 * The Basis transcoder builds functions from strings as it starts up, which
 * the site's Content-Security-Policy forbids, and a blob worker lives under
 * the page's policy: on the deployed site every worker died with an EvalError
 * and no KTX2 texture ever arrived (the dev server sends no policy, so it only
 * showed there). A worker started from a file gets the policy that file is
 * served with; vercel.json gives worker.js one that allows it.
 */
class HostedKTX2Loader extends KTX2Loader {
  override init(): Promise<void> {
    if (this.transcoderPending) return this.transcoderPending
    const built = super.init()
    this.transcoderPending = built.then(() => {
      // super.init() has made the worker's code and left its blob URL here
      this.workerPool.setWorkerCreator(() => {
        const worker = new Worker(`${this.transcoderPath}worker.js`)
        worker.postMessage(this.workerSourceURL)
        const transcoderBinary = this.transcoderBinary!.slice(0)
        worker.postMessage({ type: 'init', config: this.workerConfig, transcoderBinary }, [transcoderBinary])
        return worker
      })
    })
    return this.transcoderPending
  }
}

/** A KTX2 loader for the site's own transcoder (public/basis/). Dispose of it when the files are in. */
export function createKTX2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  return new HostedKTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(renderer)
}
