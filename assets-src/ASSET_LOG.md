# Asset log: the alien

Every paid call made to produce `public/models/alien.glb`, in order, so any step can be rerun.
Credits are the generation service's credits. Hard cap for this job: **240** (account had 270 at the start).

## Quotes taken before the first paid call (cost-only preflight, nothing submitted)

| Step | Model | Settings | Credits |
| --- | --- | --- | --- |
| Image | `gpt_image_2_6` | 1k, 2:3, quality low | 0.25 |
| Image | `gpt_image_2_6` | 1k, 2:3, quality medium | 0.5 |
| Image | `gpt_image_2_6` | 1k, 2:3, quality high | 1.5 |
| Image | `gpt_image_2_6` | 2k, 2:3, quality high | 2.75 |
| Mesh A | `hunyuan3d_v3_image_to_3d` | PBR, Normal, 500k faces | 15 |
| Mesh A remesh | `meshy_v5_remesh` | quad, 40k, origin bottom | 6 |
| Mesh B | `meshy_multi_image_to_3d` | textured, PBR, quad, 40k, symmetry on, a-pose | 30 |
| Rig only | `3d_rigging` | height 1.2 | 5 |
| Rig + clip | `3d_rigging` | height 1.2, one animation | 8 |
| Prop mesh | `tripo_h3_1_image_to_3d` | defaults | 9 |

## Spend plan (made before the first paid call)

| Step | Credits |
| --- | --- |
| 4 front variants, high 1k | 6 |
| back, left, right, high 1k | 4.5 |
| allowance to regenerate drifting views | 4.5 |
| Mesh A (hunyuan + remesh) | 21 |
| Mesh B (meshy multi-image) | 30 |
| 4 rig + clip runs | 32 |
| reserve: one retry of the dearer mesh step | 30 |
| chair webbing + can label, high 1k | 3 |
| **Planned total** | **131** |

That leaves about 109 under the cap, so the optional table and rover (2 images + 2 prop meshes, about 21) stay possible but come last.

## Uploads (free)

| What | media id |
| --- | --- |
| The original render, re-encoded without metadata (`raw/ref/character_ref_full.jpg`) | `13af3e20-c0c4-49bf-95f3-5bcd40145b9b` |
| The same render cropped to the alien and enlarged 3x (`raw/ref/alien_crop.png`) | `8a67291a-1bc0-40aa-9924-624c53395531` |

## Calls

### 1. Front view, four variants

- Model `gpt_image_2_6`, aspect 2:3, quality high, resolution 1k (688x1024 out), count 4, references: the crop then the full render.
- Cost 6 (4 x 1.5). **Running total 6.**
- Prompt:

  > Character model sheet, FRONT VIEW only. The same cartoon green alien character as in the reference images: same rounded head shape, same very large glossy black almond eyes, same two thin antennae with small yellow-green ball tips, same two small nostrils and small closed mouth, same softly mottled green skin, same proportions (big head, thin neck, slim small body, long thin limbs, large bare feet) and the same laid-back personality. Remove the space suit, the chair and every prop: he wears nothing and has a smooth stylised featureless body with no anatomical detail at all, like a high-end collectible vinyl toy or an animated-film character. He stands upright facing the camera exactly straight on in a relaxed, perfectly symmetrical A-pose: arms straight and held about 30 degrees away from the body, hands open and relaxed with the fingers clearly separated and spread, exactly three fingers and one thumb on each hand, legs straight, feet shoulder-width apart and pointing forward, mouth closed, neutral calm expression, looking straight ahead. Orthographic-feeling camera at chest height with no perspective distortion. Flat, even, shadowless studio lighting: no cast shadows, no ground shadow, no rim light, no strong reflections in the eyes. Plain uniform light-grey background. No props, no text, no labels, no floor line. The whole body is in frame from the antenna tips to the toes with a clear margin all around. Clean 3D render in the same style as the reference.

| Variant | Job id | Verdict |
| --- | --- | --- |
| front_1 | `081f2b81-3ca8-45b9-a08f-f8ae39ec0db5` | **Chosen.** Stockiest body and limbs and the shortest antennae, which is closest to the original; 3 fingers + thumb on each hand, 4 toes on each foot |
| front_2 | `e6d3ded8-0469-4bb3-b269-f2580065ae1b` | Good, but thinner limbs and longer antennae than the original |
| front_3 | `35946498-c2d2-493b-9293-1787be28c865` | Rejected: black background with a yellow glow instead of flat grey |
| front_4 | `eff09d46-98bc-4ce1-8a90-71457090f6cd` | Good, but the thinnest limbs and the longest antennae |

