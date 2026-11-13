"""
Step 1 of the moon's texture pipeline: NASA's source images -> the PNGs that
step 2 (moon.mjs) compresses to KTX2. See assets-src/README-moon.md.

    python -P assets-src/scripts/moon.py [--download] [--raw assets-src/raw/moon] [--only moon,detail,site,earth]

Reads from --raw, writes PNGs to <raw>/out. Needs numpy and Pillow. Everything
it makes is deterministic: the procedural parts are seeded.

What it makes:

  moon-color-{4k,2k}.png   LROC WAC colour mosaic, resampled
  moon-normal-2k.png       tangent-space normals from the LOLA elevation model
                           (x east, y north, z up), slopes exaggerated by NORMAL_GAIN
  moon-detail.png          1024x1024, tiles: rg = fine-grain normal, b = albedo variation
  site-{2k,1k}.png         the ground round the chair, made up: craters, boot prints
                           and stones, with the sun's shadows baked in.
                           r = in the sun or not, g = albedo variation, b a = normal
  earth-{2k,1k}.png        Blue Marble, with the cloud map in the alpha channel
"""
import argparse
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SOURCES = {
    # NASA SVS CGI Moon Kit, https://svs.gsfc.nasa.gov/4720 (public domain)
    'lroc_color_poles_8k.tif': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_8k.tif',
    'ldem_16_uint.tif': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif',
    # NASA Earth Observatory, Blue Marble Next Generation with topography and bathymetry, December (public domain)
    'world.topo.bathy.200412.3x5400x2700.jpg': 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x5400x2700.jpg',
    # NASA Earth Observatory, Blue Marble 2002 cloud layer (public domain). Optional: without it the clouds are made up.
    'cloud_combined_2048.jpg': 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg',
}

MOON_RADIUS_M = 1737400.0
# How much steeper than life the baked slopes are. On a moon a few metres across the real ones would not show at all.
NORMAL_GAIN = 3.0

# The scene the ground round the chair is baked for. These repeat src/moon/config.ts: keep the two in step.
SITE_REACH = math.radians(64)      # how far round from the chair the picture reaches, as arc
SITE_RADIUS = 4.2                  # a middling radius for the moon on a wide screen, metres: sizes in site() are for it
SUN_ELEVATION = math.radians(22)   # the sun's height over the chair
SUN_SWING = math.radians(38)       # how far round from the camera's right, toward the camera, the sun is


def download(raw):
    os.makedirs(raw, exist_ok=True)
    for name, url in SOURCES.items():
        path = os.path.join(raw, name)
        if os.path.exists(path) and os.path.getsize(path) > 100000:
            continue
        print('downloading', url)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=120) as res, open(path, 'wb') as f:
                while chunk := res.read(1 << 20):
                    f.write(chunk)
        except Exception as err:  # the cloud map's host is often unreachable; everything else is required
            print('  failed:', err)


def save(arr, path):
    Image.fromarray(arr).save(path, optimize=False, compress_level=3)
    print('wrote', path, arr.shape)


def as_image(arr):
    return Image.fromarray(np.ascontiguousarray(arr, dtype=np.float32), mode='F')


def resize_f(arr, size, how=Image.LANCZOS):
    """Resamples a float image (Lanczos low-passes when shrinking)."""
    return np.asarray(as_image(arr).resize(size, how), dtype=np.float32)


