# The night sky

`public/sky/<size>/{px,nx,py,ny,pz,nz}.webp` are cube maps of the whole night sky, in three sizes. Two scenes use them. The lensed sky after the fall (`src/lens/renderer.ts`) downloads one set, by quality tier, and bends it: every ray that escapes the hole looks up the map in the direction it ends up pointing. The moon (`src/moon/assets.ts`) uses a set as the plain sky behind it.

(The script was written for a rewrite of the black hole scene that the owner did not want and that was removed. The black hole itself draws no sky.)

## Source and licence

- **NASA/Goddard Space Flight Center Scientific Visualization Studio, "Deep Star Maps 2020"**, <https://svs.gsfc.nasa.gov/4851>. By Ernie Wright. Star positions and brightnesses from Hipparcos-2, Tycho-2 and Gaia DR2 (1.7 billion stars), the Milky Way's glow from the same Gaia data.
- File used: `starmap_2020_16k_gal.exr` (16384 x 8192, galactic coordinates, linear light, 384 MB): <https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_16k_gal.exr>
- **Public domain.** NASA's media are not copyrighted; the Studio asks for the credit "NASA/Goddard Space Flight Center Scientific Visualization Studio" and, for this map, an acknowledgement of Gaia DR2 (ESA/Gaia/DPAC), Hipparcos-2 and Tycho-2. Nothing here implies NASA's endorsement.

## Rebuilding

```sh
mkdir -p assets-src/raw/sky
curl -o assets-src/raw/sky/starmap_2020_16k_gal.exr \
  https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_16k_gal.exr
python -I assets-src/scripts/sky.py
```

Needs ffmpeg (with its EXR decoder) on the PATH, and Python with numpy and Pillow. It takes about two minutes and writes a 1.6 GB intermediate (`.f32`, raw floats) beside the EXR; both are under `assets-src/raw`, which is not in git. Delete the `.f32` afterwards.

What the script does, in order:

1. ffmpeg decodes the EXR to raw 32-bit floats. The map is linear light, 0 to 1 (the brightest stars are clipped at 1; the median is about 0.004).
2. Each cube face is resampled from the equirectangular map at 4096 x 4096, four bilinear samples to a texel.
3. The 2048, 1024 and 512 sets are made from that by averaging 2 x 2 blocks, in linear light, so a star keeps its total light as it shrinks.
4. Each face is stored through a **cube root** in 8 bits and written as WebP (quality 80 to 90, higher for the smaller sets). The shader cubes what it reads (`stored * stored * stored` in `src/lens/shaders/lens.frag.glsl`). The curve is there to spend the 8 bits where the sky is: the median of the map lands on code 41, and one code is a step of about 7% there, which is under one step of the display once the scene has graded it.

## Layout

- Axes: **+X is the galactic centre, +Y the north galactic pole, +Z is galactic longitude 270**. Right-handed, so the sky is not mirrored. How the map is turned against the lensed sky is worked out where `GALAXY_RISE` is used in `src/lens/renderer.ts`.
- Faces follow the OpenGL cube-map convention, with the first row of each image at t = 0: they are uploaded as they are, with no flip, no colour management and no premultiplication (`loadSky` and `uploadSky` in `src/lens/renderer.ts`).

## Sizes

| Set | Download | GPU memory with mips | Used by |
| --- | --- | --- | --- |
| 512 | 0.22 MB | 8 MB | the moon on small tiers (the lensed sky took it on the `low` tier until it was seen to come out in blocks on a phone; every tier now takes 1024 or more) |
| 1024 | 1.13 MB | 32 MB | lensed sky on `medium`; the moon |
| 2048 | 4.20 MB | 128 MB | lensed sky on `high` and `ultra` (desktop) |

Which set the lensed sky takes is `SKY_SIZE` in `src/lens/renderer.ts`; the moon's is in `src/moon/assets.ts`.

The script also builds a 4096 set (12.5 MB, 512 MB of GPU memory). Nothing uses it, so it is not in `public/`: it was moved to `assets-src/raw/sky-4096/`, which is not in git. Run the script with `--sizes 4096,2048,1024,512` to make it again.