Output URL pattern: `https://d8j0ntlcm91z4.cloudfront.net/<account>/hf_<date>_<time>_<job id>.png` (the chosen files are kept in `assets-src/reference/`).

### 2. Back, left and right views

- Model `gpt_image_2_6`, aspect 2:3, quality high, resolution 1k, count 1 each, references: the chosen front view (by job id) then the crop of the original.
- Cost 1.5 each, 4.5 in all. **Running total 10.5.**
- All three accepted on the first try: same proportions, antennae, skin and scale as the front view (head top and soles within about 1% of the frame height of each other).

| View | Job id |
| --- | --- |
| back | `c798d275-1ada-4a94-84d5-7bae3a49c604` |
| left (his left side, facing picture-left) | `060caca3-74d6-460c-9316-b9f7530178e1` |
| right (his right side, facing picture-right) | `80d7e90f-5762-4608-a0f9-d3e7ef35432b` |

- Back prompt:

  > Character model sheet, BACK VIEW only. Exactly the same green alien figure as in the first reference image (the front view), now seen from directly behind, camera rotated 180 degrees around him. Identical pose: the same relaxed symmetrical A-pose, arms straight and about 30 degrees away from the body, hands open with the fingers separated (three fingers and one thumb per hand), legs straight, feet shoulder-width apart. Identical proportions, identical scale and identical framing as the front view: the head, shoulders, hands and feet sit at the same heights in the frame, the antenna tips near the top and the heels near the bottom with the same margins. We see the smooth back of his large rounded head (no face, no eyes visible), the two thin antennae with small yellow ball tips rising from the top of the head, the back of the thin neck, a smooth featureless back and backside with no anatomical detail (like a vinyl toy), the backs of the arms and hands, the backs of the legs and the heels. Same softly mottled green skin. Orthographic-feeling camera at chest height, no perspective distortion. Flat, even, shadowless studio lighting, no cast shadows, no ground shadow. Plain uniform light-grey background identical to the reference. No props, no text. The second reference image only shows the original character for skin and head shape; ignore its clothes, chair and background.

- Left prompt (the right prompt is the same with LEFT/left swapped for RIGHT/right throughout):

  > Character model sheet, LEFT SIDE VIEW only (a true profile). Exactly the same green alien figure as in the first reference image (the front view), now seen exactly side-on from his own left side, camera rotated 90 degrees around him, so in this image he faces towards the LEFT edge of the picture and we see his left arm and left leg nearest to us. Identical pose: standing upright in the same relaxed A-pose, arms straight and about 30 degrees away from the body out to the sides (so from this side the near arm hangs in front of the torso silhouette, pointing down), hands open with the fingers separated (three fingers and one thumb per hand), legs straight and side by side, feet flat and pointing forward (towards the left of the picture). Identical proportions, identical scale and identical framing as the front view: the head, shoulders, hands and feet sit at the same heights in the frame, the antenna tips near the top and the soles near the bottom with the same margins. Profile of the large rounded head with the cranium extending back, one large glossy black almond eye seen from the side, small nostril, small closed mouth, neutral expression, thin neck, the two thin antennae with small yellow ball tips on top of the head, smooth featureless slim body with no anatomical detail (like a vinyl toy), a relaxed upright posture. Same softly mottled green skin. Orthographic-feeling camera at chest height, no perspective distortion. Flat, even, shadowless studio lighting, no cast shadows, no ground shadow. Plain uniform light-grey background identical to the reference. No props, no text. The second reference image only shows the original character for skin and head shape in three-quarter view; ignore its clothes, chair and background.

### 3. Mesh A: Hunyuan3D v3, four views

- Model `hunyuan3d_v3_image_to_3d`, `enable_pbr: true`, `generate_type: "Normal"`, `face_count: 500000`, views in the order front, back, left, right (the four job ids above, role `image_references`).
- Cost 19 (the single-view quote was 15; four views cost 19). **Running total 29.5.**
- Job id `db6b5ad7-1401-4865-b112-047c86203e35`.

### 4. Mesh B: Meshy multi-image

- Model `meshy_multi_image_to_3d` (the service reports it as `multi_image_to_3d`), `should_texture: true`, `enable_pbr: true`, `topology: "quad"`, `target_polycount: 40000`, `symmetry_mode: "on"`, `pose_mode: "a-pose"`, the same four views (role `image`).
- Cost 30. **Running total 59.5.**
- Job id `2baca486-860f-491f-9c36-64dff767dee1`.