def moon(raw, out):
    colour = Image.open(os.path.join(raw, 'lroc_color_poles_8k.tif')).convert('RGB')
    for name, size in (('4k', (4096, 2048)), ('2k', (2048, 1024))):
        colour.resize(size, Image.LANCZOS).save(os.path.join(out, f'moon-color-{name}.png'), compress_level=3)
        print('wrote', f'moon-color-{name}.png')

    # Elevation, in half metres above a reference sphere
    dem = np.asarray(Image.open(os.path.join(raw, 'ldem_16_uint.tif')), dtype=np.float32) * 0.5
    print('elevation model', dem.shape, 'range (m)', float(dem.min()), float(dem.max()))
    w, h = 2048, 1024
    z = resize_f(dem, (w, h))
    lat = (0.5 - (np.arange(h) + 0.5) / h) * math.pi
    # Metres per texel. East-west shrinks with latitude; held off zero so the poles do not blow up.
    dx = 2 * math.pi * MOON_RADIUS_M * np.maximum(np.cos(lat), 0.03)[:, None] / w
    dy = math.pi * MOON_RADIUS_M / h
    east = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) / (2 * dx)
    zp = np.pad(z, ((1, 1), (0, 0)), mode='edge')
    north = (zp[:-2] - zp[2:]) / (2 * dy)
    n = np.stack([-east * NORMAL_GAIN, -north * NORMAL_GAIN, np.ones_like(z)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    save(np.round((n * 0.5 + 0.5) * 255).astype(np.uint8), os.path.join(out, 'moon-normal-2k.png'))


def spectral_noise(rng, n, beta, lo=1.0, hi=None):
    """Tileable noise with a 1/f^beta amplitude spectrum, between `lo` and `hi` cycles per tile. Zero mean, unit variance."""
    f = np.fft.fftfreq(n) * n
    r = np.hypot(f[:, None], f[None, :])
    amp = np.where(r >= lo, np.maximum(r, 1e-6) ** -beta, 0.0)
    if hi is not None:
        amp *= np.exp(-((r / hi) ** 4))
    spec = amp * np.exp(2j * math.pi * rng.random((n, n)))
    z = np.fft.ifft2(spec).real
    return (z - z.mean()) / z.std()


def stamp(z, cx, cy, r, shape):
    """Adds `shape(d)` (d = distance from the centre in radii) into z around (cx, cy), wrapping at the edges."""
    n = z.shape[0]
    reach = int(math.ceil(r * 2.2))
    ys = np.arange(int(cy) - reach, int(cy) + reach + 1)
    xs = np.arange(int(cx) - reach, int(cx) + reach + 1)
    d = np.hypot((xs[None, :] - cx), (ys[:, None] - cy)) / r
    z[np.ix_(ys % n, xs % n)] += shape(d)


def detail(out):
    """
    The fine grain of the ground: a square of dust that tiles, a couple of
    metres across in the scene. Nothing in it is big enough to be recognised
    when it comes round again: grit, pits and pebbles a finger or two wide.
    """
    n = 1024
    rng = np.random.default_rng(4720)
    z = np.zeros((n, n), dtype=np.float64)
    # Heights are in texels throughout, so slopes come out as they are drawn
    z += 1.6 * spectral_noise(rng, n, 1.5, lo=3, hi=60)
    z += 0.7 * spectral_noise(rng, n, 0.5, lo=60, hi=400)

    def pit(depth):
        return lambda d: depth * (np.where(d < 1.0, d * d - 1.0, 0.0) + 0.3 * np.exp(-(((d - 1.02) / 0.22) ** 2)))

    for _ in range(520):
        r = 2.5 * (1.0 - rng.random()) ** -0.5
        if r > 16:
            continue
        stamp(z, rng.random() * n, rng.random() * n, r, pit(0.38 * r ** 0.9))
    for _ in range(1500):
        r = 1.4 + 3.6 * rng.random() ** 3
        height = r * (0.5 + 0.5 * rng.random())
        stamp(z, rng.random() * n, rng.random() * n, r, lambda d, k=height: k * np.clip(1.15 - d * d, 0.0, 0.8))

    dx = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) * 0.5
    dy = (np.roll(z, 1, axis=0) - np.roll(z, -1, axis=0)) * 0.5
    nrm = np.stack([-dx, -dy, np.ones_like(z)], axis=-1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    tone = 0.5 + 0.13 * spectral_noise(rng, n, 1.0, lo=3, hi=300) - 0.05 * np.clip(dx, -1.5, 1.5)
    rgb = np.stack([nrm[..., 0] * 0.5 + 0.5, nrm[..., 1] * 0.5 + 0.5, np.clip(tone, 0, 1)], axis=-1)
    save(np.round(rgb * 255).astype(np.uint8), os.path.join(out, 'moon-detail.png'))


def site(out):
    """
    The ground round the chair, at the scale of the chair: craters from a
    hand's width to a couple of metres, a line of boot prints leading to the
    chair, small stones, and the shadows the low sun throws across all of it.

    The picture is a map of the cap of the moon round the chair, laid out flat
    with distance from the chair kept true (so the chair is its centre and its
    edge is SITE_REACH away). Its columns run toward the sun, which makes a
    shadow a matter of looking along a row. Places are given in metres to the
    settled camera's right and toward the camera, as the picture is composed.
    """
    n = 4096
    rng = np.random.default_rng(1969)
    half = SITE_REACH * SITE_RADIUS            # metres from the chair to the edge of the picture
    scale = n / (2 * half)                     # texels per metre
    # Camera-right and toward-camera, written in the picture's axes (u toward the sun, v a quarter turn on from it)
    right = (math.cos(SUN_SWING), math.sin(SUN_SWING))
    toward = (math.sin(SUN_SWING), -math.cos(SUN_SWING))

    def at(r, c):
        """Texel of the place r metres to camera-right of the chair and c metres toward the camera."""
        return (n / 2 + (r * right[0] + c * toward[0]) * scale, n / 2 + (r * right[1] + c * toward[1]) * scale)

    z = np.zeros((n, n), dtype=np.float32)     # height in metres
    tone = np.zeros((n, n), dtype=np.float32)  # lighter (+) or darker (-) dust

    def add(target, cx, cy, r, shape):
        """Like stamp(), without wrapping: adds shape(d) into target round (cx, cy), r in texels."""
        reach = int(math.ceil(r * 2.6))
        x0, x1 = max(0, int(cx) - reach), min(n, int(cx) + reach + 1)
        y0, y1 = max(0, int(cy) - reach), min(n, int(cy) + reach + 1)
        if x0 >= x1 or y0 >= y1:
            return
        d = np.hypot(np.arange(x0, x1)[None, :] - cx, np.arange(y0, y1)[:, None] - cy) / r
        target[y0:y1, x0:x1] += shape(d).astype(np.float32)

    def crater(r, c, radius, depth=None, fresh=0.0):
        """A bowl with a raised rim, radius in metres. A fresh one has thrown lighter dust round itself."""
        cx, cy = at(r, c)
        deep = depth if depth is not None else 0.36 * radius
        add(z, cx, cy, radius * scale, lambda d: deep * (np.where(d < 1.0, d * d - 1.0, 0.0) + 0.22 * np.exp(-(((d - 1.05) / 0.28) ** 2))))
        add(tone, cx, cy, radius * scale, lambda d: -0.1 * np.exp(-((d / 0.75) ** 2)) + fresh * np.exp(-(((d - 1.25) / 0.5) ** 2)))

    # Rolling ground: slow swells, then the lumpiness of dust that has been pelted for ever
    z += 0.012 * resize_f(spectral_noise(rng, 1024, 2.0, lo=2, hi=24), (n, n), Image.BICUBIC)
    z += 0.004 * resize_f(spectral_noise(rng, 2048, 1.2, lo=20, hi=240), (n, n), Image.BICUBIC)

    # A few craters placed for the picture: two big shallow ones to the right, as in the reference, one off in the dark to the left
    crater(3.1, 1.2, 0.95, depth=0.2, fresh=0.05)
    crater(2.2, -1.7, 0.6, depth=0.14)
    crater(-3.3, 1.4, 0.75, depth=0.17)
    crater(-1.5, 2.9, 0.34, fresh=0.08)
    crater(1.2, 2.2, 0.22, fresh=0.1)
    # And the rest wherever they fall: many small, few large, none under the chair
    made = 0
    while made < 520:
        r, c = (rng.random() * 2 - 1) * half, (rng.random() * 2 - 1) * half
        radius = 0.035 * (1.0 - rng.random()) ** -0.62
        if radius > 0.42 or math.hypot(r, c) < 0.85 + radius:
            continue
        crater(r, c, radius, fresh=0.12 if rng.random() < 0.15 else 0.0)
        made += 1

    # Small stones, half sunk: bumps with a flat top (the loose ones lying on top are meshes in the scene)
    for _ in range(1500):
        r, c = (rng.random() * 2 - 1) * half, (rng.random() * 2 - 1) * half
        size = 0.012 + 0.03 * rng.random() ** 3
        cx, cy = at(r, c)
        add(z, cx, cy, size * scale, lambda d, k=size * (0.5 + 0.6 * rng.random()): k * np.clip(1.2 - d * d, 0.0, 0.85))

    def boot(r, c, heading, side):
        """One boot print, 28 cm long, pointing along `heading` (from toward-camera round to camera-right)."""
        cx, cy = at(r, c)
        # The print's own axis in the picture
        ax = (math.sin(heading) * right[0] + math.cos(heading) * toward[0], math.sin(heading) * right[1] + math.cos(heading) * toward[1])
        reach = int(0.2 * scale)
        x0, y0 = int(cx) - reach, int(cy) - reach
        if x0 < 0 or y0 < 0 or x0 + 2 * reach >= n or y0 + 2 * reach >= n:
            return
        xs = (np.arange(x0, x0 + 2 * reach)[None, :] - cx) / scale
        ys = (np.arange(y0, y0 + 2 * reach)[:, None] - cy) / scale
        along = xs * ax[0] + ys * ax[1]
        across = (-xs * ax[1] + ys * ax[0]) * side
        # Wider at the ball than the heel, with a waist
        width = 0.046 + 0.011 * np.tanh((along + 0.02) / 0.05) - 0.009 * np.exp(-((along / 0.035) ** 2))
        inside = np.clip((1 - np.abs(along) / 0.14) * 14, 0, 1) * np.clip((1 - np.abs(across - 0.006) / width) * 9, 0, 1)
        tread = np.sin(along * 2 * math.pi / 0.03) > 0.2
        window = (slice(y0, y0 + 2 * reach), slice(x0, x0 + 2 * reach))
        z[window] -= (inside * (0.006 + 0.003 * tread)).astype(np.float32)
        # The dust squeezed out round the edge
        edge = np.clip((1 - np.abs(along) / 0.155) * 9, 0, 1) * np.clip((1 - np.abs(across - 0.006) / (width + 0.014)) * 9, 0, 1) - inside
        z[window] += (np.clip(edge, 0, 1) * 0.002).astype(np.float32)
        tone[window] -= (inside * 0.05).astype(np.float32)

    # Someone walked in from the right and stopped at the chair: a gentle curve of thirteen steps
    steps = 13
    for i in range(steps):
        k = i / (steps - 1)
        r = 4.4 - 3.6 * k + 0.3 * math.sin(k * math.pi)
        c = 2.2 - 1.3 * k ** 0.9
        heading = math.atan2(-3.6 + 0.3 * math.pi * math.cos(k * math.pi), -1.3) + 0.06 * math.sin(i * 1.7)
        side = 1 if i % 2 else -1
        boot(r + side * 0.09 * math.cos(heading), c - side * 0.09 * math.sin(heading), heading, side)

    # The light. Each row runs toward the sun, so a place is in shadow if anything further along its row stands above the ray.
    xs = (np.arange(n, dtype=np.float32) + 0.5 - n / 2) / scale
    u, v = np.meshgrid(xs, xs)
    away = np.hypot(u, v)
    arc = away / SITE_RADIUS
    # How high the sun stands over each place: lower the further round the moon from the sun the place is
    height = np.arcsin(np.clip(np.cos(arc) * math.sin(SUN_ELEVATION) + np.sin(arc) * math.cos(SUN_ELEVATION) * u / np.maximum(away, 1e-6), -1, 1))
    # Toward the terminator shadows run to any length: they are held to what a sun seven degrees up would throw
    rise = (np.tan(np.maximum(height, math.radians(7))) / scale).astype(np.float32)   # metres the ray climbs per texel
    lit = np.ones((n, n), dtype=np.float32)
    ahead = np.empty_like(z)
    for k in range(1, 260):
        ahead[:, :-k] = z[:, k:]
        ahead[:, -k:] = -1.0
        # An edge a few millimetres soft rather than a staircase
        lit = np.minimum(lit, np.clip(1.0 - (ahead - z - k * rise) / 0.004, 0.0, 1.0))
    # In the last few degrees before night the ground is nearly dark anyway, and row-long streaks would show: let them go
    grazing = np.clip((height - math.radians(2)) / math.radians(7), 0.0, 1.0)
    lit = 1.0 - (1.0 - lit) * grazing * grazing * (3 - 2 * grazing)

    gx = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) * 0.5 * scale
    gy = (np.roll(z, -1, axis=0) - np.roll(z, 1, axis=0)) * 0.5 * scale
    length = np.sqrt(gx * gx + gy * gy + 1)
    m = n // 2
    small = lambda a: resize_f(a, (m, m), Image.BOX)
    mottle = resize_f(spectral_noise(rng, 1024, 1.3, lo=2, hi=200), (m, m), Image.BICUBIC)
    rgba = np.stack([small(lit), 0.5 + small(tone) + 0.07 * mottle, small(-gx / length) * 0.5 + 0.5, small(-gy / length) * 0.5 + 0.5], axis=-1)
    full = np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8)
    save(full, os.path.join(out, 'site-2k.png'))
    save(np.asarray(Image.fromarray(full).resize((1024, 1024), Image.BOX)), os.path.join(out, 'site-1k.png'))


