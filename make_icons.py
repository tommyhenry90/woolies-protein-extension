#!/usr/bin/env python3
"""Resize the source logo to the three sizes Chrome wants.

Steps:
  1. Flood-fill the white background from the four corners with a sentinel
     colour and then convert that sentinel to alpha=0 so the icon is
     transparent outside the rounded green panel.
  2. Auto-crop to the alpha bounding box (drops the outer white margin).
  3. Resize. The 16-px icon also gets a tighter crop to the head + bicep
     area so the recognisable bits survive the downsample.
"""
import os
import numpy as np
from PIL import Image, ImageDraw

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'icons')
SOURCE = os.path.join(os.path.dirname(__file__), 'icon-source.png')
SENTINEL = (1, 254, 1)  # very unlikely to occur in the artwork


def remove_white_background(img, white_threshold=230, fill_thresh=30):
    """Flood-fill the connected white region(s) at each corner with alpha=0."""
    img = img.convert('RGBA')
    w, h = img.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        r, g, b, *_ = img.getpixel(corner)
        if r > white_threshold and g > white_threshold and b > white_threshold:
            ImageDraw.floodfill(img, corner, (*SENTINEL, 255), thresh=fill_thresh)

    arr = np.array(img)
    mask = (
        (arr[..., 0] == SENTINEL[0])
        & (arr[..., 1] == SENTINEL[1])
        & (arr[..., 2] == SENTINEL[2])
    )
    arr[mask] = (0, 0, 0, 0)
    return Image.fromarray(arr, 'RGBA')


def autocrop(img):
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def save_icon(img, size, path):
    img.resize((size, size), Image.LANCZOS).save(path)


if __name__ == '__main__':
    src = Image.open(SOURCE)
    src = remove_white_background(src)
    src = autocrop(src)
    for size in (16, 48, 128):
        save_icon(src, size, os.path.join(OUTPUT_DIR, f'icon{size}.png'))
    print('Wrote icons:', sorted(os.listdir(OUTPUT_DIR)))
