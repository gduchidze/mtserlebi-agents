#!/usr/bin/env python3
"""Generate a collision map for the painted town image.

Classifies each pixel as walkable (beige roads + teal grass) or blocked
(buildings, trees, fences, statues, water, everything else), grids it,
merges blocked cells into rectangles and writes:
  public/assets/collision.json   — {"cell": N, "rects": [[x,y,w,h], ...]}
  scripts/preview/collision_overlay.png — red = blocked, for eyeballing
Also validates spawn points and reports the nearest walkable cell.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
TOWN = ROOT / "public/assets/sakartvelo_town.png"
OUT_JSON = ROOT / "public/assets/collision.json"
OUT_OVERLAY = Path(__file__).resolve().parent / "preview/collision_overlay.png"

CELL = 16                 # collision grid resolution in px
WALKABLE_RATIO = 0.45     # cell is walkable if >= this fraction of px walk
SPAWNS = {
    "player": (1264, 912),
    "rustaveli": (1552, 1072),
    "ilia": (944, 1296),
    "akaki": (880, 1230),
    "vazha": (720, 272),
    "mikheil": (1744, 848),
    "konstantine": (1060, 1890),
    "iakob": (1104, 1808),
}


def walkable_mask(rgb):
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)

    # beige road: warm, bright, blue clearly below red
    road = (r >= 185) & (g >= 150) & (b >= 60) & (b <= 158) & ((r - b) >= 55)
    # teal grass: green dominant, blue high enough to exclude leaf-green trees
    grass = (g >= 140) & (b >= 105) & (g > r) & (g > b) & ((g - r) >= 25)

    mask = road | grass
    # despeckle: drop lone walkable pixels inside objects and tiny holes
    mask = ndimage.binary_opening(mask, structure=np.ones((3, 3)))
    mask = ndimage.binary_closing(mask, structure=np.ones((5, 5)))
    return mask


def grid_blocked(mask):
    h, w = mask.shape
    gh, gw = h // CELL, w // CELL
    cells = mask[: gh * CELL, : gw * CELL].reshape(gh, CELL, gw, CELL)
    ratio = cells.mean(axis=(1, 3))
    return ratio < WALKABLE_RATIO  # True = blocked




def connect_components(blocked, min_size=30):
    """Carve narrow corridors so every sizable walkable island is reachable.

    Decorative fence rows in the art fully seal some roads at grid resolution;
    this cuts a 3-cell-wide gap at the closest point between islands."""
    for _ in range(20):
        labels, n = ndimage.label(~blocked)
        sizes = ndimage.sum_labels(~blocked, labels, index=np.arange(1, n + 1))
        big = [i + 1 for i, s in enumerate(sizes) if s >= min_size]
        if len(big) <= 1:
            break
        main = big[0]
        # nearest other-island cell pair to the main island
        best = None
        a_cells = np.argwhere(labels == main)
        for other in big[1:]:
            b_cells = np.argwhere(labels == other)
            d = np.abs(a_cells[:, None, :] - b_cells[None, :, :]).sum(axis=2)
            ai, bi = np.unravel_index(d.argmin(), d.shape)
            if best is None or d[ai, bi] < best[0]:
                best = (d[ai, bi], a_cells[ai], b_cells[bi])
        _, a, b = best
        # carve straight L-shaped path, 3 cells wide
        y0, x0 = a
        y1, x1 = b
        for x in range(min(x0, x1), max(x0, x1) + 1):
            blocked[max(0, y0 - 1):y0 + 2, x] = False
        for y in range(min(y0, y1), max(y0, y1) + 1):
            blocked[y, max(0, x1 - 1):x1 + 2] = False
    return blocked
def merge_rects(blocked):
    """Greedy merge of blocked cells into rectangles (rows, then extend down)."""
    gh, gw = blocked.shape
    used = np.zeros_like(blocked, dtype=bool)
    rects = []
    for y in range(gh):
        x = 0
        while x < gw:
            if blocked[y, x] and not used[y, x]:
                x2 = x
                while x2 + 1 < gw and blocked[y, x2 + 1] and not used[y, x2 + 1]:
                    x2 += 1
                y2 = y
                while y2 + 1 < gh and blocked[y2 + 1, x:x2 + 1].all() and not used[y2 + 1, x:x2 + 1].any():
                    y2 += 1
                used[y:y2 + 1, x:x2 + 1] = True
                rects.append([x * CELL, y * CELL, (x2 - x + 1) * CELL, (y2 - y + 1) * CELL])
                x = x2 + 1
            else:
                x += 1
    return rects


def nearest_walkable(blocked, x, y):
    """Nearest cell whose 3x3 neighborhood is fully walkable (body clearance)."""
    gh, gw = blocked.shape
    clear = ~ndimage.binary_dilation(blocked, structure=np.ones((3, 3)))
    cx, cy = min(x // CELL, gw - 1), min(y // CELL, gh - 1)
    if clear[cy, cx]:
        return (x, y), 0
    free = np.argwhere(clear)
    d = np.abs(free[:, 0] - cy) + np.abs(free[:, 1] - cx)
    ny, nx = free[d.argmin()]
    return (int(nx * CELL + CELL // 2), int(ny * CELL + CELL // 2)), int(d.min())


def main():
    rgb = np.array(Image.open(TOWN).convert("RGB"))
    mask = walkable_mask(rgb)
    blocked = grid_blocked(mask)
    blocked = connect_components(blocked)
    rects = merge_rects(blocked)

    OUT_JSON.write_text(json.dumps({"cell": CELL, "rects": rects}))
    print(f"blocked cells: {blocked.sum()}/{blocked.size}, rects: {len(rects)} -> {OUT_JSON.name}")

    overlay = rgb.copy()
    big = np.kron(blocked, np.ones((CELL, CELL), dtype=bool))
    big = big[: overlay.shape[0], : overlay.shape[1]]
    overlay[big] = (overlay[big] * 0.35 + np.array([200, 30, 30]) * 0.65).astype(np.uint8)
    OUT_OVERLAY.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(overlay).resize((1024, 1024), Image.BILINEAR).save(OUT_OVERLAY)
    print(f"overlay -> {OUT_OVERLAY}")

    for name, (x, y) in SPAWNS.items():
        (nx, ny), dist = nearest_walkable(blocked, x, y)
        status = "OK" if dist == 0 else f"BLOCKED -> use ({nx},{ny}) [{dist} cells away]"
        print(f"spawn {name:12s} ({x},{y}): {status}")


if __name__ == "__main__":
    main()
