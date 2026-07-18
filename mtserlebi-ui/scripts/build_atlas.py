#!/usr/bin/env python3
"""Build Phaser texture atlases from AI-generated 4x4 character sheets.

Pipeline per sheet:
  1. Strip baked checkerboard background (perimeter color sampling + connected
     components touching the border).
  2. Slice the 4x4 grid, keep only real sprite components per cell (drops the
     AI watermark sparkle and stray noise).
  3. Auto-detect each row's facing direction via skin-pixel heuristics
     (overridable per sheet).
  4. Trim, uniformly downscale to game sprite height, anchor by feet.
  5. Pack atlas.png and emit atlas.json with PhiloAgents frame naming:
     <id>-<dir> idle + <id>-<dir>-walk-0000..0008 (ping-pong over 4 frames).
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SRC_DIR = Path(__file__).resolve().parent.parent / "public/assets/mtserlebi"
OUT_DIR = Path(__file__).resolve().parent.parent / "public/assets/characters"
PREVIEW_DIR = Path(__file__).resolve().parent / "preview"

TARGET_HEIGHT = 48          # match template sprite height (~46-50px)
BG_TOLERANCE = 18           # max per-channel diff to count as background color
MIN_COMPONENT_RATIO = 0.05  # keep cell components >= 5% of largest
WALK_SEQUENCE = [0, 1, 2, 3, 2, 1, 0, 1, 2]  # 9 walk frames from 4 physical

# rows: facing of grid rows top->bottom, None = auto-detect.
# flip_rows: mirror listed row indices horizontally after slicing.
SHEETS = {
    # drop: (row, col) frames to skip entirely (baked AI watermark on the body)
    "rustaveli": {"file": "Shota Rustaveli LPC.png", "name": "Shota Rustaveli", "rows": None, "flip_rows": [], "drop": []},
    "ilia": {"file": "Ilia Chavchavadze LPC.png", "name": "Ilia Chavchavadze", "rows": None, "flip_rows": [], "drop": [(3, 3)]},
    # tol: dark suits on these sheets sit close to the dark checker tones
    "akaki": {"file": "Akaki Wereteli LPC.png", "name": "Akaki Tsereteli", "rows": ["front", "back", "right", None], "flip_rows": [], "drop": [(3, 3), (0, 2), (0, 3)]},
    "vazha": {"file": "Vaja Pshavela.png", "name": "Vazha-Pshavela", "rows": None, "flip_rows": [], "drop": [(3, 3)]},
    "mikheil": {"file": "MIkheil Javakhishvili.png", "name": "Mikheil Javakhishvili", "rows": None, "flip_rows": [], "drop": [(3, 3)]},
    "konstantine": {"file": "Konstantine Gamsakhurdia.png", "name": "Konstantine Gamsakhurdia", "rows": None, "flip_rows": [], "drop": [(3, 3)]},
    # cols: this sheet is a 3-column grid
    "iakob": {"file": "Iakob Gogebashvili.png", "name": "Iakob Gogebashvili", "rows": ["front", "right", "back", "left"], "flip_rows": [], "drop": [], "cols": 3},
}


def sample_background_palette(rgb, thickness=4, min_freq=0.005):
    """Collect dominant colors along the image perimeter."""
    strips = [rgb[:thickness].reshape(-1, 3), rgb[-thickness:].reshape(-1, 3),
              rgb[:, :thickness].reshape(-1, 3), rgb[:, -thickness:].reshape(-1, 3)]
    border = np.concatenate(strips)
    quantized = (border // 8) * 8
    colors, counts = np.unique(quantized, axis=0, return_counts=True)
    keep = counts >= max(1, int(len(border) * min_freq))
    colors = colors[keep].astype(np.int16)
    # near-black is sprite outline color, never checkerboard — keeping it lets
    # the flood fill leak through outlines into dark clothing
    return colors[colors.mean(axis=1) > 30]


def strip_background(img, tol=BG_TOLERANCE):
    """Return RGBA array with checkerboard background made transparent."""
    rgba = np.array(img.convert("RGBA"))
    rgb = rgba[..., :3].astype(np.int16)
    palette = sample_background_palette(rgb)

    candidate = np.zeros(rgb.shape[:2], dtype=bool)
    for color in palette:
        candidate |= np.abs(rgb - color).max(axis=2) <= tol
    # checkerboards are neutral gray; warm/cool clothing tones stay protected
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    neutral = (np.abs(r - g) <= 14) & (np.abs(g - b) <= 14) & (np.abs(r - b) <= 14)
    candidate &= neutral

    labels, count = ndimage.label(candidate)
    if count:
        border_labels = np.unique(np.concatenate([
            labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
        border_labels = border_labels[border_labels != 0]
        background = np.isin(labels, border_labels)
        rgba[background, 3] = 0

    # anchored cleanup: light checker residue hugging the sprites. Only LIGHT
    # palette tones (far from dark clothing) may grow from already-transparent
    # pixels, so tight suits stay intact while gray residue peels away.
    light = [c for c in palette if c.mean() > 110]
    if light:
        light_match = np.zeros(rgb.shape[:2], dtype=bool)
        for color in light:
            light_match |= np.abs(rgb - color).max(axis=2) <= 24
        transparent = rgba[..., 3] == 0
        for _ in range(200):
            grown = ndimage.binary_dilation(transparent) & light_match & ~transparent
            if not grown.any():
                break
            transparent |= grown
        rgba[transparent, 3] = 0
    return rgba


def clean_cell(cell):
    """Keep only significant opaque components in a cell (drops watermark)."""
    opaque = cell[..., 3] > 8
    labels, count = ndimage.label(opaque)
    if not count:
        return cell
    areas = ndimage.sum_labels(opaque, labels, index=np.arange(1, count + 1))
    keep = np.isin(labels, np.where(areas >= areas.max() * MIN_COMPONENT_RATIO)[0] + 1)
    cell = cell.copy()
    cell[~keep] = 0
    return cell


def slice_grid(rgba, cols=4, rows=4):
    h, w = rgba.shape[:2]
    ch, cw = h // rows, w // cols
    return [[clean_cell(rgba[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw])
             for c in range(cols)] for r in range(rows)]


def bbox(cell):
    ys, xs = np.where(cell[..., 3] > 8)
    if not len(ys):
        return None
    return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1


def detect_direction(cell):
    """Classify one frame's facing via skin-pixel distribution in the head area."""
    box = bbox(cell)
    if box is None:
        return None
    y0, y1, x0, x1 = box
    head = cell[y0:y0 + max(1, (y1 - y0) * 45 // 100), x0:x1]
    r, g, b = (head[..., i].astype(np.int16) for i in range(3))
    skin = (head[..., 3] > 8) & (r > 140) & (r > g) & (g > b) & ((r - b) > 25)
    area = (cell[..., 3] > 8).sum()
    # back views still show a sliver of neck/ear skin (~1.5%); fronts run ~8%+
    if skin.sum() < area * 0.03:
        return "back"
    xs = np.where(skin)[1]
    offset = (xs.mean() - (x1 - x0) / 2) / (x1 - x0)
    return "front" if abs(offset) < 0.06 else ("left" if offset < 0 else "right")


def trim_and_scale(cells_by_dir):
    """Trim frames, uniform-scale so median height hits TARGET_HEIGHT."""
    trimmed = {}
    heights = []
    for direction, cells in cells_by_dir.items():
        frames = []
        for cell in cells:
            box = bbox(cell)
            if box is None:
                continue
            y0, y1, x0, x1 = box
            frames.append(cell[y0:y1, x0:x1])
            heights.append(y1 - y0)
        trimmed[direction] = frames
    factor = TARGET_HEIGHT / float(np.median(heights))
    scaled = {}
    for direction, frames in trimmed.items():
        scaled[direction] = [
            np.array(Image.fromarray(f).resize(
                (max(1, round(f.shape[1] * factor)), max(1, round(f.shape[0] * factor))),
                Image.NEAREST))
            for f in frames]
    return scaled


def pack_atlas(char_id, frames_by_dir):
    """Pack frames into a grid PNG and build the Phaser JSON-hash atlas."""
    directions = ["front", "left", "right", "back"]
    max_w = max(f.shape[1] for frames in frames_by_dir.values() for f in frames)
    max_h = max(f.shape[0] for frames in frames_by_dir.values() for f in frames)
    cell_w, cell_h = max_w + 2, max_h + 2
    cols = max(len(f) for f in frames_by_dir.values())

    sheet = np.zeros((cell_h * len(directions), cell_w * cols, 4), dtype=np.uint8)
    rects = {}
    for row, direction in enumerate(directions):
        for col, frame in enumerate(frames_by_dir[direction]):
            fh, fw = frame.shape[:2]
            # anchor bottom-center inside the cell so feet stay planted
            x = col * cell_w + (cell_w - fw) // 2
            y = row * cell_h + (cell_h - fh - 1)
            sheet[y:y + fh, x:x + fw] = frame
            rects[(direction, col)] = {"x": int(x), "y": int(y), "w": int(fw), "h": int(fh)}

    frames_json = {}

    def add(name, rect):
        frames_json[name] = {
            "frame": rect, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": rect["w"], "h": rect["h"]},
            "sourceSize": {"w": rect["w"], "h": rect["h"]},
        }

    for direction in directions:
        count = len(frames_by_dir[direction])
        # idle = narrowest frame (legs together)
        idle_col = min(range(count), key=lambda c: rects[(direction, c)]["w"])
        add(f"{char_id}-{direction}", rects[(direction, idle_col)])
        for i, src in enumerate(WALK_SEQUENCE):
            add(f"{char_id}-{direction}-walk-{i:04d}", rects[(direction, src % count)])

    atlas = {"frames": frames_json,
             "meta": {"app": "build_atlas.py", "image": "atlas.png",
                      "size": {"w": int(sheet.shape[1]), "h": int(sheet.shape[0])}, "scale": 1}}
    return sheet, atlas


def process_sheet(char_id, cfg):
    img = Image.open(SRC_DIR / cfg["file"])
    rgba = strip_background(img, cfg.get("tol", BG_TOLERANCE))
    grid = slice_grid(rgba, cols=cfg.get("cols", 4))

    for row_idx in cfg["flip_rows"]:
        grid[row_idx] = [cell[:, ::-1] for cell in grid[row_idx]]

    # classify every frame individually — AI sheets mix directions within rows
    cells_by_dir = {}
    detected = []
    for row_idx, row_cells in enumerate(grid):
        forced = cfg["rows"][row_idx] if cfg["rows"] else None
        row_dirs = []
        for col_idx, cell in enumerate(row_cells):
            if (row_idx, col_idx) in cfg["drop"]:
                row_dirs.append("dropped")
                continue
            direction = forced or detect_direction(cell)
            if direction is None:
                continue
            row_dirs.append(direction)
            cells_by_dir.setdefault(direction, []).append(cell)
        detected.append(row_dirs)
    print(f"{char_id}: frame directions per row: {detected}")

    # sides mirror-normalized: dominant side stays native, opposite is its flip
    left_n, right_n = len(cells_by_dir.get("left", [])), len(cells_by_dir.get("right", []))
    if left_n != right_n or left_n == 0:
        source = "right" if right_n >= left_n else "left"
        other = "left" if source == "right" else "right"
        if source not in cells_by_dir:
            raise SystemExit(f"{char_id}: no side-view frames at all — check sheet")
        cells_by_dir[other] = [c[:, ::-1] for c in cells_by_dir[source]]
        print(f"  {other}: mirrored from {source} ({len(cells_by_dir[source])} frames)")

    for direction in ("front", "back"):
        if direction not in cells_by_dir:
            raise SystemExit(f"{char_id}: no '{direction}' frames — set 'rows' override")

    # cap at 4 frames per direction to keep walk cycles consistent
    cells_by_dir = {d: cells[:4] for d, cells in cells_by_dir.items()}

    frames_by_dir = trim_and_scale(cells_by_dir)
    sheet, atlas = pack_atlas(char_id, frames_by_dir)

    out = OUT_DIR / char_id
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet).save(out / "atlas.png")
    (out / "atlas.json").write_text(json.dumps(atlas, indent=2))

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    preview = Image.fromarray(sheet).resize((sheet.shape[1] * 3, sheet.shape[0] * 3), Image.NEAREST)
    preview.save(PREVIEW_DIR / f"{char_id}.png")
    print(f"  atlas {sheet.shape[1]}x{sheet.shape[0]} -> {out}")


def main():
    only = set(sys.argv[1:])
    for char_id, cfg in SHEETS.items():
        if only and char_id not in only:
            continue
        process_sheet(char_id, cfg)


if __name__ == "__main__":
    main()
