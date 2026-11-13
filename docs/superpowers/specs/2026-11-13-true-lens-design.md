# The projects sky with a true lens: design

Date: 2026-11-13. Status: awaiting the owner's approval. Nothing is built.

## Intent

The projects section (`src/lens/`, `src/sections/LensedWork.tsx`) shows each project as a picture hung on the sky behind a black hole. The owner wants the bending of light to be more accurate, and still wants a clean, distinctive way to show the work.

Today the bend is not accurate where it matters most. The true deflection is used only at the edge of the shadow; a few degrees above it the shader blends toward flat space and keeps 7% of the real bend (`LENS_FLOOR`, `uFloor`, `uReach`). That was done so a settled screenshot can be read. Two further things are not physical: light that has been round the hole is brightened by a fixed curve (`bent`), and the Einstein ring is drawn at the horizon, where the easing puts it, not where it really is.

## Goals

1. The lens is the real one at every pixel and at every moment. No easing.
2. A settled project is as readable as it is today: a flat, straight-edged picture.
3. The things a real lens does are visible and correct: the Einstein ring in its true place, a picture splitting into arcs as it passes behind the hole, mirrored images, stars brightening as they cross the ring.
4. The section still reads as one clean composition: hole below, picture above, words in the shadow.

## Non-goals

- The black hole scene (`src/blackhole/`) is not touched.
- The star layers, twinkle, drift and shooting stars keep their look. Two things about them do change: their brightness under the lens (section 6), and where they are aimed on the sky (section 9), because the camera now sees a different part of it.
- The line on the edge of the shadow stays as it is.
- The plain list for reduced motion and for devices without WebGL (`Flat`) is not touched.
- No redshift or blueshift. For a camera that hovers, it is the same factor over the whole sky, so leaving it out changes nothing but overall brightness.
- No spin (Kerr). The hole stays a Schwarzschild one.

## Anti-goals

- A screenshot that is warped while the visitor is trying to read it.
- A hole so small it stops being the subject of the scene.
- Any new place where the bend is adjusted by hand to look right.

## What the numbers say

Worked with the scene's own `geodesic.ts` (the scripts are throwaway; the figures are reproducible from `deflectionTable`, `lookup` and `imageAngle`). Angles are measured from the direction of the hole. The horizon is at r = 1.

| Camera radius | Shadow | Einstein ring | Where an ordinary picture would be squeezed by only 10% |
|---|---|---|---|
| 1.78 (today) | 75° | 89° | nowhere |
| 4 | 34° | 52° | nowhere |
| 8 | 18° | 34° | 110° |
| 20 | 7° | 20° | 61° |
| 40 | 4° | 14° | 41° |

Two conclusions:

- **Pulling the camera back does not buy readability.** By the time a 22° tall picture is squeezed less than about 20% at its near edge, the shadow is under 7° across its radius: a dot. And the picture is still fanned, about 0.8 along the line from the hole and 1.25 across it at its near edge.
- **The Einstein ring is well clear of the shadow**, by 14° to 17° at every height from 1.78 to 4 (less far out: 10° at radius 40). Today's scene draws the ring on the horizon. The true place is higher.

## Approaches considered

1. **Pull the camera far back and drop the easing.** This is what the owner picked in conversation, as "option 1". The numbers above rule out the far version of it: a dot of a hole, and a picture that is still fanned by a quarter.
2. **Keep today's scene and add a flat "reconstructed" card beside the lensed arcs.** Readable, but the readable picture is an overlay and not part of the sky.
3. **Keep the easing and only correct the brightness.** Leaves the main inaccuracy in place.
4. **Chosen: the true lens, a camera a little higher, and pictures painted on the sky so that the lens itself straightens them.** This is option 1 with the readability problem solved a different way. Described below.

Approach 4 is my call, made after the owner chose option 1 and the numbers showed its far version does not work. It keeps everything the owner chose: no easing, a curved limb, the ring, the arcs. It needs the owner's approval as a change to what was described.

## The design

### 1. The lens is always the true one

`uFloor`, `uReach`, `LENS_FLOOR`, `skyAngle`'s easing and the `squeeze` part of the timeline go. The sky direction of every ray is the table's deflection and nothing else.

### 2. Pictures are painted for the lens (anamorphosis)

Street painters draw stretched pictures that look right from one spot. This is the same thing done with gravity. A project's picture is painted on the sky already stretched, in exactly the shape that the real lens, seen from the camera's resting place, bends back into a flat rectangle. Nothing in the light's path is adjusted. When the project is settled the picture is exactly flat. Anywhere else it is bent, truthfully.

How a pixel finds its place in a picture:

1. The ray's true sky direction is known (as today).
2. Turn it back by however far that project is from its resting place on the sky.
3. Ask where the camera, at its resting height, would see that sky direction as a direct image. Rays stay in a plane through the hole, so this is one number: the inverse of the deflection table (`imageAngle` already computes it). It goes to the shader as a second small table, built once for the resting height and again only when the resting height or framing changes.
4. That gives a direction on the screen as it is at rest. Its position on the resting screen's own plane is the picture coordinate. (Today's code uses the plane square to the picture's centre, which leaves the picture a trapezoid, its top edge 9% longer than its bottom. Using the screen's plane makes it a true rectangle.)

Consequences, all wanted:

- At rest, step 3 undoes the lens exactly. The picture and its hairline are a flat rounded rectangle. The reviewer checked this against the shader: the sky direction is built in the ray's own plane through the vertical, the turn that carries a project is exactly zero through the hold, and the pointer's sway only turns the camera. The error from a table of 128 to 384 entries is under 0.03 of a pixel.
- The resting picture must lie wholly outside the Einstein ring. Inside the ring the sky is seen a second time, mirrored, and no painting can make that flat. The framing has to guarantee it.
- The patch of sky a picture is painted on is a fan: narrow near the point behind the hole, wide away from it. At radius 2.5 with the bottom edge of a 20° tall picture 4° above the ring, the patch is about 45° deep, 8° wide at its near end and 26° at its far end.
- During the last fall the picture's shape on the sky stays what it was. The lens changes under it, so the picture bends as the camera drops. That is correct, and it replaces `squeeze`.
- The last picture is still carried to the zenith during the fall (`lift`), so that it is what the sky closes on. It will arrive there as a tapered wedge and not a rectangle. This is my call; if it looks wrong, the alternative is to leave the picture where it is and let the lens sweep it into the closing rim.

### 3. The camera hovers a little higher

Radius about 2.5, up from 1.78. The limb of the shadow is visibly round, and the shadow still fills the bottom of the screen for the words. The exact value is tuned by eye between 1.78 and 4.

The distance from the top of the limb to the top of the picture is 40° to 46° at every height, because the ring always stands about 16° clear of the shadow. So the height changes the curve of the limb and the room for the words, and little else.

The scene opens at today's height, with today's flat horizon, and climbs to the resting height as the sky comes up. The join with the black hole section (black on black, the ring flaring first) is unchanged. The last fall starts from the resting height.

### 4. Framing

From the bottom of the screen up: the shadow with the words in it; a band about 16° deep between the limb and the ring; the ring; a small gap; the picture; room for the navigation.

- The picture's bottom edge sits a few degrees above the ring (start at 4°).
- **Something has to give on wide screens, and this is the biggest open choice.** The band and the gap take about 20° that today's framing does not spend. A wider field of view or a different height does not win it back. Either:
  - **the picture keeps today's size** (44% of the screen's height), and the shadow shrinks from the bottom 33% of the screen to about the bottom 19% at its centre, less toward the sides; or
  - **the shadow keeps today's size**, and the picture shrinks to about 30% of the screen's height, under half its area today.
- **My call: the picture keeps its size.** The section exists to show the work. The words then have less shadow to sit in; see section 7. The owner should check this one.
- On phones the picture's size holds either way, but its top edge moves up toward the navigation unless the limb drops there too. The limb drops.

### 5. What the visitor sees while scrolling

- **Settled.** The current project is flat above the ring. The next project is behind the hole and is the ring: a band of its own colours with its hairline on both sides, bending across the screen. The project after that is on the far side; its mirrored image is a thin sliver between the limb and the ring. (Today's scene describes the same three, with the ring in the wrong place.)
- **Scrolling on.** The settled picture rises and bends away as it leaves. The ring breaks: its upper part swells into an arc, the arc unrolls into the next picture and comes to rest flat. The sliver below moves up and becomes the new ring.
- **The mirrored image of the settled picture** is on the far side of the hole, below the bottom of the screen. It is not seen. I said otherwise in conversation; that was wrong for this framing.

The step between projects on the sky is derived from the framing: the next project sits at, or just past, the point behind the hole when the current one is settled, and neighbouring patches must not overlap on the sky. `THETA_STEP` stops being a fixed 92°. For the starting numbers above it lies between about 45° and 58°.

### 6. Brightness follows the lens

- **Pictures and the star map** are surfaces. A lens does not change how bright a surface looks, only how big. The `bent` boost comes off the pictures and the map.
- **The hairline** round a picture is a surface too, so it has one brightness everywhere. Today its glow is `0.55 + 3.2 * bent`; under the true lens a resting picture sits where `bent` is already on, so its frame would be nearly three times brighter at the bottom than at the top. The `bent` term goes. The hairline gets a single brightness, set high enough to bloom, so the ring's line glows as it does today and a resting picture's frame glows evenly with it. It is thinner than a pixel when squeezed and the existing code already dims it correctly then.
- **The drawn stars and shooting stars** are points. A lens makes a point brighter by exactly how much it enlarges the sky there. That factor is the solid angle of a pixel divided by the solid angle of sky it sees: the cross product of the derivatives of the ray's direction, over the cross product of the derivatives of the sky direction. (The pixel's solid angle, not its flat area: toward the corners of a wide screen a pixel covers a fifth of the angle it does at the centre.) It is capped (start at 12) so the ring does not blow out. It replaces both `bent` and the existing `keep = min(1, uPix / foot)` for the stars; multiplying them would dim squeezed stars twice.
- **Stars must cross the ring, not slide along it.** Stars flare as they cross the ring and are dimmer in the squeezed band under it. Today the stars drift about the scene's vertical turned by the scroll, which at the first project is the hole's own axis, so there they would slide along the ring and never cross it. The drift axis is tilted off the hole's axis by a fixed angle (start at 25°) so that stars cross the ring at every project.
- If the ring looks too plain without the old boost on the pictures, a single named constant may add glow back to the pictures in the ring. It defaults to none and is documented as the one artistic gain.

