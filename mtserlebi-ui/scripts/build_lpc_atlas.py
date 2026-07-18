#!/usr/bin/env python3
"""Build a game atlas from a standard LPC Universal Spritesheet export.

LPC sheets have true transparency and a fixed 64px grid; the walk animation
lives in rows 8-11 (up/back, left, down/front, right), column 0 is the idle
stance and columns 1-8 are the walk cycle.

Usage: python3 build_lpc_atlas.py <char_id> <sheet.png>
Writes public/assets/characters/<char_id>/atlas.{png,json} + a preview.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CELL = 64
WALK_ROWS = {"back": 8, "left": 9, "front": 10, "right": 11}
WALK_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 1]  # 9 frame names looping over the 8-frame cycle


def trim(frame):
    ys, xs = np.where(frame[..., 3] > 8)
    return frame[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main(char_id, sheet_path):
    sheet = np.array(Image.open(sheet_path).convert("RGBA"))

    frames_by_dir = {}
    for direction, row in WALK_ROWS.items():
        cells = []
        for col in range(9):  # idle + 8 walk frames
            cell = sheet[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL]
            cells.append(trim(cell))
        frames_by_dir[direction] = cells

    max_w = max(f.shape[1] for fs in frames_by_dir.values() for f in fs)
    max_h = max(f.shape[0] for fs in frames_by_dir.values() for f in fs)
    cell_w, cell_h = max_w + 2, max_h + 2
    directions = ["front", "left", "right", "back"]

    atlas_img = np.zeros((cell_h * 4, cell_w * 9, 4), dtype=np.uint8)
    rects = {}
    for r, direction in enumerate(directions):
        for c, frame in enumerate(frames_by_dir[direction]):
            fh, fw = frame.shape[:2]
            x = c * cell_w + (cell_w - fw) // 2
            y = r * cell_h + (cell_h - fh - 1)  # feet-anchored
            atlas_img[y:y + fh, x:x + fw] = frame
            rects[(direction, c)] = {"x": int(x), "y": int(y), "w": int(fw), "h": int(fh)}

    frames_json = {}

    def add(name, rect):
        frames_json[name] = {
            "frame": rect, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": rect["w"], "h": rect["h"]},
            "sourceSize": {"w": rect["w"], "h": rect["h"]},
        }

    for direction in directions:
        add(f"{char_id}-{direction}", rects[(direction, 0)])  # idle = LPC column 0
        for i, col in enumerate(WALK_COLS):
            add(f"{char_id}-{direction}-walk-{i:04d}", rects[(direction, col)])

    out = ROOT / "public/assets/characters" / char_id
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas_img).save(out / "atlas.png")
    (out / "atlas.json").write_text(json.dumps({
        "frames": frames_json,
        "meta": {"app": "build_lpc_atlas.py", "image": "atlas.png",
                 "size": {"w": int(atlas_img.shape[1]), "h": int(atlas_img.shape[0])}, "scale": 1},
    }, indent=2))

    preview_dir = Path(__file__).resolve().parent / "preview"
    preview_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas_img).resize(
        (atlas_img.shape[1] * 3, atlas_img.shape[0] * 3), Image.NEAREST
    ).save(preview_dir / f"{char_id}.png")
    print(f"{char_id}: atlas {atlas_img.shape[1]}x{atlas_img.shape[0]} -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
