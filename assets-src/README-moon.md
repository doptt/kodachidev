# The moon's textures

Everything in `public/moon/` is made by the two scripts in `assets-src/scripts/`: `moon.py` (NASA's images, three generated pictures of lunar ground and some ground made up in code, to PNG) and `moon.mjs` (PNG to KTX2). Nothing needs installing: the only tool is Binomial's Basis Universal encoder, as WebAssembly, run by Node.

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

Generated pictures, made with Higgsfield (model `gpt_image_2_6`); the prompt, settings, job id and cost of each are in `ASSET_LOG.md` under "The moon's ground". Nothing in them is NASA's.

| File (in `assets-src/raw/moon/hf/`, not in git) | What | Used for |
| --- | --- | --- |
| `site_height_4k.png` (2880 square) | A height map of about ten metres of cratered lunar ground, top-down: brightness is height, nothing in it is lit | The lie of the ground in the site |
| `tile_height_2k.png` (2048 square) | A height map of about two metres of pitted soil with pebbles | The tiling craters, and the smallest pits and stones of the grain |
| `tile_albedo_2k.png` (2048 square) | About a metre and a half of soil photographed top-down in flat, shadowless light | The grain: its tone, and its shape (read off the brightness) |

If they are gone, download them again from the job ids in the log, under these names; `moon.py` stops and says which is missing.

## What the scene needs from them

The moon is never seen whole. The camera sits a few metres from the alien's chair and the moon is a dome across the bottom half of the screen, three and a half to nine metres in radius depending on the shape of the screen (`radiusFor` in `src/moon/timeline.ts`). At that range NASA's global maps are a texel every five millimetres or so: enough for the broad tone of the ground, the seas and highlands as patches a stride across, and not for the ground at the scale of the chair. So the ground is four layers:

1. **NASA's maps over the whole ball** (`moon-color`, `moon-normal`): broad tone, and the broad lie of the land.
2. **The site** (`site`): one picture of the cap of the moon round the chair, at the scale of the chair: a generated crater field (old soft craters of every size, stones), and over it craters placed for the picture, a scatter of small sharp ones, a line of boot prints leading to the chair, half-sunk stones, and **the shadows the low sun throws across all of it, baked in**. The sun does not move in the scene, so this is exact. Nothing generated is lit: the shadows are worked out here from the heights.
3. **The craters** (`moon-craters`): a tiling square of clods, stones and craters up to half a metre, 4.6 m across in the scene. It is the ground's relief wherever the site does not reach (the half of the dome nearest the camera, and the limb); under the site it is held down.
4. **The grain** (`moon-detail`): a tiling square of grit, crumbs and pebbles, 1.3 m across in the scene, over everything. It comes round every few hundred pixels, so there is nothing in it big enough to be recognised.

The two tiling squares are not laid on NASA's map, whose north pole is just over the left edge of the settled picture (they used to pinch and fade there). The shader lays them on from three sides, along the moon's own axes, and mixes the three by which way the ground faces (`tiled` in `moon.frag.glsl`): three samples each.

Loose stones are meshes in the scene (`src/moon/rocks.ts`) and throw real shadows.

## Steps

```
python -P assets-src/scripts/moon.py --download    # fetch the sources, then make the PNGs (a couple of minutes)
node assets-src/scripts/moon.mjs                   # compress them to KTX2 (a couple of minutes)
```

`-P` keeps Python from importing anything that happens to sit beside the script or in the working directory. `--only moon,detail,site,earth` (Python) and `--only site-2k,earth-2k` (Node) redo part of it. `--site-work 2048` works the site out at half size: a quarter of a minute instead of two, rougher shadows, for trying a setting.

**Step 1, `moon.py`** (numpy and Pillow) writes PNGs to `assets-src/raw/moon/out/`:

- `moon-color-{4k,2k}.png`: the colour mosaic, resampled (Lanczos) to 4096 x 2048 and 2048 x 1024.
- `moon-normal-2k.png`: tangent-space normals (x east, y north, z up) from the elevation model, by central differences with the east-west step shrunk by the cosine of the latitude. Slopes are made three times steeper than life (`NORMAL_GAIN`).
- `site-{2k,1k}.png` (2048 and 1024 square): the site. A flat map of the cap, true to distance from the chair, reaching 64 degrees of arc from it (`SITE_REACH`), its columns running toward the sun so that a shadow is a matter of looking along a row. It is worked out at 4096 and halved. Red: in the sun (1) or in shadow (0), the edge of a shadow softer the further it is thrown. Green: lighter or darker dust (rims, thrown dust and stones paler, floors and hollows darker). Blue and alpha: the normal. Seeded, so it comes out the same every time. **It is baked for the sun the scene has** (`SUN_ELEVATION`, `SUN_SWING`) and laid out by where the settled camera is: those numbers are repeated at the top of `moon.py` from `src/moon/config.ts` and must be changed in both.
- `moon-detail.png` (1024 square, tiles): the grain. Red and green: a normal. Blue: lighter or darker dust. Alpha: the height itself (0.5 is level ground; the whole of 0..1 is `HEIGHT_SPAN` of the tile's width, 5/256 for the grain and 1/32 for the craters). Besides what is read off the generated pictures it has fine grit, pebbles and pits made in code, for hard edges at the size of a pixel.
- `moon-craters-{1k,512}.png` (tiles): the craters, stored the same way.

**The heights in alpha are not read by the scene yet.** They are there for the next step, which was planned and not started: a short march along the sun's direction in `moon.frag.glsl`, so that the tiled craters and the grain throw shadows of their own, as the site's baked ones do. Until then the tiles only brighten and darken the ground.

**How a generated height map becomes heights** (`relief` in `moon.py`). The generator draws a pit a hand wide and a crater two metres wide in the same depth of grey, which as plain height would make wells of the small ones. So the picture is split into bands by size and each band is scaled by the size of what it holds: a crater's depth is then about the same share of its width whatever its width. What is finer than a few pixels (the generator's noise, and a faint weave its upscaler leaves) and what is broader than the largest crater (its vignette) is dropped; the faint lumpiness between the craters is held down (`calm`), because under a low sun it is a rash of small shadows. The numbers in the calls (`gain`, `power`, `stones`, `calm`) were set by looking: each run prints the field's root-mean-square slope and how much of it is steeper than the sun's rays, which is a quick check that a change has not flattened it or turned it to rubble.

**How a generated picture is made to tile** (`tileable`). None of them tiles as it comes. Each is cross-faded, toward its edges, into a copy of itself slid half way round, along one axis and then the other, and the mix is rescaled so the faded bands keep their contrast.
- `earth-{2k,1k}.png`: Blue Marble at 2048 x 1024 and 1024 x 512, with the cloud layer in the alpha channel (the scene samples it a second time, drifting).

**Step 2, `moon.mjs`** (sharp, and the encoder) writes `public/moon/*.ktx2`, each with a full mip chain:

- Colour maps (`moon-color-*`, `earth-*`): ETC1S, marked sRGB.
- Normals, the site, the craters and the grain: UASTC with rate-distortion optimisation and Zstandard, marked linear. ETC1S on normals shows its blocks as facets under a raking light, and would smear the site's four unrelated channels into each other.

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
| `site-2k.ktx2` | 3.94 MB | yes | | 5.6 MB |
| `site-1k.ktx2` | 1.19 MB | | yes | 1.4 MB |
| `moon-craters-1k.ktx2` | 1.19 MB | yes | | 1.4 MB |
| `moon-craters-512.ktx2` | 0.30 MB | | yes | 0.35 MB |
| `moon-detail.ktx2` | 1.37 MB | yes | yes | 1.4 MB |
| `earth-2k.ktx2` | 0.57 MB | yes | | 2.8 MB |
| `earth-1k.ktx2` | 0.17 MB | | yes | 0.7 MB |
| `/sky/1024/*.webp` (six faces) | 1.19 MB | yes | | 24 MB (RGBA8, no mips) |
| `/sky/512/*.webp` | 0.23 MB | | yes | 6 MB |
| `/basis/` transcoder | 0.59 MB | yes | yes | |
| **Total** | | **12.7 MB** | **6.6 MB** | **about 49 MB / 14 MB** |

Before the ground was remade from generated pictures (git history has those files) the totals were 11.4 MB and 6.3 MB: `moon-craters` is new, `site` and `moon-detail` are within a few per cent of what they were.

On top of the textures the scene holds a shadow map (4096 square on the top tier, 2048 on the rest: 64 MB or 16 MB) and its own drawing buffers (multisampled half-float colour and depth at the size of the canvas, plus a small bloom chain: about 125 MB at 1920 x 1080 with four samples, about 40 MB on a phone with two).
