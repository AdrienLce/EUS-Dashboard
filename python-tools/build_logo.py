"""
Sentinel logo — generator.

Recreates the Sentinel mark (a 4-blade white pinwheel / compass with a centre ring
on an iOS-style squircle). Renders:
  - the 5 yellow-background prototypes + a contact sheet (logo-prototypes/), and
  - the chosen GOLDEN variant as a full asset set (logo-prototypes/final/):
    a 1024px upload-ready PNG, 512/256/192/64/32 PNGs, a favicon .ico and an SVG master.

Run with:
    pip install pillow numpy
    python python-tools/build_logo.py
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'logo-prototypes'

# ---------------------------------------------------------------------------
# Geometry of the pinwheel mark (all values are fractions of the tile half-size A)
# ---------------------------------------------------------------------------

MARGIN = 0.018             # squircle inset, fraction of the canvas
D = 0.92                   # diamond radius (edge-midpoint reach)
HUB = 0.16                 # inner hub radius
SPIN = 20.0                # pinwheel twist, degrees
RING_OUT = 0.165           # ring outer radius
RING_IN = 0.085            # ring inner (white hole) radius

M = {'t': (0, -D), 'r': (D, 0), 'b': (0, D), 'l': (-D, 0)}   # diamond edge midpoints
_BIS = {'TR': (0.7071, -0.7071), 'BR': (0.7071, 0.7071),
        'BL': (-0.7071, 0.7071), 'TL': (-0.7071, -0.7071)}   # corner bisectors


def _hex(h: str) -> tuple[int, int, int]:
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _rot(vx, vy, deg):
    a = math.radians(deg)
    return (vx * math.cos(a) - vy * math.sin(a), vx * math.sin(a) + vy * math.cos(a))


def _blades_norm():
    """The 4 blade triangles in normalised coords (units of A, centre origin, y-down)."""
    H = {k: tuple(HUB * v for v in _rot(*_BIS[k], SPIN)) for k in _BIS}
    return [
        [M['t'], M['r'], H['TR']],
        [M['r'], M['b'], H['BR']],
        [M['b'], M['l'], H['BL']],
        [M['l'], M['t'], H['TL']],
    ]


def _to_px(tri, C, A):
    return [(C + nx * A, C + ny * A) for nx, ny in tri]


# ---------------------------------------------------------------------------
# Raster gradients (numpy)
# ---------------------------------------------------------------------------

def _interp_stops(t, stops):
    pos = np.array([p for p, _ in stops], dtype=np.float32)
    cols = np.array([_hex(c) for _, c in stops], dtype=np.float32)
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for ch in range(3):
        out[..., ch] = np.interp(t, pos, cols[:, ch])
    return out.astype(np.uint8)


def _linear(W, stops, angle_deg):
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    ang = math.radians(angle_deg)
    t = xx * math.cos(ang) + yy * math.sin(ang)
    t = (t - t.min()) / (t.max() - t.min())
    return _interp_stops(t, stops)


def _radial(W, stops):
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    c = (W - 1) / 2
    r = np.sqrt((xx - c) ** 2 + (yy - c) ** 2)
    return _interp_stops(np.clip(r / (c * 1.06), 0, 1), stops)


def _squircle(W, p=5.0):
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    c = (W - 1) / 2
    a = c - W * MARGIN
    return (np.abs((xx - c) / a) ** p + np.abs((yy - c) / a) ** p) <= 1.0


# ---------------------------------------------------------------------------
# Render one logo to a PIL image (supersampled for smooth edges)
# ---------------------------------------------------------------------------

def render_png(bg, ring_hex: str, shadow: str = 'soft', out_px: int = 512, ss: int = 4):
    """bg = ('linear', angle, stops) | ('radial', stops) | ('flat', '#hex')."""
    W = out_px * ss
    C = (W - 1) / 2
    A = C - W * MARGIN

    if bg[0] == 'linear':
        rgb = _linear(W, bg[2], bg[1])
    elif bg[0] == 'radial':
        rgb = _radial(W, bg[1])
    else:
        rgb = np.empty((W, W, 3), np.uint8); rgb[:] = _hex(bg[1])

    alpha = (_squircle(W) * 255).astype(np.uint8)
    img = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')

    blades = [_to_px(t, C, A) for t in _blades_norm()]

    # subtle 3D shadow under the blades
    sl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sl)
    if shadow == 'bold':
        off, blur, col = int(W * 0.028), W * 0.006, (90, 45, 0, 130)
    else:
        off, blur, col = int(W * 0.016), W * 0.012, (120, 50, 0, 95)
    for tri in blades:
        sd.polygon([(x + off, y + off) for x, y in tri], fill=col)
    img = Image.alpha_composite(img, sl.filter(ImageFilter.GaussianBlur(blur)))

    # white blades
    bl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(bl).polygon  # noqa (keep linter calm)
    bd = ImageDraw.Draw(bl)
    for tri in blades:
        bd.polygon(tri, fill=(255, 255, 255, 255))
    img = Image.alpha_composite(img, bl)

    # centre ring (coloured annulus + white hole)
    rd = ImageDraw.Draw(img)
    ro, ri = RING_OUT * A, RING_IN * A
    rd.ellipse([C - ro, C - ro, C + ro, C + ro], fill=_hex(ring_hex) + (255,))
    rd.ellipse([C - ri, C - ri, C + ri, C + ri], fill=(255, 255, 255, 255))

    img.putalpha(Image.fromarray(alpha, 'L'))
    return img.resize((out_px, out_px), Image.LANCZOS)


# ---------------------------------------------------------------------------
# SVG master (vector) for a linear-gradient variant
# ---------------------------------------------------------------------------

def build_svg(stops, ring_hex: str, size: int = 1024, angle_deg: float = 45.0) -> str:
    C = size / 2
    A = C - size * MARGIN
    m = size * MARGIN
    rx = size * 0.225
    # gradient direction vector for the given angle, as objectBoundingBox coords
    ang = math.radians(angle_deg)
    dx, dy = math.cos(ang), math.sin(ang)
    x1, y1 = (0.5 - dx / 2), (0.5 - dy / 2)
    x2, y2 = (0.5 + dx / 2), (0.5 + dy / 2)
    stop_xml = '\n'.join(
        f'      <stop offset="{p}" stop-color="{c}"/>' for p, c in stops)
    blades = _blades_norm()
    polys = '\n'.join(
        '      <polygon points="' +
        ' '.join(f'{C + nx * A:.1f},{C + ny * A:.1f}' for nx, ny in tri) + '"/>'
        for tri in blades)
    dxy = size * 0.016
    std = size * 0.012
    ro, ri = RING_OUT * A, RING_IN * A
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <defs>
    <linearGradient id="bg" x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}">
{stop_xml}
    </linearGradient>
    <clipPath id="sq">
      <rect x="{m:.1f}" y="{m:.1f}" width="{size - 2 * m:.1f}" height="{size - 2 * m:.1f}" rx="{rx:.1f}" ry="{rx:.1f}"/>
    </clipPath>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="{dxy:.1f}" dy="{dxy:.1f}" stdDeviation="{std:.1f}" flood-color="#7a3300" flood-opacity="0.40"/>
    </filter>
  </defs>
  <g clip-path="url(#sq)">
    <rect x="0" y="0" width="{size}" height="{size}" fill="url(#bg)"/>
    <g fill="#ffffff" filter="url(#sh)">
{polys}
    </g>
    <circle cx="{C:.1f}" cy="{C:.1f}" r="{ro:.1f}" fill="{ring_hex}"/>
    <circle cx="{C:.1f}" cy="{C:.1f}" r="{ri:.1f}" fill="#ffffff"/>
  </g>
</svg>
'''


# ---------------------------------------------------------------------------
# The 5 prototypes + the chosen golden asset set
# ---------------------------------------------------------------------------

GOLDEN = dict(
    bg=('linear', 45, [(0.0, '#fcd34d'), (0.55, '#f59e0b'), (1.0, '#ea7a04')]),
    ring_hex='#f97316', shadow='soft',
)

PROTOTYPES = [
    ('sentinel-yellow-1-golden.png', 'Golden gradient · amber ring', GOLDEN),
    ('sentinel-yellow-2-lemon.png', 'Lemon gradient · deep-amber ring',
     dict(bg=('linear', 45, [(0.0, '#fde047'), (0.5, '#facc15'), (1.0, '#ca8a04')]), ring_hex='#b45309', shadow='soft')),
    ('sentinel-yellow-3-sun-radial.png', 'Sun radial glow · orange ring',
     dict(bg=('radial', [(0.0, '#fef9c3'), (0.45, '#fde047'), (1.0, '#f59e0b')]), ring_hex='#f97316', shadow='soft')),
    ('sentinel-yellow-4-gold-indigo.png', 'Golden gradient · indigo ring',
     dict(bg=('linear', 45, [(0.0, '#fcd34d'), (0.55, '#f59e0b'), (1.0, '#ea7a04')]), ring_hex='#6366f1', shadow='soft')),
    ('sentinel-yellow-5-flat-bold.png', 'Flat lemon · bold shadow · amber ring',
     dict(bg=('flat', '#facc15'), ring_hex='#ea7a04', shadow='bold')),
]


def export_final():
    """Export the chosen GOLDEN logo as a full asset set under logo-prototypes/final/."""
    fd = OUT / 'final'
    fd.mkdir(parents=True, exist_ok=True)
    master = render_png(**GOLDEN, out_px=1024)
    master.save(fd / 'logo-sentinel-dashboard.png')          # upload-ready (-> Supabase)
    for px in (512, 256, 192, 64, 32):
        master.resize((px, px), Image.LANCZOS).save(fd / f'logo-sentinel-dashboard-{px}.png')
    # favicon (multi-size .ico)
    master.resize((256, 256), Image.LANCZOS).save(
        fd / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    (fd / 'logo-sentinel-dashboard.svg').write_text(
        build_svg(GOLDEN['bg'][2], GOLDEN['ring_hex']), encoding='utf-8')
    print(f'OK — {OUT.name}/final/  (logo-sentinel-dashboard.png @1024 + 512/256/192/64/32 + favicon.ico + .svg)')


def main() -> int:
    imgs = []
    for fname, label, kw in PROTOTYPES:
        im = render_png(**kw, out_px=512)
        im.save(OUT / fname)
        imgs.append((label, im))
        print(f'OK — {OUT.name}/{fname}  ({label})')

    # contact sheet
    pad, tile, n = 28, 512, len(imgs)
    sheet = Image.new('RGB', (pad + n * (tile + pad), pad * 2 + tile + 46), (243, 244, 246))
    dr = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(imgs):
        x = pad + i * (tile + pad)
        sheet.paste(im, (x, pad), im)
        dr.ellipse([x + 6, pad + 6, x + 40, pad + 40], fill=(15, 23, 42))
        dr.text((x + 19, pad + 15), str(i + 1), fill=(255, 255, 255))
        dr.text((x + 4, pad + tile + 10), f'{i + 1}. {label}', fill=(30, 41, 59))
    sheet.save(OUT / 'sentinel-yellow-CONTACT-SHEET.png')
    print(f'OK — {OUT.name}/sentinel-yellow-CONTACT-SHEET.png')

    export_final()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
