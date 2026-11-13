# assets-src: where the 3D assets come from

This folder holds everything needed to rebuild the alien in `public/models/`. Other scripts in `scripts/` (`moon.*`, `sky.py`) belong to the moon and the night sky and have their own notes (`README-moon.md`, `README-sky.md`).

| Path | What it is | In git |
| --- | --- | --- |
| `ASSET_LOG.md` | Every call to the generation service: prompt, model, settings, job id, cost | yes |
| `alien.config.json` | What `build-alien.mjs` builds: the mesh, the clips and their names, the texture format | yes |
| `alien.shape.json` | Corrections to the generated shape that the remesh and bake steps apply (the eyes) | yes |
| `reference/` | The picture the character was taken from and the four views the mesh was generated from | yes |
| `scripts/` | The pipeline (below) | yes |
| `raw/` | Downloads and intermediates: generated meshes, rig files, baked meshes, measurements | no |
| `tools/` | Portable command-line tools (`tools/ktx/`, the KTX-Software texture encoder) | no |

What ships:

| File | What | Size |
| --- | --- | --- |
| `public/models/alien.glb` | The alien in his hooded sweatshirt and shorts: one skinned mesh, 50,000 triangles, one skeleton with three extra bones in each antenna, seven clips, KTX2 textures (base colour, normal, metal-roughness), meshopt geometry | 5.0 MB |
| `public/models/alien.json` | The manifest the actor code reads: bones, clips, eye, mouth and antenna measurements, and notes on how the model is put together | 12 KB |

Loading `alien.glb` needs three's `GLTFLoader` with `MeshoptDecoder` and a `KTX2Loader` pointed at `public/basis/` (`src/alien/rig.ts` does this).

**Two aliens were made, and this is the second.** The first (round 1 in the log) was generated from an earlier reference picture, without clothes; the owner then supplied a new picture, and the character was generated again from it (round 2). The files of the first are in `raw/alien-v1/`. The sections below were written for the first and describe the method, which is the same for both; the numbers in them (triangle counts, file names under `raw/mesh/` and `raw/rig/`) are the first round's. For the shipped alien the inputs are the ones `alien.config.json` names, under `raw/r2/`, and the remesh and bake steps also take `--views` and `--shape` (see the header of each script). The agent that ran the pipeline was stopped before it wrote round 2 up, so check a command against the script's header before relying on it.

**Made but not shipped.** The pipeline also produced a copy of the alien with WebP textures, a lunar rover, a chair-webbing texture and two drink labels. Nothing on the site loads them (the props are built in code, in `src/alien/props/`), so they were moved out of `public/` into `raw/not-shipped/`, with their source images.

## Looking at a model

`dev/model-viewer.html` is a neutral turntable (its header comment lists the query parameters) and `scripts/model-shots.mjs` screenshots it on the real GPU:

```
node scripts/model-shots.mjs --src models/alien.glb --views front,three,left --focus head
node scripts/model-shots.mjs --src models/alien.glb --views 30:10 --clip sip --t 0,2,5 --query "fit=pose"
node scripts/model-shots.mjs --src models/alien.glb --views front,left --focus head --manifest models/alien.json
```

The last one draws the manifest's eye boxes and antenna points over the model, which is how they were checked. `python assets-src/scripts/sheet.py OUT.png A.png B.png …` pastes shots side by side.

## How the alien was made

1. **Reference views.** The original render was cropped to the alien and used as the reference for a front view (four variants, one chosen), then the chosen front view was the reference for back, left and right. They are in `reference/`.
2. **Mesh.** Two image-to-3D models were run on the four views and compared by eye. Hunyuan3D v3 won (`raw/mesh/a_hunyuan_raw.glb`, 500,000 triangles). The comparison is in the log.
3. **Clean mesh.** The service's remesher failed on it, so it is remeshed here:
   - `scripts/remesh.mjs` welds the surface by position, simplifies it to 40,000 triangles and gives it a new UV atlas.
   - `scripts/bake.mjs` paints that atlas from the dense mesh, then adds what the generator lost or got wrong: mottled skin (3D noise, so it has no seams), antennae that fade from green to yellow (they came out yellow all over), even glossy black eyes. It also measures the eyes and antennae and marks the antenna vertices.
