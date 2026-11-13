"""Builds the background textures in public/bg from animatedbg.mp4.

  python dev/background.build-field.py

Outputs
  public/bg/still.webp, still-1280.webp   the hero frame (t=5.0s), for the <img> fallback
  public/bg/field.webp                                3840x3240 seamlessly tileable "field" for the shader
  public/bg/bloom.webp                                960x810 glow of the field's bright specks, added by the shader

The field is a 2x3 quilt of six different video frames (flipped/rotated so the
big bright swoosh never repeats in the same orientation). The hero frame sits
untouched in the top-left cell; the other tiles are upscaled ~20% so they overlap
their neighbours, and each seam is a minimum-cost path through the overlap
(Efros-Freeman image quilting) that hugs the dark regions, with a short feather.
Seams are also cut across the wrap-around edges, so the texture tiles with plain
GL_REPEAT: no mirror axes, no creases, no special-casing of the hero rectangle.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'animatedbg.mp4'
OUT = ROOT / 'public' / 'bg'
CELL_W, CELL_H = 1920, 1080
COLS, ROWS = 2, 3
OV = 160  # overlap (px) on each side of a non-hero tile
MARGIN = 72  # seams stay this far from the outer edge of the overlap (3 sigma of the widest blend band)
EDGE_BIAS = 0.0025  # mild preference for seams that hug already-placed content (keeps the hero intact)
DARK_BIAS = 0.35  # prefer cutting through dark pixels, where a mismatch is invisible
BANDS = (1.5, 4.0, 10.0, 24.0)  # Laplacian pyramid sigmas for the seam blend

# Video times (s) used for the five non-hero tiles; the hero is the frame at HERO_T.
HERO_T = 5.0
TILE_TIMES = {(0, 1): 0.5, (1, 0): 9.5, (1, 1): 2.5, (2, 0): 0.0, (2, 1): 7.5}
TRANSFORMS = ('id', 'flipH', 'flipV', 'rot180')


def ffmpeg() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


DENOISE_FRAMES = 5  # consecutive video frames averaged per still; the clip barely moves (<0.5/255 per frame)
FPS = 24
DURATION = 10.0


def single_frame(t: float) -> np.ndarray:
    tmp = OUT / f'_frame_{t:.3f}.png'
    subprocess.run([ffmpeg(), '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', str(VIDEO), '-frames:v', '1', str(tmp)], check=True)
    img = np.asarray(Image.open(tmp).convert('RGB')).astype(np.float32)
    tmp.unlink()
    return img


def frame_at(t: float) -> np.ndarray:
    """The frame at t with the codec noise averaged out: the mean of DENOISE_FRAMES
    neighbouring frames. Motion over that span is far below a pixel, so nothing smears,
    while the H.264 block noise (different in every frame) drops by about half."""
    half = DENOISE_FRAMES // 2
    last = DURATION - 2 / FPS
    start = min(max(t - half / FPS, 0.0), last - (DENOISE_FRAMES - 1) / FPS)
    acc = None
    for i in range(DENOISE_FRAMES):
        f = single_frame(start + i / FPS)
        acc = f if acc is None else acc + f
    return acc / DENOISE_FRAMES


def compose(a: str, b: str) -> str:
    """Transform group (Klein four-group): a after b."""
    bits = {'id': 0, 'flipH': 1, 'flipV': 2, 'rot180': 3}
    inv = {v: k for k, v in bits.items()}
    return inv[bits[a] ^ bits[b]]


def choose_transforms() -> dict[tuple[int, int], str]:
    """Assign a flip/rotation to every non-hero cell so that no two neighbours (including
    across the wrap) are mirror images of each other about their shared edge (that would
    recreate the MIRRORED_REPEAT crease), and identical orientations are kept apart."""
    import itertools

    cells = sorted(TILE_TIMES)
    best = None
    for combo in itertools.product(TRANSFORMS, repeat=len(cells)):
        t = dict(zip(cells, combo))
        t[(0, 0)] = 'id'
        score = 0
        for (r, c), tr in t.items():
            for dr, dc, mirror in ((0, 1, 'flipH'), (1, 0, 'flipV')):
                nb = t[((r + dr) % ROWS, (c + dc) % COLS)]
                if nb == compose(mirror, tr):
                    score += 1000  # hard: mirror symmetry across the edge
                if nb == tr:
                    score += 10  # soft: same orientation side by side
            for dr, dc in ((1, 1), (1, -1)):
                if t[((r + dr) % ROWS, (c + dc) % COLS)] == tr:
                    score += 3  # softer: same orientation diagonally
        score += 4 * sum(1 for (r, c), tr in t.items() if (r, c) != (0, 0) and tr == 'id')
        if best is None or score < best[0]:
            best = (score, t)
    assert best is not None and best[0] < 1000, 'no mirror-free assignment'
    return best[1]


def transform(img: np.ndarray, how: str) -> np.ndarray:
    if how == 'flipH':
        return img[:, ::-1]
    if how == 'flipV':
        return img[::-1]
    if how == 'rot180':
        return img[::-1, ::-1]
    return img


def upscale_to(img: np.ndarray, w: int, h: int) -> np.ndarray:
    """Uniform upscale then centre crop so the result is exactly w x h."""
    s = max(w / img.shape[1], h / img.shape[0])
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    pil = pil.resize((round(img.shape[1] * s), round(img.shape[0] * s)), Image.LANCZOS)
    a = np.asarray(pil).astype(np.float32)
    y0 = (a.shape[0] - h) // 2
    x0 = (a.shape[1] - w) // 2
    return a[y0 : y0 + h, x0 : x0 + w]


class Torus:
    """RGB canvas with wrap-around indexing."""

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.rgb = np.zeros((h, w, 3), np.float32)
        self.filled = np.zeros((h, w), bool)

    def idx(self, y0: int, x0: int, h: int, w: int):
        ys = np.arange(y0, y0 + h) % self.h
        xs = np.arange(x0, x0 + w) % self.w
        return np.ix_(ys, xs)

    def get(self, y0, x0, h, w):
        i = self.idx(y0, x0, h, w)
        return self.rgb[i], self.filled[i]

    def put(self, y0, x0, tile, alpha):
        i = self.idx(y0, x0, tile.shape[0], tile.shape[1])
        a = alpha[..., None]
        self.rgb[i] = self.rgb[i] * (1 - a) + tile * a
        self.filled[i] |= alpha > 0.5


def seam_vertical(cost: np.ndarray) -> np.ndarray:
    """Min-cost top-to-bottom path. cost is (h, w); returns x per row."""
    h, w = cost.shape
    M = cost.copy()
    back = np.zeros((h, w), np.int8)
    for y in range(1, h):
        prev = M[y - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        stacked = np.stack([left, prev, right])
        arg = stacked.argmin(axis=0)
        M[y] += stacked[arg, np.arange(w)]
        back[y] = arg - 1
    xs = np.zeros(h, int)
    xs[-1] = int(M[-1].argmin())
    for y in range(h - 1, 0, -1):
        xs[y - 1] = xs[y] + back[y, xs[y]]
    return xs


def band_cost(existing: np.ndarray, filled: np.ndarray, tile: np.ndarray, depth: np.ndarray) -> np.ndarray:
    diff = np.abs(existing - tile).mean(axis=2) / 255.0
    bright = np.maximum(existing.mean(axis=2), tile.mean(axis=2)) / 255.0
    cost = diff + DARK_BIAS * bright + EDGE_BIAS * depth
    # The seam must run where both images exist; unfilled canvas is off limits.
    return np.where(filled, cost, 1e3)


def gauss(a: np.ndarray, sigma: float) -> np.ndarray:
    """Approximate Gaussian blur (three box passes) of a float image, edge-replicated."""
    r = max(1, int(round((np.sqrt(4 * sigma * sigma + 1) - 1) / 2)))
    k = 2 * r + 1
    out = a.astype(np.float32)
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0)] * out.ndim
            pad[axis] = (r, r)
            p = np.pad(out, pad, mode='edge')
            c = np.cumsum(p, axis=axis, dtype=np.float64)
            zero = np.zeros_like(np.take(c, [0], axis=axis))
            c = np.concatenate([zero, c], axis=axis)
            n = c.shape[axis]
            out = ((np.take(c, range(k, n), axis=axis) - np.take(c, range(0, n - k), axis=axis)) / k).astype(np.float32)
    return out


def blend_multiband(existing: np.ndarray, tile: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Burt-Adelson blend: each frequency band crosses the seam over a width matching its
    scale, so brightness differences dissolve over ~100px while detail stays sharp."""
    m = mask.astype(np.float32)
    out = np.zeros_like(tile)
    prev_e, prev_t, prev_m = existing, tile, m
    for sigma in BANDS:
        e, t, mm = gauss(existing, sigma), gauss(tile, sigma), gauss(m, sigma)
        out += (prev_e - e) * (1 - prev_m)[..., None] + (prev_t - t) * prev_m[..., None]
        prev_e, prev_t, prev_m = e, t, mm
    out += prev_e * (1 - prev_m)[..., None] + prev_t * prev_m[..., None]
    return out


