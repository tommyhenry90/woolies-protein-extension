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


def remove_cream_background(img: Image.Image, threshold: int = 30) -> Image.Image:
    """Replace the off-white background with transparent.
    Uses ImageDraw.floodfill from each corner with a sentinel colour,
    then maps that sentinel to alpha=0."""
    img = img.convert("RGBA")
    w, h = img.size
    SENTINEL = (1, 254, 1)
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        r, g, b, *_ = img.getpixel(corner)
        if abs(r - CREAM[0]) < 40 and abs(g - CREAM[1]) < 40 and abs(b - CREAM[2]) < 40:
            ImageDraw.floodfill(img, corner, (*SENTINEL, 255), thresh=threshold)
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            p = pixels[x, y]
            if p[:3] == SENTINEL:
                pixels[x, y] = (0, 0, 0, 0)
    return img


def autocrop(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def make_square_with_cream(img: Image.Image, size: int, radius_frac: float = 0.18) -> Image.Image:
    """Composite the cropped transparent logo onto a cream rounded-square,
    keeping ~8% padding around the artwork."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * radius_frac), fill=255
    )
    bg = Image.new("RGBA", (size, size), (*CREAM, 255))
    canvas.paste(bg, (0, 0), mask)

    art = img.copy()
    art.thumbnail((int(size * 0.84), int(size * 0.84)), Image.LANCZOS)
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
    draw.text((text_x, text_y + 140), "The cheapest protein", fill=(60, 60, 60), font=tag_font)
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
    cleaned = autocrop(remove_cream_background(source))

    # 1) Next favicon convention — app/icon.png (rendered at multiple sizes).
    icon = make_square_with_cream(cleaned, 512)
    icon.save(os.path.join(APP, "icon.png"))

    # 2) Apple touch icon.
    apple = make_square_with_cream(cleaned, 180, radius_frac=0.0)  # iOS rounds itself
    apple.save(os.path.join(APP, "apple-icon.png"))

    # 3) OpenGraph preview card.
    og = make_og_image(cleaned)
    og.save(os.path.join(APP, "opengraph-image.png"), optimize=True)

    # 4) Multi-size favicon.ico for the browser tab.
    fav_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    fav_imgs = [make_square_with_cream(cleaned, s[0], radius_frac=0.0) for s in fav_sizes]
    fav_imgs[0].save(
        os.path.join(APP, "favicon.ico"),
        format="ICO",
        sizes=fav_sizes,
        append_images=fav_imgs[1:],
    )

    # 5) In-page assets.
    cleaned.thumbnail((512, 512), Image.LANCZOS)
    cleaned.save(os.path.join(PUBLIC, "logo-mark.png"))
    make_square_with_cream(cleaned, 512).save(os.path.join(PUBLIC, "logo.png"))

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