Mesh A result: `https://d8j0ntlcm91z4.cloudfront.net/<account>/hf_20261112_220900_db6b5ad7-1401-4865-b112-047c86203e35.glb` (38 MB, 500,000 triangles, 4096 textures; kept as `raw/mesh/a_hunyuan_raw.glb`).
Mesh B result: `.../hf_20261112_220901_2baca486-860f-491f-9c36-64dff767dee1.glb` (7.8 MB, 71,008 triangles, 2048 textures; kept as `raw/mesh/b_meshy.glb`).

**Comparison (looked at in `dev/model-viewer.html`: front, three-quarter, side, back, head and hand close-ups). A won.**

| | A: Hunyuan3D v3 | B: Meshy multi-image |
| --- | --- | --- |
| Face and eyes | Soft, rounded features and sculpted eyelids, close to the original | Good, but harder brow lines read as a frown |
| Body | Stocky, like the reference view | Thinner torso and limbs |
| Antennae | Thick stalks, clean balls; painted yellow from root to tip (repainted later) | Thinner, green stalks with yellow balls |
| Hands | Three clean fingers and a thumb on each | A thin extra sliver of geometry between two fingers on each hand |
| Colour | Olive green, close to the original; the mottling was lost (added back later) | Neon lime green, far from the original |
| Topology and UVs | 500k triangles, atlas shattered into thousands of islands | 71k triangles, usable as it comes |

### 5. Remesh of A: failed twice, not charged

- Model `meshy_v5_remesh`, `topology: "quad"`, `target_polycount: 40000`, `origin_at: "bottom"`.
- Attempt 1, `model_url` = the Hunyuan result URL: job `d1b797e6-2d75-4ad5-a840-e5a722cbd7a5`, failed within seconds, no reason given.
- Attempt 2, `model_url` = a 200k-triangle, 2048-texture copy uploaded as a file (`media_upload` id `188008bb-7f2e-40bc-9909-fa44752a03b5`): job `c9db5b4b-4796-4172-b351-d30895e9357e`, failed the same way.
- Quoted 6 each; the balance did not move either time. **Running total still 59.5.**
- Replaced by a local remesh that costs nothing: `scripts/remesh.mjs` (weld by position, meshoptimizer simplify to 40,000 triangles, new UV atlas with xatlas) and `scripts/bake.mjs` (colour transferred from the 500k mesh by nearest surface point, then repainted). See the README.

### 6. Rig and clips

- Model `3d_rigging` (Meshy), `model_url` = `https://d2ol7oe51mr4n9.cloudfront.net/<account>/4bca4266-129e-435f-8138-e2a58b126ec3.glb`, which is `raw/mesh/a_local40k.glb` (mesh A simplified to 40,000 triangles by `scripts/reduce.mjs`) uploaded as a file, `height_meters: 1.2`, `enable_animation: true`, one `animation_action_id` per run.
- 8 credits per run, six runs, 48 in all. **Running total 107.5.**
- Clip ids chosen from `animation_actions` searches ("sit", and the categories Drinking, LookingAround, Idle) after looking at the preview GIFs (`raw/previews/`, contact sheets `sheet_a.png`, `sheet_b.png`, `idle_candidates.png`).

| Clip in the file | Library action | id | Job id | Result file |
| --- | --- | --- | --- | --- |
| `sip` | Sit_and_Drink | 343 | `1f56844d-e607-4fac-97ae-17c379c08ad7` | `raw/rig/sip_343.glb` (`hf_20261112_221839_<job>.glb`) |
| `crossLegged` | Sit_Cross_Legged | 362 | `a1b7f7f0-96b8-4d35-be01-8678878dbc78` | `raw/rig/crosslegged_362.glb` (`hf_20261112_222130_<job>.glb`) |
| `ponder` | Chair_Sit_Idle_F | 32 | `3a4eb6eb-db69-4f75-a1aa-b65e947e1911` | `raw/rig/chairidle_32.glb` (`hf_20261112_222131_<job>.glb`) |
| `stretch` | Sit_Hands_on_Head_Lean_Back | 356 | `d6160d40-49fa-43a4-abcc-6452532016f3` | `raw/rig/stretch_356.glb` (`hf_20261112_222133_<job>.glb`) |
| `cheers` | Sit_Thumbs_Up_Right | 357 | `5df3426e-e031-4d39-95aa-5bdd6a9399f9` | `raw/rig/thumbsup_357.glb` (`hf_20261112_222134_<job>.glb`) |
| `doze` | Sit_and_Doze_Off | 268 | `56569319-0741-4b1b-8240-2c837ec8cb18` | `raw/rig/doze_268.glb` (`hf_20261112_222135_<job>.glb`) |