def place_tile(canvas: Torus, row: int, col: int, img: np.ndarray):
    """Place an upscaled tile with min-cut seams against everything already on the canvas."""
    H, W = CELL_H + 2 * OV, CELL_W + 2 * OV
    tile = upscale_to(img, W, H)
    y0, x0 = row * CELL_H - OV, col * CELL_W - OV
    existing, filled = canvas.get(y0, x0, H, W)
    mask = np.ones((H, W), bool)
    yy, xx = np.mgrid[0:H, 0:W]

    # The seam may wander from MARGIN inside the extended edge to OV inside the cell.
    lo, hi = MARGIN, 2 * OV
    bw = hi - lo

    # A band is only cut when the neighbour on that side really exists (checked on the
    # part of the band that lines up with this tile's own cell, not the corners).
    # Left band: tile owns x >= seam.
    if filled[OV : H - OV, :hi].any():
        depth = (bw - 1 - xx[:, :bw]).astype(np.float32) / bw  # deeper = further into existing content
        c = band_cost(existing[:, lo:hi], filled[:, lo:hi], tile[:, lo:hi], depth)
        xs = seam_vertical(c) + lo
        mask &= xx >= xs[:, None]
    # Right band: tile owns x <= seam.
    if filled[OV : H - OV, -hi:].any():
        depth = xx[:, :bw].astype(np.float32) / bw
        c = band_cost(existing[:, W - hi : W - lo], filled[:, W - hi : W - lo], tile[:, W - hi : W - lo], depth)
        xs = seam_vertical(c) + (W - hi)
        mask &= xx <= xs[:, None]
    # Top band: tile owns y >= seam.
    if filled[:hi, OV : W - OV].any():
        depth = (bw - 1 - yy[:bw]).astype(np.float32) / bw
        c = band_cost(existing[lo:hi], filled[lo:hi], tile[lo:hi], depth)
        ys = seam_vertical(c.T) + lo
        mask &= yy >= ys[None, :]
    # Bottom band: tile owns y <= seam.
    if filled[-hi:, OV : W - OV].any():
        depth = yy[:bw].astype(np.float32) / bw
        c = band_cost(existing[H - hi : H - lo], filled[H - hi : H - lo], tile[H - hi : H - lo], depth)
        ys = seam_vertical(c.T) + (H - hi)
        mask &= yy <= ys[None, :]

    # Unfilled canvas has no content to blend with: treat it as the tile itself.
    base = np.where(filled[..., None], existing, tile)
    blended = blend_multiband(base, tile, mask)
    # Write the tile's own cell, and neighbours' cells only past a seam against real content.
    # Never spill extended content into still-empty cells: a later tile could not reclaim
    # it and it would abut its neighbour with a hard edge.
    in_cell = (yy >= OV) & (yy < H - OV) & (xx >= OV) & (xx < W - OV)
    canvas.put(y0, x0, blended, (filled | in_cell).astype(np.float32))


