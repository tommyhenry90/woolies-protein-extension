#!/usr/bin/env python3
"""Generate all the web-app icons from logo-source.png.

Outputs (relative to web/):
  app/icon.png            512x512 (Next's default favicon convention)
  app/apple-icon.png      180x180 (iOS touch icon)
  app/opengraph-image.png 1200x630 (Twitter / Slack / Discord preview)
  app/favicon.ico         multi-size 16/32/48 (legacy browsers + browser tabs)
  public/logo.png         512x512 (for use in-page)
  public/logo-mark.png    256x256 transparent (cream removed) for headers
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "logo-source.png")
APP = os.path.join(ROOT, "app")
PUBLIC = os.path.join(ROOT, "public")
os.makedirs(PUBLIC, exist_ok=True)

# Brand cream background colour (sampled from the source).
CREAM = (243, 235, 218)
GREEN = (104, 175, 53)
DARK_GREEN = (45, 95, 25)
WHITE = (255, 255, 255)


def remove_cream_background(img: Image.Image, soft_dist: float = 90.0) -> Image.Image:
    """Map cream-similar pixels to transparent with a soft alpha falloff so
    the anti-aliased halo around the artwork fades cleanly to nothing.

    For each pixel we compute Euclidean RGB distance to the cream brand
    colour. Pixels at distance 0 (pure cream) → alpha 0. Pixels at
    `soft_dist` or further → original alpha. In between we scale alpha
    linearly, which kills the halo without nibbling the green outlines."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    cr, cg, cb = CREAM
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dr, dg, db = r - cr, g - cg, b - cb
            dist = (dr * dr + dg * dg + db * db) ** 0.5
            if dist >= soft_dist:
                continue
            new_alpha = int(round(a * (dist / soft_dist)))
            if new_alpha <= 2:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, new_alpha)
    return img


def autocrop(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def make_square_transparent(img: Image.Image, size: int) -> Image.Image:
    """Scale the cropped logo to fit a transparent square (no background).
    Keeps the aspect ratio and centres the artwork with ~6% padding."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    art = img.copy()
    art.thumbnail((int(size * 0.92), int(size * 0.92)), Image.LANCZOS)
    ax = (size - art.width) // 2
    ay = (size - art.height) // 2
    canvas.alpha_composite(art, (ax, ay))
    return canvas


def make_og_image(img: Image.Image, size=(1200, 630)) -> Image.Image:
    W, H = size
    canvas = Image.new("RGB", (W, H), CREAM)

    # Logo on the left.
    art = img.copy()
    art.thumbnail((int(H * 0.85), int(H * 0.85)), Image.LANCZOS)
    canvas.paste(art, (60, (H - art.height) // 2), art)

    # Wordmark + tagline on the right.
    title_font = _load_font(80, bold=True)
    tag_font = _load_font(32, bold=False)
    sub_font = _load_font(24, bold=False)

    draw = ImageDraw.Draw(canvas)
    text_x = 60 + art.width + 60
    text_y = H // 2 - 130
    gains_w = draw.textlength("Gains ", font=title_font)
    draw.text((text_x, text_y), "Gains", fill=(28, 28, 28), font=title_font)
    draw.text((text_x + gains_w, text_y), "Grocer", fill=DARK_GREEN, font=title_font)
    draw.text((text_x, text_y + 140), "Highest-protein groceries", fill=(60, 60, 60), font=tag_font)
    draw.text((text_x, text_y + 180), "at Woolworths.", fill=(60, 60, 60), font=tag_font)
    draw.text((text_x, text_y + 250), "gainsgrocer.com", fill=GREEN, font=sub_font)
    return canvas


def _load_font(size: int, bold: bool = False):
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def main():
    source = Image.open(SRC).convert("RGBA")
    # The current logo-source.png is already a transparent PNG; only call
    # remove_cream_background() if a cream surface is detected at a corner.
    corner = source.getpixel((0, 0))
    if isinstance(corner, tuple) and len(corner) >= 4 and corner[3] > 0:
        source = remove_cream_background(source)
    cleaned = autocrop(source)

    # 1) Next favicon convention — app/icon.png, transparent background.
    make_square_transparent(cleaned, 512).save(os.path.join(APP, "icon.png"))

    # 2) Apple touch icon — iOS auto-paints black behind transparent areas,
    # which looks fine with the green-on-black aesthetic.
    make_square_transparent(cleaned, 180).save(os.path.join(APP, "apple-icon.png"))

    # 3) OpenGraph preview card (keeps the cream background — brand surface).
    make_og_image(cleaned).save(os.path.join(APP, "opengraph-image.png"), optimize=True)

    # 4) Multi-size favicon.ico for the browser tab. Transparent.
    fav_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    fav_imgs = [make_square_transparent(cleaned, s[0]) for s in fav_sizes]
    fav_imgs[0].save(
        os.path.join(APP, "favicon.ico"),
        format="ICO",
        sizes=fav_sizes,
        append_images=fav_imgs[1:],
    )

    # 5) In-page assets. Both transparent now; the older logo.png was
    # cream-backed — replaced for consistency.
    cleaned.thumbnail((512, 512), Image.LANCZOS)
    cleaned.save(os.path.join(PUBLIC, "logo-mark.png"))
    make_square_transparent(cleaned, 512).save(os.path.join(PUBLIC, "logo.png"))

    for p in (
        os.path.join(APP, "icon.png"),
        os.path.join(APP, "apple-icon.png"),
        os.path.join(APP, "opengraph-image.png"),
        os.path.join(APP, "favicon.ico"),
        os.path.join(PUBLIC, "logo-mark.png"),
        os.path.join(PUBLIC, "logo.png"),
    ):
        print("wrote", os.path.relpath(p, ROOT), os.path.getsize(p), "bytes")


if __name__ == "__main__":
    main()
