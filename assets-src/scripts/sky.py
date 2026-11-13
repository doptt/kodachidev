"""
Builds the cube maps of the night sky that the black hole scene bends.

    python -I assets-src/scripts/sky.py [--src assets-src/raw/sky/starmap_2020_16k_gal.exr]
                                        [--out public/sky] [--sizes 4096,2048,1024,512]
                                        [--quality 4096:80,2048:84,1024:88,512:90]

Source: NASA/Goddard Space Flight Center Scientific Visualization Studio,
"Deep Star Maps 2020" (https://svs.gsfc.nasa.gov/4851), the galactic-coordinate
EXR. See assets-src/README-sky.md for the licence and how to fetch it.

What it does:

 1. ffmpeg decodes the EXR to raw 32-bit floats (linear light, 0..1) beside it.
 2. Each cube face is resampled from the equirectangular map at the largest
    size asked for, four bilinear samples to a texel.
 3. Smaller sizes are made by averaging 2x2 blocks, in linear light, so a star
    keeps its energy as it shrinks.
 4. Each face is stored through a cube-root curve in 8 bits (the shader cubes
    what it reads) and written as WebP. The curve spends the codes where the
    sky is: the median of the map is about 0.004, which lands on code 41.

The cube's axes are galactic: +X is the galactic centre, +Y the north galactic
pole, +Z is galactic longitude 270. Faces follow the OpenGL cube-map layout
with the first row of each image at t = 0, so they upload without flipping.
"""
import argparse
import os
import site
import subprocess
import sys

# Run with -I (isolated), which leaves out the per-user packages; numpy and Pillow live there
sys.path.append(site.getusersitepackages())

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']


def face_dirs(face, sc, tc):
    """Direction of the point (sc, tc) in -1..1 on a face, by the OpenGL cube-map rules."""
    one = np.ones_like(sc)
    return {
        'px': (one, -tc, -sc),
        'nx': (-one, -tc, sc),
        'py': (sc, one, tc),
        'ny': (sc, -one, -tc),
        'pz': (sc, -tc, one),
        'nz': (-sc, -tc, -one),
    }[face]


def sample(planes, w, h, x, y, z):
    """Bilinear sample of the equirectangular map (planes G, B, R) toward cube direction (x, y, z)."""
    # Cube axes to galactic longitude and latitude: X toward the centre, Y the pole, Z toward l = 270
    lon = np.arctan2(-z, x)
    lat = np.arctan2(y, np.hypot(x, z))
    # The map has the galactic centre in the middle and longitude growing to the left
    u = (0.5 - lon / (2 * np.pi)) * w - 0.5
    v = (0.5 - lat / np.pi) * h - 0.5
    u0 = np.floor(u).astype(np.int64)
    v0 = np.floor(v).astype(np.int64)
    fu = (u - u0).astype(np.float32)
    fv = (v - v0).astype(np.float32)
    ua = u0 % w
    ub = (u0 + 1) % w
    va = np.clip(v0, 0, h - 1)
    vb = np.clip(v0 + 1, 0, h - 1)
    out = []
    for plane in (planes[2], planes[0], planes[1]):  # R, G, B
        top = plane[va, ua] * (1 - fu) + plane[va, ub] * fu
        bottom = plane[vb, ua] * (1 - fu) + plane[vb, ub] * fu
        out.append(top * (1 - fv) + bottom * fv)
    return np.stack(out, axis=-1)


def render_face(planes, w, h, face, n, rows=256):
    """One face at n x n: every texel is the mean of four samples."""
    out = np.empty((n, n, 3), dtype=np.float32)
    sub = (np.arange(2 * n, dtype=np.float64) + 0.5) / n - 1.0
    for start in range(0, n, rows):
        stop = min(n, start + rows)
        sc, tc = np.meshgrid(sub, sub[2 * start:2 * stop])
        x, y, z = face_dirs(face, sc, tc)
        rgb = sample(planes, w, h, x, y, z)
        out[start:stop] = rgb.reshape(stop - start, 2, n, 2, 3).mean(axis=(1, 3))
    return out


def halve(img):
    n = img.shape[0] // 2
    return img.reshape(n, 2, n, 2, 3).mean(axis=(1, 3))


def encode(img):
    """Linear 0..1 to 8 bits through a cube root."""
    return (np.cbrt(np.clip(img, 0, 1)) * 255 + 0.5).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='assets-src/raw/sky/starmap_2020_16k_gal.exr')
    ap.add_argument('--out', default='public/sky')
    ap.add_argument('--sizes', default='4096,2048,1024,512')
    ap.add_argument('--quality', default='4096:80,2048:84,1024:88,512:90')
    args = ap.parse_args()
    sizes = sorted((int(s) for s in args.sizes.split(',')), reverse=True)
    quality = {int(k): int(v) for k, v in (pair.split(':') for pair in args.quality.split(','))}

    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', args.src],
        check=True, capture_output=True, text=True,
    )
    w, h = (int(v) for v in probe.stdout.strip().split(','))
    raw = os.path.splitext(args.src)[0] + '.f32'
    if not os.path.exists(raw) or os.path.getsize(raw) != w * h * 12:
        print(f'decoding {args.src} ({w}x{h}) to {raw}')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', args.src, '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', raw], check=True)
    planes = np.memmap(raw, dtype='<f4', mode='r', shape=(3, h, w))

    total = {n: 0 for n in sizes}
    for face in FACES:
        img = render_face(planes, w, h, face, sizes[0])
        n = sizes[0]
        while True:
            if n in total:
                folder = os.path.join(args.out, str(n))
                os.makedirs(folder, exist_ok=True)
                path = os.path.join(folder, f'{face}.webp')
                Image.fromarray(encode(img), 'RGB').save(path, 'WEBP', quality=quality.get(n, 85), method=6)
                total[n] += os.path.getsize(path)
                print(f'{path}  {os.path.getsize(path) / 1024:.0f} KB')
            if n <= sizes[-1]:
                break
            img = halve(img)
            n //= 2
    for n in sizes:
        print(f'{n}: {total[n] / 1048576:.2f} MB to download, {6 * n * n * 4 * 4 / 3 / 1048576:.0f} MB on the GPU with mips')


if __name__ == '__main__':
    main()
