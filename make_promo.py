#!/usr/bin/env python3
"""Render the Chrome Web Store promo tiles.

- Small promo:    440 x 280
- Marquee promo: 1400 x 560
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(__file__)
ICON = os.path.join(HERE, 'icons', 'icon128.png')
OUT = os.path.join(HERE, 'screenshots')

GREEN_GOOD = (30, 142, 62)        # passes the 10g rule
GREEN_GREAT = (13, 107, 44)       # dark
YELLOW = (251, 192, 45)
ORANGE = (239, 108, 0)
RED = (217, 48, 37)
GREY = (154, 160, 166)
TEXT = (28, 28, 28)
SUBTEXT = (90, 96, 102)

FONT_PATHS = (
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/HelveticaNeue.ttc',
    '/System/Library/Fonts/Helvetica.ttc',
)
REGULAR_PATHS = (
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/HelveticaNeue.ttc',
    '/System/Library/Fonts/Helvetica.ttc',
)


def load_font(size, bold=False):
    for p in (FONT_PATHS if bold else REGULAR_PATHS):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def rounded_rect(draw, xy, radius, fill):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def draw_pill(draw, x, y, value_text, label_text, bg, fg, font_value, font_label):
    pad_x, pad_y = 14, 8
    value_w = draw.textlength(value_text, font=font_value)
    space = 6
    label_w = draw.textlength(label_text, font=font_label)
    total_w = pad_x * 2 + value_w + space + label_w
    h = font_value.size + pad_y * 2
    rounded_rect(draw, (x, y, x + total_w, y + h), radius=h // 2, fill=bg)
    # Baseline-align value & label
    vy = y + (h - font_value.size) // 2 - 2
    ly = y + h - font_label.size - pad_y + 2
    draw.text((x + pad_x, vy), value_text, fill=fg, font=font_value)
    draw.text((x + pad_x + value_w + space, ly), label_text, fill=fg, font=font_label)
    return total_w, h


def make_small():
    W, H = 440, 280
    img = Image.new('RGB', (W, H), 'white')
    draw = ImageDraw.Draw(img)

    icon = Image.open(ICON).convert('RGBA').resize((96, 96), Image.LANCZOS)
    img.paste(icon, (24, 24), icon)

    title = load_font(26, bold=True)
    tagline = load_font(15, bold=False)
    pill_val = load_font(20, bold=True)
    pill_lbl = load_font(10, bold=True)

    draw.text((140, 30), 'Woolies', fill=TEXT, font=title)
    draw.text((140, 60), 'Protein Tags', fill=GREEN_GOOD, font=title)

    # Tagline (wrap manually)
    tagline_lines = [
        'Every Woolworths product',
        'rated by protein per 100 kcal.',
    ]
    ty = 100
    for line in tagline_lines:
        draw.text((140, ty), line, fill=SUBTEXT, font=tagline)
        ty += 22

    # Example pills row
    px, py = 24, 180
    w, _ = draw_pill(draw, px, py, '12', 'G P / 100 KCAL', GREEN_GOOD, 'white', pill_val, pill_lbl)
    px += w + 12
    w, _ = draw_pill(draw, px, py, '6.1', 'G P / 100 KCAL', YELLOW, (26, 26, 26), pill_val, pill_lbl)
    px += w + 12
    w, _ = draw_pill(draw, px, py, '2.5', 'G P / 100 KCAL', RED, 'white', pill_val, pill_lbl)

    out = os.path.join(OUT, 'promo-small-440x280.png')
    img.save(out)
    return out


def make_marquee():
    W, H = 1400, 560
    img = Image.new('RGB', (W, H), 'white')
    draw = ImageDraw.Draw(img)

    icon = Image.open(ICON).convert('RGBA').resize((200, 200), Image.LANCZOS)
    img.paste(icon, (80, 80), icon)

    title = load_font(72, bold=True)
    sub = load_font(28, bold=False)
    pill_val = load_font(36, bold=True)
    pill_lbl = load_font(14, bold=True)

    draw.text((310, 70), 'Woolies Protein Tags', fill=TEXT, font=title)
    draw.text((310, 160), 'Spot high-protein groceries at a glance.', fill=GREEN_GOOD, font=sub)
    draw.text((310, 200), 'Every product on woolworths.com.au gets a colour-coded protein-density rating.', fill=SUBTEXT, font=sub)

    # Big row of example pills with verdict labels.
    examples = [
        ('22', 'EXCELLENT', GREEN_GREAT, 'white'),
        ('12', 'GOOD',      GREEN_GOOD, 'white'),
        ('7.4', 'OK',       YELLOW,     (26, 26, 26)),
        ('4.6', 'POOR',     ORANGE,     'white'),
        ('2.5', 'BAD',      RED,        'white'),
    ]
    px = 100
    py = 380
    verdict_font = load_font(20, bold=True)
    for value, verdict, bg, fg in examples:
        w, h = draw_pill(draw, px, py, value, 'G P / 100 KCAL', bg, fg, pill_val, pill_lbl)
        # Verdict label under the pill
        vw = draw.textlength(verdict, font=verdict_font)
        draw.text((px + (w - vw) // 2, py + h + 12), verdict, fill=SUBTEXT, font=verdict_font)
        px += w + 30

    out = os.path.join(OUT, 'promo-marquee-1400x560.png')
    img.save(out)
    return out


if __name__ == '__main__':
    for fn in (make_small, make_marquee):
        p = fn()
        print('Wrote', p)