4. **Rig and clips.** `scripts/reduce.mjs` made a plain 40,000-triangle copy of the dense mesh, which was uploaded and rigged six times, once per library clip (`raw/rig/*.glb`).
5. **Build.** `scripts/build-alien.mjs` reads `alien.config.json` and:
   - rebuilds the skeleton in metres from the first rig file (the service's files are in centimetres under a node scaled by 0.01),
   - retargets every clip onto that skeleton (each rig run fits the bones slightly differently) and moves each clip so its first key puts the hips on one shared point,
   - puts the clean mesh on the skeleton, taking each vertex's skin weights from the nearest part of the rigged mesh,
   - adds three bones to each antenna,
   - adds the authored `idle` clip (a held pose with breathing),
   - compresses geometry (meshopt) and textures (KTX2, or WebP with `--texture webp`).
6. **Manifest.** `scripts/make-manifest.mjs` writes `public/models/alien.json` from what the build measured.

## Rebuilding from the files in `raw/`

Run from the repo root. Nothing here costs credits.

```
node assets-src/scripts/remesh.mjs assets-src/raw/mesh/a_hunyuan_raw.glb assets-src/raw/mesh/a_clean40k.glb --triangles 40000 --error 0.02
node assets-src/scripts/bake.mjs assets-src/raw/mesh/a_hunyuan_raw.glb assets-src/raw/mesh/a_clean40k.glb assets-src/raw/mesh/a_baked.glb
node assets-src/scripts/build-alien.mjs --out public/models/alien.glb
node assets-src/scripts/make-manifest.mjs
```

`raw/` and `tools/` are not in git. If they are gone:

- **The generated files** can be downloaded again while the service keeps them: the log gives each job id and result file name. Save them under the names in the log (`raw/mesh/a_hunyuan_raw.glb`, `raw/rig/sip_343.glb` and so on).
- **The rig input**: `node assets-src/scripts/reduce.mjs assets-src/raw/mesh/a_hunyuan_raw.glb assets-src/raw/mesh/a_local40k.glb --triangles 40000 --texture 2048 --error 0.02`.
- **The KTX encoder**: download the Windows installer of KTX-Software 4.4.2 from its GitHub releases and unpack it with 7-Zip (do not run it) into `tools/ktx/unpacked/`, so that `tools/ktx/unpacked/bin/ktx.exe` exists. Or build with `--texture webp` and skip it.

## Changing things

| To change | Do this |
| --- | --- |
| Skin colour, mottling, antenna colours, eye gloss | Edit the "Repaint" section of `scripts/bake.mjs` (`TINT`, the noise amounts, the roughness values), then rerun from the bake step |
| Triangle count | `--triangles` on the remesh step, then rerun everything after it |
| Texture size or format | `textureSize`, `textureFormat` in `alien.config.json`, then the two build steps |
| A clip's name, or which clips ship | `clips` in `alien.config.json`; the `role` (`idle`, `sip`, `ambient`) decides where the manifest lists it |
| Add a library clip | Find its id with the service's animation search, run the rigging model on the same uploaded mesh with that id (8 credits; settings in the log, section 6), save the result in `raw/rig/`, add it to `clips`, rebuild. No other clip is disturbed: each one is retargeted on its own |
| The idle | `authored` in `alien.config.json`: `poseFrom` names the clip whose first key is held, `duration` is its length. The breathing amounts are in the "Authored clips" section of `scripts/build-alien.mjs` |
| The seat height the clips share | `hipsAnchor` in `alien.config.json` |
| Antenna bones | `antennae.segments` in `alien.config.json` |
| Swap the whole character | New reference views, a new dense mesh (log sections 1 to 3), then every step above. The rig must be run again on a simplified copy of the new mesh, because the bones are fitted to it |

## Known limits

- The hands have no finger bones: they are rigid and open.
- The clips are human motion on a body with a very large head. On the site they are not played: the actor seats and animates him itself (`src/alien/pose.ts`, `clips.ts`) and uses the model for its mesh, skeleton and measurements.
- The remeshed surface is irregular (triangles of uneven size). It shades and deforms cleanly but is not edit-friendly quad topology.
- The first alien had no normal map; the shipped one has one, baked from the dense mesh.
