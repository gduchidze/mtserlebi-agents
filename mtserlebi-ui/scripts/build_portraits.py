#!/usr/bin/env python3
"""Build dialogue portraits from character atlases.

Takes each writer's front idle frame, crops the head/torso, upscales with
nearest-neighbor and writes public/assets/portraits/<id>.png (square, with
transparent padding). Pure derivation from existing art — style always matches.
"""

from pathlib import Path

import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CHARACTERS = ROOT / "public/assets/characters"
OUT = ROOT / "public/assets/portraits"
IDS = ["rustaveli", "ilia", "akaki", "vazha", "mikheil", "konstantine", "iakob"]

HEAD_FRACTION = 0.62   # keep top portion of the frame (head + shoulders)
SCALE = 6              # nearest-neighbor upscale factor
SIZE = 168             # final square canvas


def build(char_id):
    atlas = json.loads((CHARACTERS / char_id / "atlas.json").read_text())
    sheet = np.array(Image.open(CHARACTERS / char_id / "atlas.png"))
    fr = atlas["frames"][f"{char_id}-front"]["frame"]
    crop = sheet[fr["y"]:fr["y"] + int(fr["h"] * HEAD_FRACTION), fr["x"]:fr["x"] + fr["w"]]

    img = Image.fromarray(crop)
    img = img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    # anchor bottom-center so faces sit consistently in the frame
    canvas.paste(img, ((SIZE - img.width) // 2, SIZE - img.height))
    OUT.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT / f"{char_id}.png")
    print(f"{char_id}: {img.width}x{img.height} -> portraits/{char_id}.png")


if __name__ == "__main__":
    for char_id in IDS:
        build(char_id)