Each run fits the skeleton afresh: the six files have the same 24 bones, but their rest poses differ by up to 8 mm and 10.6 degrees, so `scripts/build-alien.mjs` retargets every clip onto the first file's skeleton.

### 7. Prop textures

- Model `gpt_image_2_6`, quality high, resolution 1k, count 1, no reference images. 1.5 each, 3 in all. **Running total 110.5.**
- Chair webbing, aspect 1:1, job `c9cbb160-1fd9-4889-87e8-77697d92ceb0`:

  > Seamless tileable texture, flat top-down orthographic view of classic folding lawn chair webbing. Wide flat woven polypropylene straps in a plain over-under basket weave, vertical and horizontal straps of equal width packed edge to edge with no gaps. The straps are the classic vintage lawn chair colours: bright medium blue straps, kelly green straps and white straps, some straps with thin lengthwise stripes of the other colours. Fine woven fabric texture visible on every strap, very soft contact shading only where one strap passes under another. Flat even lighting, no perspective, no frame, no chair, no background showing through. The pattern fills the whole image edge to edge at a constant scale, about six straps across and six straps down, and repeats seamlessly on all four sides.

  It did not tile as generated. The shipped tile is the crop from pixel (170, 73) to (852, 737), four straps by four cut on strap edges, resized to 1024 square.

