#!/usr/bin/env python3
"""Extract occluding objects (trees, houses, statues, fences...) from the town.

Produces a transparent overlay texture containing only object pixels plus a
JSON list of object regions with their depth anchor (base = lowest opaque y).
The game draws each region as a y-sorted sprite so characters walk BEHIND
objects instead of over them.

Outputs:
  public/assets/objects.png    — 2048x2048 RGBA, object pixels only
  public/assets/objects.json   — [{"x","y","w","h","base"}, ...]
  scripts/preview/objects_layer.png — overlay preview on magenta
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

import build_collision as bc

ROOT = Path(__file__).resolve().parent.parent
OUT_PNG = ROOT / "public/assets/objects.png"
OUT_JSON = ROOT / "public/assets/objects.json"
OUT_PREVIEW = Path(__file__).resolve().parent / "preview/objects_layer.png"

MIN_AREA = 220          # drop specks smaller than this (px)
SLICE_W = 128           # wide clusters split into slices with local base depth


def object_mask(rgb):
    """Object-biased mask: raw color rules + object-side morphology.

    The collision walkable mask runs closing on the WALKABLE side, which eats
    speckled tree crowns; here morphology favors solid objects instead."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    road = (r >= 185) & (g >= 150) & (b >= 60) & (b <= 158) & ((r - b) >= 55)
    grass = (g >= 140) & (b >= 105) & (g > r) & (g > b) & ((g - r) >= 25)
    obj = ~(road | grass)
    obj = ndimage.binary_opening(obj, structure=np.ones((3, 3)))   # drop ground noise
    obj = ndimage.binary_closing(obj, structure=np.ones((7, 7)))   # solidify crowns
    return obj


def main():
    rgb = np.array(Image.open(bc.TOWN).convert("RGB"))
    obj = object_mask(rgb)

    labels, count = ndimage.label(obj)
    areas = ndimage.sum_labels(obj, labels, index=np.arange(1, count + 1))
    keep_ids = np.where(areas >= MIN_AREA)[0] + 1
    keep = np.isin(labels, keep_ids)

    # overlay texture: object pixels opaque, everything else transparent
    rgba = np.dstack([rgb, np.where(keep, 255, 0).astype(np.uint8)])
    Image.fromarray(rgba).save(OUT_PNG)

    # object regions: bbox per component, wide ones sliced for local depth
    regions = []
    slices = ndimage.find_objects(labels)
    for oid in keep_ids:
        sl = slices[oid - 1]
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start, sl[1].stop
        comp = labels[sl] == oid
        for sx in range(x0, x1, SLICE_W):
            ex = min(sx + SLICE_W, x1)
            sub = comp[:, sx - x0:ex - x0]
            rows = sub.any(axis=1)
            if not rows.any():
                continue
            # split the slice vertically at empty gaps: a fence-linked column can
            # span the whole map, and one shared base would wreck depth sorting
            runs = []
            start = None
            gap = 0
            for i, filled in enumerate(rows):
                if filled:
                    if start is None:
                        start = i
                    gap = 0
                elif start is not None:
                    gap += 1
                    if gap >= 8:
                        runs.append((start, i - gap))
                        start = None
            if start is not None:
                runs.append((start, len(rows) - 1 - gap))
            for rs, re_ in runs:
                regions.append({
                    "x": int(sx), "y": int(y0 + rs),
                    "w": int(ex - sx), "h": int(re_ - rs + 1),
                    "base": int(y0 + re_),
                })

    OUT_JSON.write_text(json.dumps(regions))
    print(f"objects: {len(keep_ids)} components -> {len(regions)} regions")

    preview = np.full_like(rgb, (255, 0, 255))
    preview[keep] = rgb[keep]
    OUT_PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(preview).resize((1024, 1024), Image.BILINEAR).save(OUT_PREVIEW)
    print(f"preview -> {OUT_PREVIEW}")


if __name__ == "__main__":
    main()