### 7. Words

Still at the bottom, one project's at a time, with the same content and the same accessibility. With the picture keeping its size, the shadow is a dome over about the bottom fifth of a wide screen, so the three-column row will be reworked: narrower, and allowed to reach up into the band under the ring, which is the dimmest part of the sky. The exact layout is decided against screenshots. If the words cannot be made to read cleanly there, the fallback is the other side of the choice in section 4: a smaller picture.

### 8. The harness

`/dev/lens.html` takes the camera radius, the gap above the ring and the picture height from the address bar, so the framing can be tuned without editing code. Development only.

### 9. Re-aiming the sky

At rest the top of the screen now looks at sky 112° from the zenith; today it looks at 65°. Two things were aimed for the old view and are re-aimed for the new one, with their look unchanged:

- `meteor()` starts its streaks 58° to 95° from the zenith. They would never be in frame.
- `GALAXY_RISE` puts the galaxy's centre 84° from the zenith. The band would no longer be behind the first picture.

## Constraints

- Hand-written WebGL2, no library, one fragment shader pass for the sky. No new render passes.
- Cost per pixel rises by one small table lookup per lit project (four) and a few multiplications. The scroll trace (`scripts/bh-scrolltrace.mjs`) must stay as it is today on every quality tier.
- `geodesic.ts` and `timeline.ts` stay pure, with no imports, so the tests can run them.
- Under reduced motion the scene is not shown at all (the flat list is), so nothing here needs a still variant.
- Commit only when the owner asks.

## Tests

All in `tests/lens.test.mjs` (`tests/timeline.test.mjs` is the black hole's):

- The existing tests of the eased lens, of `sources` with its fixed step, and of the framing's `horizon` are rewritten for the new behaviour. The pacing test that says the camera's radius never rises changes: it now rises through the intro and never rises after it.
- The inverse table undoes the deflection table: for image angles outside the ring, inverse(deflection(angle)) returns the angle to within a small tolerance, at radii 1.78, 2.5 and 4.
- A picture at rest is flat: for a grid of screen points inside the resting rectangle, the picture coordinate computed through the lens and back equals the flat coordinate.
- The framing never puts any part of the resting picture inside the ring, for aspects from 0.45 to 2.4.
- Neighbouring patches do not overlap on the sky.
- The existing tests of `settledAt`, `span` and `caption` still pass unchanged.

## How it is judged

By looking, with the owner. Stills from the harness and the real page at each settled project and halfway between, on a wide screen and a phone-shaped one, before and after. Then the scroll trace, the type check, the tests and the build.

## Left to the builder

- The resting radius, the gap above the ring, the picture height and the field of view, within the ranges above.
- The exact step between projects and when a leaving picture fades, so that only one readable picture is on screen at rest.
- How the picture's texture is filtered across the ring (the derivative has a seam there).
- How the star dots behave right at the ring, where the pixel-round correction has nothing to invert. Short arcs are acceptable; they are what a real star does there.
- Whether the widths of the glow on the shadow's edge need scaling to the smaller shadow.
- The layout of the words inside the dome.

## Not included

- **The second image showing an earlier version of the project.** I suggested it in conversation. It needs earlier screenshots of each project, which do not exist in the repo, and in this framing the second image of the settled picture is off screen. Dropped unless the owner wants it and has the pictures.

## Risks

- **The ring band may crowd the settled picture.** The next project's band reaches up toward the picture's bottom edge. The gap, the step and the band's brightness are the controls. If it cannot be made clean, the fallback is to hold the next project a little past the point behind the hole, so that most of its band is on the far side.
- **The look is unproven.** Every figure here is geometry. Nobody has seen it. The first step of the work is a rough version in the harness, shown to the owner before anything else is polished.
- **The last fall changes.** It was tuned with the eased lens. It needs retuning with the true one.
