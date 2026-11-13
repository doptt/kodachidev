# The moon's textures

Everything in `public/moon/` is made by the two scripts in `assets-src/scripts/`: `moon.py` (NASA's images and some made-up ground, to PNG) and `moon.mjs` (PNG to KTX2). Nothing needs installing: the only tool is Binomial's Basis Universal encoder, as WebAssembly, run by Node.

## Sources

NASA material, in the public domain ("NASA material is not protected by copyright unless noted"). Credit lines as NASA asks for them:

| File (in `assets-src/raw/moon/`, not in git) | What | From | Credit |
| --- | --- | --- | --- |
| `lroc_color_poles_8k.tif` (8192 x 4096, 48 MB) | Colour of the Moon's surface | CGI Moon Kit, https://svs.gsfc.nasa.gov/4720 | NASA's Scientific Visualization Studio; LRO LROC WAC mosaic |
| `ldem_16_uint.tif` (5760 x 2880, 16-bit, 32 MB) | Elevation of the Moon's surface, 16 pixels a degree, in half metres | CGI Moon Kit, https://svs.gsfc.nasa.gov/4720 | NASA's Scientific Visualization Studio; LRO LOLA |
| `world.topo.bathy.200412.3x5400x2700.jpg` (2.4 MB) | The Earth by day, December, with topography and bathymetry | Blue Marble Next Generation, https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ | NASA Earth Observatory (Reto Stöckli) |
| `cloud_combined_2048.jpg` (optional) | Cloud cover | Blue Marble 2002, clouds, `https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg` | NASA Earth Observatory |

**The cloud map could not be fetched when this was made** (the `eoimages` host timed out and no copy was found on `assets.science.nasa.gov`). Without it, `moon.py` makes the cloud layer up: banded noise, heavier along the equator and the storm tracks. The Earth is a hundred or so pixels across, where this passes, but it is not NASA's. To use the real one, put `cloud_combined_2048.jpg` in `assets-src/raw/moon/` and run both steps again with `--only earth` and `--only earth-2k,earth-1k`.

The sky behind the moon is not made here: it is the cube map in `public/sky/` (`assets-src/scripts/sky.py`, see `README-sky.md`).

## What the scene needs from them

The moon is never seen whole. The camera sits a few metres from the alien's chair and the moon is a dome across the bottom half of the screen, three and a half to nine metres in radius depending on the shape of the screen (`radiusFor` in `src/moon/timeline.ts`). At that range NASA's global maps are a texel every five millimetres or so: enough for the broad tone of the ground, the seas and highlands as patches a stride across, and not for the ground at the scale of the chair. So the ground is three layers:

1. **NASA's maps over the whole ball** (`moon-color`, `moon-normal`): broad tone, and the broad lie of the land.
2. **The site** (`site`): one picture of the cap of the moon round the chair, made up at the scale of the chair: craters from a hand's width to a couple of metres, a line of boot prints leading to the chair, half-sunk stones, and **the shadows the low sun throws across all of it, baked in**. The sun does not move in the scene, so this is exact.
3. **The grain** (`moon-detail`): a tiling square of grit, pits and pebbles, laid over everything at two sizes.

Loose stones are meshes in the scene (`src/moon/rocks.ts`) and throw real shadows.

## Steps

```
python -P assets-src/scripts/moon.py --download    # fetch the sources, then make the PNGs (a couple of minutes)
node assets-src/scripts/moon.mjs                   # compress them to KTX2 (a couple of minutes)
```

`-P` keeps Python from importing anything that happens to sit beside the script or in the working directory. `--only moon,detail,site,earth` (Python) and `--only site-2k,earth-2k` (Node) redo part of it.

**Step 1, `moon.py`** (numpy and Pillow) writes PNGs to `assets-src/raw/moon/out/`:

- `moon-color-{4k,2k}.png`: the colour mosaic, resampled (Lanczos) to 4096 x 2048 and 2048 x 1024.
- `moon-normal-2k.png`: tangent-space normals (x east, y north, z up) from the elevation model, by central differences with the east-west step shrunk by the cosine of the latitude. Slopes are made three times steeper than life (`NORMAL_GAIN`).
- `site-{2k,1k}.png` (2048 and 1024 square): the site. A flat map of the cap, true to distance from the chair, reaching 64 degrees of arc from it (`SITE_REACH`), its columns running toward the sun so that a shadow is a matter of looking along a row. It is worked out at 4096 and halved. Red: in the sun (1) or in shadow (0). Green: lighter or darker dust. Blue and alpha: the normal. Seeded, so it comes out the same every time. **It is baked for the sun the scene has** (`SUN_ELEVATION`, `SUN_SWING`) and laid out by where the settled camera is: those numbers are repeated at the top of `moon.py` from `src/moon/config.ts` and must be changed in both.
- `moon-detail.png` (1024 square, tiles): the grain. Red and green: a normal. Blue: lighter or darker dust.
- `earth-{2k,1k}.png`: Blue Marble at 2048 x 1024 and 1024 x 512, with the cloud layer in the alpha channel (the scene samples it a second time, drifting).

**Step 2, `moon.mjs`** (sharp, and the encoder) writes `public/moon/*.ktx2`, each with a full mip chain:

- Colour maps (`moon-color-*`, `earth-*`): ETC1S, marked sRGB.
- Normals, the site and the grain: UASTC with rate-distortion optimisation and Zstandard, marked linear. ETC1S on normals shows its blocks as facets under a raking light, and would smear the site's four unrelated channels into each other.

The encoder is `basis_encoder.js` and `basis_encoder.wasm` from https://github.com/BinomialLLC/basis_universal (`webgl/encoder/build/`, Apache 2.0), saved in `assets-src/tools/basis_encoder/` (not in git) with the `.js` renamed to `.cjs`, because this package is an ES module and the encoder's loader is CommonJS:

```
mkdir -p assets-src/tools/basis_encoder && cd assets-src/tools/basis_encoder
curl -L -o basis_encoder.cjs  https://raw.githubusercontent.com/BinomialLLC/basis_universal/master/webgl/encoder/build/basis_encoder.js
curl -L -o basis_encoder.wasm https://raw.githubusercontent.com/BinomialLLC/basis_universal/master/webgl/encoder/build/basis_encoder.wasm
```

The browser decodes the files with three.js's `KTX2Loader`, whose transcoder (`basis_transcoder.js`, `basis_transcoder.wasm`) is copied from `node_modules/three/examples/jsm/libs/basis/` to `public/basis/`. Copy it again when three.js is upgraded.

## What ships, and what it costs

Which files a device fetches is decided in `src/moon/world.ts`: phones (a coarse pointer) and the lowest quality tier take the smaller of each pair.

| File | Size | Desktop | Phone | On the GPU |
| --- | --- | --- | --- | --- |
| `moon-color-4k.ktx2` | 1.42 MB | yes | | 11.2 MB (BC7) |
| `moon-color-2k.ktx2` | 0.37 MB | | yes | 1.4 MB (ETC2) |
| `moon-normal-2k.ktx2` | 2.40 MB | yes | yes | 2.8 MB |
| `site-2k.ktx2` | 3.88 MB | yes | | 5.6 MB |
| `site-1k.ktx2` | 1.18 MB | | yes | 1.4 MB |
| `moon-detail.ktx2` | 1.36 MB | yes | yes | 1.4 MB |
| `earth-2k.ktx2` | 0.57 MB | yes | | 2.8 MB |
| `earth-1k.ktx2` | 0.17 MB | | yes | 0.7 MB |
| `/sky/1024/*.webp` (six faces) | 1.19 MB | yes | | 24 MB (RGBA8, no mips) |
| `/sky/512/*.webp` | 0.23 MB | | yes | 6 MB |
| `/basis/` transcoder | 0.59 MB | yes | yes | |
| **Total** | | **11.4 MB** | **6.3 MB** | **about 48 MB / 14 MB** |

On top of the textures the scene holds a shadow map (4096 square on the top tier, 2048 on the rest: 64 MB or 16 MB) and its own drawing buffers (multisampled half-float colour and depth at the size of the canvas, plus a small bloom chain: about 125 MB at 1920 x 1080 with four samples, about 40 MB on a phone with two).