- Can label, aspect 16:9, job `50435d1f-7b3f-44db-b354-129eff95f78d`. The brand name VORPLE is made up; a web search found no beer, lager or brewery of that name.

  > Flat unwrapped label artwork for a 12 oz drinks can, for a completely fictional, invented beer brand called VORPLE. Full-bleed flat graphic design only: no can, no cylinder, no perspective, no shadows, no mock-up, no border. Wide rectangle that wraps once around the can, so the far left and far right edges are the same plain deep-blue background and join seamlessly. Retro space-age style in three flat colours: deep cobalt blue background, white, and a warm cream accent. In the centre a bold rounded white wordmark VORPLE with the smaller line LUNAR LAGER beneath it, above it a small simple emblem of a cratered moon with a ring and three little stars. Two thin white and cream horizontal pinstripes run around the whole label near the top and bottom edges. On the back panel area (towards the right) small tidy text: BREWED 384,400 KM FROM HOME and 12 FL OZ. Crisp vector-like print artwork, evenly lit, original design that does not resemble any existing brand.

  It came back with a soft glow around every shape. The shipped label is that image enlarged three times, each pixel snapped to the nearest of three flat colours (blue #122396, white, the site cream #FFEDC1), and reduced again.

### 8. Rover (optional prop)

- Reference image: `gpt_image_2_6`, aspect 4:3, quality high, 1k, job `15f3c7d7-757e-4ba7-bb19-24c3d8936d58`, 1.5. **Running total 112.**

  > A single small stylised lunar rover vehicle, in the look of a high-end animated film prop. An open-frame two-seat moon buggy of the classic 1970s style: a low flat aluminium chassis, four chunky wire-mesh wheels with orange-tan fenders, two simple low-backed seats, a round white high-gain dish antenna on a short mast at the front, a small box camera on a stalk, and gold-foil-wrapped equipment boxes at the back. No astronaut, no people, no flags, no logos, no text. Seen in a three-quarter front view from slightly above, the whole vehicle in frame with a clear margin. Flat, even studio lighting with no cast shadows, plain uniform light-grey background, no ground. Clean, simple, chunky shapes suitable for a small 3D model.

- Mesh: `tripo_h3_1_image_to_3d`, `face_limit: 20000`, `texture: true`, `pbr: true`, `texture_quality: "standard"`, `geometry_quality: "standard"`, that image as `image_references`. Job `89728d55-d4d6-4f11-803d-8e3b0670e9bf`, 9. **Running total 121.**
- Result `.../hf_20261112_224613_89728d55-d4d6-4f11-803d-8e3b0670e9bf.glb` (4.4 MB, 18,899 triangles; kept as `raw/props/rover_raw.glb`).

The table was not generated: a round top on four legs is quicker and cleaner to build in code.

## Totals

| | Credits |
| --- | --- |
| Reference images (4 front, back, left, right) | 10.5 |
| Mesh A (Hunyuan3D v3, four views) | 19 |
| Mesh B (Meshy multi-image) | 30 |
| Remesh (failed twice, not charged) | 0 |
| Rig and clips (6 runs) | 48 |
| Prop textures (2 images) | 3 |
| Rover (1 image, 1 mesh) | 10.5 |
| **Spent** | **121** |
| Cap | 240 |
| Balance at the start | 270 |
| **Balance at the end (read from the service)** | **149** |

Everything above is round 1: the first alien, bright green and unclothed, made from `Alienchairref.jpg`. The owner replaced the character, so its shipped files, meshes and reference views now live in `raw/alien-v1/`. Its six rig files (`raw/rig/*.glb`) are still in use: round 2 takes its clips from them.

# Round 2: the alien from the owner's new picture

The new reference is `reference/character-v2-source.jpg` (1408 x 768): a grey-green alien in a slate-blue hooded sweatshirt and olive-khaki shorts, reclined in a lawn chair with a steel mug. Hard cap for this round: **100** credits (the account had 149 at its start).

## Spend plan (made before the first paid call of the round)

| Step | Credits |
| --- | --- |
| 2 front variants, high, 2k | 5.5 |
| back, left, right, high, 2k | 8.25 |
| Mesh, Hunyuan3D v3, four views | 19 |
| Rig, one run | 5 to 8 |
| Mug label image | 1.5 |
| reserve: one retry of the mesh, and of two views | 24.5 |
| **Planned total, reserve included** | **about 67** |

No clips are bought: the six from round 1 are retargeted onto the new skeleton.

## Uploads (free)

| What | media id |
| --- | --- |
| The new picture, re-encoded without metadata (`reference/character-v2-source.jpg`) | `0b8f33cd-4fb6-4ef2-a1cf-c383a76f2f58` |
| The same cropped to the alien and enlarged 3x (`raw/r2/ref/crop.png`) | `05309525-e2e1-43d1-9c46-707ce386b01e` |

## Calls

### R2.1 Front view, two variants

- Model `gpt_image_2_6`, aspect 2:3, quality high, resolution 2k (1360 x 2048 out), count 2, references: the crop then the full picture.
- Quoted 5.5, cost 5.5. **Round 2 running total 5.5.**
- Prompt:

  > Character model sheet, FRONT VIEW only, of exactly the same alien as in the reference images, reproduced as faithfully as possible. Same skin: muted grey-green sage with subtle soft mottling, matte, not bright green. Same head: a tall, smooth, egg-shaped cranium that is widest high up and tapers to a narrow chin, a short slender neck. Same face: very large glossy black almond-shaped eyes set wide and slanted, with a slightly paler raised rim around each eye, two small nose slits, a thin straight closed mouth, no ears, calm neutral expression. Same antennae: two short, thin stalks rising from the top of the head and leaning slightly outwards, each ending in a small rounded tip, in the same grey-green as the skin. Same clothes: a slate-blue cotton hooded sweatshirt with the hood down behind the neck, two off-white drawstrings hanging from the collar, a kangaroo pocket, ribbed cuffs and hem, and a small plain rectangular woven patch on the left chest with no readable text on it; olive-khaki cotton shorts ending above the knee. Bare legs and bare feet with long toes with rounded tips. Long thin hands with four long fingers and a thumb. He stands upright facing the camera exactly straight on in a relaxed, perfectly symmetrical A-pose: arms straight and held about 30 degrees away from the body, hands open and relaxed with the fingers clearly separated, legs straight, feet shoulder-width apart and pointing forward, looking straight ahead. Orthographic-feeling camera at chest height with no perspective distortion. Flat, even, shadowless studio lighting: no cast shadows, no ground shadow, no rim light, no strong reflections in the eyes. Plain uniform light-grey background. No chair, no mug, no props, no text, no labels, no floor line. The whole body is in frame from the antenna tips to the toes with a clear margin all around. Photorealistic render with the same realistic skin and fabric detail as the reference.

| Variant | Job id | Verdict |
| --- | --- | --- |
| front_1 | `499f11a4-c1a8-473d-a999-f578194672be` | **Chosen.** Taller, more egg-shaped cranium and narrower chin, greyer sage skin, shorter antennae: each of those is closer to the picture |
| front_2 | `8bc35f00-77b4-4319-a548-db60eb1bc0c7` | Rounder, wider head, paler and greener skin, longer and pinker antennae |

### R2.2 Back, left and right views

- Model `gpt_image_2_6`, aspect 2:3, quality high, resolution 2k, count 1 each, references: the chosen front view (by job id) then the crop of the picture.
- 2.75 each (the same single-image 2k quote as round 1), 8.25 in all. **Round 2 running total 13.75.**
- All three accepted on the first try. The side views came out a shade paler and greener than the front; proportions, clothes, antennae and scale agree.

| View | Job id |
| --- | --- |
| back | `eca2a251-da53-4584-85b3-363664541e08` |
| left (his left side, facing picture-left) | `d11aec6e-feab-4567-a179-6b1a547dd6ab` |
| right (his right side, facing picture-right) | `6013a801-f1b5-44ab-ae32-8d5ad2976fbf` |

- Back prompt:

  > Character model sheet, BACK VIEW only. Exactly the same clothed alien figure as in the first reference image (the front view), now seen from directly behind, camera rotated 180 degrees around him. Identical pose: the same relaxed symmetrical A-pose, arms straight and about 30 degrees away from the body, hands open and relaxed with the fingers separated (four long fingers and a thumb per hand), legs straight, bare feet shoulder-width apart. Identical proportions, identical scale and identical framing as the front view: the head, shoulders, hands, hem and feet sit at the same heights in the frame, the antenna tips near the top and the heels near the bottom with the same margins. We see the smooth back of his tall egg-shaped cranium (no face, no eyes visible), the two short thin antennae with small rounded tips on top of the head, the back of the slender neck, the empty hood of the slate-blue sweatshirt lying flat down his upper back, the back of the sweatshirt with its ribbed hem and cuffs, the back of the olive-khaki shorts with two plain back pockets, the backs of the bare legs, the heels. Same muted grey-green sage skin with subtle mottling, same fabric textures. Orthographic-feeling camera at chest height, no perspective distortion. Flat, even, shadowless studio lighting, no cast shadows, no ground shadow. Plain uniform light-grey background identical to the reference. No props, no text, no logos. Photorealistic render matching the front view. The second reference image only shows the original character for skin, head shape and clothes; ignore its chair, mug, pose and background.

- Left prompt (the right prompt is the same with LEFT/left swapped for RIGHT/right throughout):

  > Character model sheet, LEFT SIDE VIEW only (a true profile). Exactly the same clothed alien figure as in the first reference image (the front view), now seen exactly side-on from his own left side, camera rotated 90 degrees around him, so in this image he faces towards the LEFT edge of the picture and we see his left arm and left leg nearest to us. Identical pose: standing upright in the same relaxed A-pose, arms straight and about 30 degrees away from the body out to the sides (so from this side the near arm hangs in front of the torso silhouette, pointing down), hands open and relaxed with the fingers separated (four long fingers and a thumb per hand), legs straight and side by side, bare feet flat and pointing forward (towards the left of the picture). Identical proportions, identical scale and identical framing as the front view: the head, shoulders, hands, hem and feet sit at the same heights in the frame, the antenna tips near the top and the soles near the bottom with the same margins. Profile of the tall egg-shaped cranium extending back, one very large glossy black almond eye with its paler rim seen from the side, small nose slit, thin closed mouth, narrow chin, slender neck, the two short thin antennae with small rounded tips on top of the head. The slate-blue hooded sweatshirt in profile with the empty hood lying behind the neck, a drawstring hanging at the front, ribbed cuff and hem; the olive-khaki shorts; bare legs; long toes. Upright relaxed posture. Same muted grey-green sage skin with subtle mottling, same fabric textures. Orthographic-feeling camera at chest height, no perspective distortion. Flat, even, shadowless studio lighting, no cast shadows, no ground shadow. Plain uniform light-grey background identical to the reference. No props, no text. Photorealistic render matching the front view. The second reference image only shows the original character for skin, head shape in three-quarter view and clothes; ignore its chair, mug, pose and background.

### R2.3 Mesh: Hunyuan3D v3, four views

- Model `hunyuan3d_v3_image_to_3d`, `enable_pbr: true`, `generate_type: "Normal"`, `face_count: 500000`, views in the order front, back, left, right (the four job ids above, role `image_references`).
- Quoted 19, cost 19. **Round 2 running total 32.75** (balance read back as 116.25 = 149 - 32.75).
- Job id `fa495d69-b567-4e30-8782-e1a0fef5a124`.

