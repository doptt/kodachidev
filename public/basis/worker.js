// The KTX2 transcoder's worker starts here, as a real file, so that it can be
// served with a Content-Security-Policy of its own (vercel.json).
//
// three.js builds the worker's code at run time and would start it from a blob
// URL. A blob worker inherits the page's policy, and the Basis transcoder's
// glue (Emscripten's embind) makes its functions with `new Function`, which the
// page's policy forbids. A worker started from a file answers to the policy
// that file is served with, so only this worker may do that, and the page's
// policy stays strict.
//
// The first message is the blob URL of the code three.js built; everything
// after is three.js talking to that code. See src/stage/ktx2.ts.
self.addEventListener('message', (event) => importScripts(event.data), { once: true })
