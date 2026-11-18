// Builds public/basis/ktx2-worker.js: the worker three.js's KTX2Loader runs the
// Basis texture transcoder in, as one ordinary file that never builds code
// from strings.
//
//   node assets-src/scripts/ktx2-worker.mjs           writes the file
//   node assets-src/scripts/ktx2-worker.mjs --check   exits 1 if the file is out of date
//
// Why it exists. three.js makes this worker at run time: it glues the
// transcoder's JavaScript to its own worker code and starts the result from a
// blob: URL. And the transcoder (emscripten's embind) writes small functions
// as text and compiles them with `new Function`. The site's Content-Security-
// Policy allows neither, rightly. The first way round that started the worker
// from a file with a looser policy of its own and had it import the blob;
// Chrome accepted that, Safari on the iPhone did not ("NetworkError: Load
// failed"), and the moon never appeared there.
//
// So the same worker is put together here, once, ahead of time, with the two
// places that compile text replaced by plain closures that do the same thing
// (they are emscripten's own alternative, the one it emits when built with
// DYNAMIC_EXECUTION=0). The result is a same-origin script that needs nothing
// the page's own policy does not already allow, in any browser.
//
// Run it again after upgrading three: `npm test` fails until the file matches.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const three = path.join(root, 'node_modules/three')
const OUT = path.join(root, 'public/basis/ktx2-worker.js')

/** Replaces the one stretch of `text` that runs from `from` to `to` (inclusive). Throws unless it is there exactly once. */
function swap(text, from, to, replacement, what) {
  const start = text.indexOf(from)
  if (start < 0 || text.indexOf(from, start + 1) >= 0) throw new Error(`${what}: expected its start exactly once`)
  const end = text.indexOf(to, start)
  if (end < 0) throw new Error(`${what}: its end was not found`)
  return text.slice(0, start) + replacement + text.slice(end + to.length)
}

// A bound function's wrapper: converts the arguments, calls into the module, cleans up, converts the answer
const INVOKER = `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!")}var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=usesDestructorStack(argTypes);var returns=argTypes[0].name!=="void";var expected=argCount-2;var invokerFn=function(){if(arguments.length!==expected){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+expected)}var destructors=needsDestructorStack?[]:null;var wired=[cppTargetFunc];if(isClassMethodFunc){wired.push(argTypes[1]["toWireType"](destructors,this))}for(var i=0;i<expected;++i){wired.push(argTypes[i+2]["toWireType"](destructors,arguments[i]))}var rv=cppInvokerFunc.apply(null,wired);if(needsDestructorStack){runDestructors(destructors)}else{for(var j=isClassMethodFunc?1:2;j<argTypes.length;++j){if(argTypes[j].destructorFunction!==null){argTypes[j].destructorFunction(wired[isClassMethodFunc?j:j-1])}}}if(returns){return argTypes[0]["fromWireType"](rv)}};return createNamedFunction(humanName,invokerFn)}`

// The module calling a JavaScript function or constructor with arguments it has laid out in its memory
const CALLER = `var __emval_get_method_caller=(argCount,argTypes,kind)=>{var types=emval_lookupTypes(argCount,argTypes);var retType=types.shift();argCount--;var invokerFunction=function(obj,func,destructorsRef,args){var offset=0;var list=[];for(var i=0;i<argCount;++i){list.push(types[i].readValueFromPointer(args+offset));offset+=types[i]["argPackAdvance"]}var rv=kind===1?Reflect.construct(func,list):kind===0?func.apply(obj,list):func.call.apply(func,list);if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}};var functionName=\`methodCaller<(\${types.map(t=>t.name).join(", ")}) => \${retType.name}>\`;return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))};`

export async function build() {
  const version = JSON.parse(readFileSync(path.join(three, 'package.json'), 'utf8')).version
  let transcoder = readFileSync(path.join(three, 'examples/jsm/libs/basis/basis_transcoder.js'), 'utf8')
  transcoder = swap(transcoder, 'function craftInvokerFunction(', 'return createNamedFunction(humanName,invokerFn)}', INVOKER, 'craftInvokerFunction')
  transcoder = swap(transcoder, 'var __emval_get_method_caller=', 'return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))};', CALLER, '__emval_get_method_caller')
  if (/\bnew Function\b|newFunc\(Function|\beval\(/.test(transcoder)) throw new Error('the transcoder still compiles text somewhere: look for what is new in this version')

  // three.js's side of the worker, taken from the loader exactly as the loader itself takes it
  const { KTX2Loader } = await import(path.join(three, 'examples/jsm/loaders/KTX2Loader.js'))
  const fn = KTX2Loader.BasisWorker.toString()
  return [
    `// Generated by assets-src/scripts/ktx2-worker.mjs from three ${version}. Do not edit: run the script.`,
    '// The Basis transcoder and three.js\'s KTX2 worker in one file that compiles no text. See the script for why.',
    '/* constants */',
    'let _EngineFormat = ' + JSON.stringify(KTX2Loader.EngineFormat),
    'let _EngineType = ' + JSON.stringify(KTX2Loader.EngineType),
    'let _TranscoderFormat = ' + JSON.stringify(KTX2Loader.TranscoderFormat),
    'let _BasisFormat = ' + JSON.stringify(KTX2Loader.BasisFormat),
    '/* basis_transcoder.js */',
    transcoder,
    '/* worker */',
    fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}')),
    '',
  ].join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = await build()
  if (process.argv.includes('--check')) {
    let have = ''
    try {
      have = readFileSync(OUT, 'utf8')
    } catch {}
    if (have !== text) {
      console.error('public/basis/ktx2-worker.js is out of date: run node assets-src/scripts/ktx2-worker.mjs')
      process.exit(1)
    }
    console.log('public/basis/ktx2-worker.js is up to date')
  } else {
    writeFileSync(OUT, text)
    console.log(`wrote ${path.relative(root, OUT)} (${text.length} bytes)`)
  }
}