def gauss_wrap(a: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur that wraps around the edges, so the result tiles like the field."""
    pad = int(sigma * 4) + 2
    p = np.pad(a, [(pad, pad), (pad, pad)] + [(0, 0)] * (a.ndim - 2), mode='wrap')
    return gauss(p, sigma)[pad:-pad, pad:-pad]


BLOOM_SCALE = 4  # bloom.webp is the field at 1/4 size; it only holds soft light
BLOOM_GAIN = 2.2  # stored brighter to use the 8-bit range; the shader sets the final strength


def bloom_map(field: np.ndarray) -> np.ndarray:
    """Light that the bright specks and thin highlights in the paint bleed into their
    surroundings: a bright pass on local contrast (small features that stand out from
    their neighbourhood, not the broad bright swells), blurred at two radii. Baked here
    because a real bloom needs the bright pass before the blur, which a single-pass
    shader cannot do; the shader just adds this map, warped along with the paint."""
    a = field / 255.0
    white = (a[..., 0] + a[..., 1]) * 0.5  # the specks are whiter than the blue paint
    local = white - gauss_wrap(white, 14.0)
    mask = np.clip((local - 0.05) / 0.11, 0.0, 1.0)
    mask = mask * mask * (3.0 - 2.0 * mask)
    src = a * mask[..., None]
    glow = 0.55 * gauss_wrap(src, 5.0) + 0.45 * gauss_wrap(src, 16.0)
    h, w = glow.shape[:2]
    small = glow.reshape(h // BLOOM_SCALE, BLOOM_SCALE, w // BLOOM_SCALE, BLOOM_SCALE, 3).mean(axis=(1, 3))
    return small * BLOOM_GAIN * 255.0


def save_webp(img: np.ndarray, path: Path, quality: int):
    Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8)).save(path, 'WEBP', quality=quality, method=6)
    print(f'{path.relative_to(ROOT)}  {img.shape[1]}x{img.shape[0]}  {path.stat().st_size / 1024:.0f} KB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    hero = frame_at(HERO_T)

    # Hero stills for the <img> fallback and reduced motion.
    save_webp(hero, OUT / 'still.webp', 95)
    small = np.asarray(Image.fromarray(hero.astype(np.uint8)).resize((1280, 720), Image.LANCZOS)).astype(np.float32)
    save_webp(small, OUT / 'still-1280.webp', 92)

    canvas = Torus(COLS * CELL_W, ROWS * CELL_H)
    canvas.put(0, 0, hero, np.ones((CELL_H, CELL_W), np.float32))
    transforms = choose_transforms()
    for (row, col), t in TILE_TIMES.items():
        how = transforms[(row, col)]
        print(f'tile ({row},{col}) t={t}s {how}', file=sys.stderr)
        place_tile(canvas, row, col, transform(frame_at(t), how))
    assert canvas.filled.all()

    field = canvas.rgb
    save_webp(field, OUT / 'field.webp', 95)
    save_webp(bloom_map(field), OUT / 'bloom.webp', 90)
    # Debug: hero-cell difference (should be only the seams in the outer OV px)
    changed = np.abs(field[:CELL_H, :CELL_W] - hero).mean(axis=2) > 1
    print(f'hero pixels touched by seams: {changed.mean() * 100:.2f}%')


if __name__ == '__main__':
    main()
