#!/usr/bin/env python3
"""Bake green-screen celebration GIFs onto a solid background without transparency holes.

Chromakey alpha eats the tiger muzzle (green spill). This replaces only strong
green-screen pixels in-place, protecting orange fur, cream muzzle, and blue kit.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image


BG = {
    "unsold": np.array([15, 23, 42], dtype=np.float32),  # #0f172a
    "sold": np.array([219, 234, 254], dtype=np.float32),  # #dbeafe
}


def bake_frame(arr: np.ndarray, bg: np.ndarray) -> np.ndarray:
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    green = (g >= r + 38) & (g >= b + 28) & (g >= 85)
    orange = (r > g + 8) & (r > b + 8)
    cream = (
        (r > 130)
        & (g > 120)
        & (b > 90)
        & (np.maximum(r, g) - np.minimum(r, np.minimum(g, b)) < 55)
    )
    blue = (b > r + 15) & (b > 60)
    replace = green & ~orange & ~cream & ~blue
    out = arr.copy()
    out[replace] = bg
    keep = ~replace
    excess = np.clip(g - np.maximum(r, b), 0, None)
    m = keep & (excess > 6) & ~orange
    g2 = g.copy()
    g2[m] = np.minimum(g[m], np.maximum(r[m], b[m]) * 1.04 + 3)
    out[:, :, 1] = np.where(keep, g2, out[:, :, 1])
    return out.astype(np.uint8)


def bake_gif(src: str, dest: str, kind: str) -> None:
    bg = BG["unsold" if kind == "unsold" else "sold"]
    work = tempfile.mkdtemp(prefix="celeb-bake-")
    frames_dir = os.path.join(work, "frames")
    os.makedirs(frames_dir)
    try:
        im = Image.open(src)
        n = 0
        while True:
            try:
                im.seek(n)
            except EOFError:
                break
            frame = np.array(im.convert("RGB"), dtype=np.float32)
            Image.fromarray(bake_frame(frame, bg)).save(
                os.path.join(frames_dir, f"f{n:04d}.png")
            )
            n += 1
        if n == 0:
            raise RuntimeError("No frames in GIF")
        pattern = os.path.join(frames_dir, "f%04d.png")
        # dither=none avoids speckles on the muzzle from palette noise
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                "12",
                "-i",
                pattern,
                "-filter_complex",
                "split[s0][s1];[s0]palettegen=stats_mode=full:max_colors=256[p];"
                "[s1][p]paletteuse=dither=none",
                "-loop",
                "0",
                dest,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    finally:
        import shutil

        shutil.rmtree(work, ignore_errors=True)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--kind", choices=("sold", "unsold"), default="unsold")
    args = p.parse_args()
    bake_gif(args.input, args.output, args.kind)
    print(args.output, os.path.getsize(args.output))
    return 0


if __name__ == "__main__":
    sys.exit(main())