def made_up_clouds(w, h):
    """Stand-in for the cloud map when NASA's cannot be fetched: banded, tileable east-west."""
    rng = np.random.default_rng(57747)
    n = 2048
    base = spectral_noise(rng, n, 1.7, lo=2, hi=300)
    fine = spectral_noise(rng, n, 1.1, lo=12, hi=500)
    field = resize_f(base + 0.45 * fine, (w, h), Image.BICUBIC)
    lat = (0.5 - (np.arange(h) + 0.5) / h) * math.pi
    # More cloud along the equator and the two storm tracks, less over the dry belts
    cover = 0.08 + 0.3 * np.exp(-((lat / 0.14) ** 2)) + 0.38 * np.exp(-(((np.abs(lat) - 0.95) / 0.3) ** 2))
    return np.clip((field * 0.5 + cover[:, None] * 1.5 - 0.42) * 1.35, 0, 1)


def earth(raw, out):
    day = Image.open(os.path.join(raw, 'world.topo.bathy.200412.3x5400x2700.jpg')).convert('RGB')
    cloud_path = os.path.join(raw, 'cloud_combined_2048.jpg')
    real = os.path.exists(cloud_path) and os.path.getsize(cloud_path) > 100000
    print('clouds:', 'NASA Blue Marble 2002' if real else 'made up (the NASA cloud map was not found)')
    for name, (w, h) in (('2k', (2048, 1024)), ('1k', (1024, 512))):
        rgb = np.asarray(day.resize((w, h), Image.LANCZOS), dtype=np.uint8)
        if real:
            a = np.asarray(Image.open(cloud_path).convert('L').resize((w, h), Image.LANCZOS), dtype=np.uint8)
        else:
            a = np.round(made_up_clouds(w, h) * 255).astype(np.uint8)
        save(np.dstack([rgb, a]), os.path.join(out, f'earth-{name}.png'))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(os.path.dirname(here))
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', default=os.path.join(repo, 'assets-src', 'raw', 'moon'))
    ap.add_argument('--download', action='store_true')
    ap.add_argument('--only', default='moon,detail,site,earth')
    args = ap.parse_args()
    out = os.path.join(args.raw, 'out')
    os.makedirs(out, exist_ok=True)
    if args.download:
        download(args.raw)
    steps = set(args.only.split(','))
    if 'moon' in steps:
        moon(args.raw, out)
    if 'detail' in steps:
        detail(out)
    if 'site' in steps:
        site(out)
    if 'earth' in steps:
        earth(args.raw, out)


if __name__ == '__main__':
    sys.exit(main())
