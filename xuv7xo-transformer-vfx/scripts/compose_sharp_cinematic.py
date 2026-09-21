#!/usr/bin/env python3
"""Compose a SHARP cinematic cut — no AI motion-blur / I2V morphing."""

from __future__ import annotations

import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SHARP = ROOT / "keyframes" / "sharp"
OUT = ROOT / "output" / "xuv7xo_SHARP_cinematic_vfx.mp4"
ARTIFACT = Path("/opt/cursor/artifacts/xuv7xo_SHARP_cinematic_vfx.mp4")
DOWNLOAD = Path("/opt/cursor/artifacts/DOWNLOAD_xuv7xo_SHARP.mp4")
FPS = 24
W, H = 1280, 720
SR = 44100

# (file, hold_seconds, motion_kind)
# Hard cuts between beats; micro-push only (no blur sources)
BEATS = [
    ("s01_key.png", 2.2, "push"),
    ("s02_holo.png", 2.4, "pan"),
    ("s03_tap.png", 1.4, "punch"),
    ("s04_car.png", 2.6, "push"),
    ("s05_hover.png", 2.2, "float"),
    ("s06_panels_lift.png", 2.0, "push"),
    ("s07_explode.png", 2.2, "impact"),
    ("s08_half_robot.png", 2.2, "rise"),
    ("s09_robot.png", 2.4, "push"),
    ("s10_robot_hold.png", 2.8, "hold"),
    ("s11_reform.png", 2.2, "impact"),
    ("s12_almost_car.png", 2.0, "settle"),
    ("s13_restored.png", 3.0, "settle"),
]

# Only micro dissolves between consecutive transform stages (seconds)
MICRO_XFADE = 0.12


def ease(t: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * min(max(t, 0), 1))


def motion(kind: str, t: float, i: int) -> tuple[float, float, float]:
    # Keep scale tiny so resampling stays sharp
    if kind == "push":
        return 1.0 + 0.035 * ease(t), 0.0, -2.0 * t
    if kind == "pan":
        return 1.04, -12.0 * t, 0.0
    if kind == "punch":
        p = math.sin(min(t, 0.4) / 0.4 * math.pi) * 0.05
        return 1.02 + p, 0.0, 0.0
    if kind == "float":
        return 1.03, 0.0, -3.0 - 2.0 * math.sin(t * math.pi)
    if kind == "impact":
        return 1.02 + 0.02 * t, (i % 3 - 1) * 0.4, (i % 2) * 0.3
    if kind == "rise":
        return 1.0 + 0.05 * ease(t), 0.0, 8.0 * (1 - t)
    if kind == "settle":
        return 1.05 - 0.03 * ease(t), 0.0, -1.5 * (1 - t)
    return 1.02, 0.0, 0.0


def prep(img: Image.Image) -> Image.Image:
    img = img.convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
    img = ImageEnhance.Contrast(img).enhance(1.12)
    img = ImageEnhance.Color(img).enhance(1.06)
    img = ImageEnhance.Sharpness(img).enhance(1.55)
    return img


def render_clip(path: Path, frames: int, kind: str, dest: Path, flash: bool = False) -> None:
    base = prep(Image.open(path))
    dest.mkdir(parents=True, exist_ok=True)
    for i in range(frames):
        t = i / max(frames - 1, 1)
        scale, dx, dy = motion(kind, t, i)
        sw, sh = int(W * scale), int(H * scale)
        # Always LANCZOS — never bilinear soft blur
        scaled = base.resize((sw, sh), Image.Resampling.LANCZOS)
        cx = max(0, min((sw - W) // 2 + int(dx), sw - W))
        cy = max(0, min((sh - H) // 2 + int(dy), sh - H))
        frame = scaled.crop((cx, cy, cx + W, cy + H))
        if flash and 0.25 < t < 0.42:
            white = Image.new("RGB", (W, H), (255, 250, 240))
            a = 0.55 * math.sin((t - 0.25) / 0.17 * math.pi)
            frame = Image.blend(frame, white, a)
        frame.save(dest / f"f_{i:05d}.png")


def write_wav(path: Path, mono: np.ndarray) -> None:
    import wave

    mono = np.clip(mono, -1, 1)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mono * 32767).astype(np.int16).tobytes())


def synth(total: float, starts: list[float]) -> Path:
    n = int(total * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(3)
    audio = np.zeros(n)
    # drone + wind
    audio += 0.05 * np.sin(2 * np.pi * 55 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.12 * t))
    noise = rng.standard_normal(n)
    wind = np.zeros(n)
    for i in range(1, n):
        wind[i] = wind[i - 1] + 0.02 * (noise[i] - wind[i - 1])
    audio += 0.035 * wind

    def env(start, dur, atk=0.01, rel=0.2):
        e = np.zeros(n)
        a0, a1 = int(start * SR), min(int((start + dur) * SR), n)
        L = max(a1 - a0, 1)
        g = np.ones(L)
        A, R = max(int(atk * SR), 1), max(int(rel * SR), 1)
        g[: min(A, L)] = np.linspace(0, 1, min(A, L))
        if R < L:
            g[-R:] = np.linspace(1, 0, R)
        e[a0:a1] = g
        return e

    def click(at, amp=0.7):
        e = env(at, 0.1, 0.001, 0.07)
        return amp * e * (rng.standard_normal(n) * np.exp(-40 * np.maximum(t - at, 0)))

    def boom(at, amp=0.75):
        e = env(at, 1.0, 0.01, 0.8)
        return amp * e * np.sin(2 * np.pi * 45 * t) * np.exp(-2.2 * np.maximum(t - at, 0))

    def metal(at, dur=1.8, amp=0.35):
        out = np.zeros(n)
        for k in range(7):
            ct = at + 0.12 + k * (dur / 8)
            ce = env(ct, 0.07, 0.001, 0.05)
            out += amp * ce * np.sin(2 * np.pi * (850 + 350 * (k % 3)) * t) * np.exp(
                -22 * np.maximum(t - ct, 0)
            )
        return out

    # map beats
    # 0 key, 1 holo, 2 tap, 3 car, 4 hover, 5 lift, 6 explode, 7 half, 8 robot, 9 hold, 10 reform, 11 almost, 12 restored
    audio += 0.12 * env(starts[0] + 0.3, 0.25) * np.sin(2 * np.pi * 880 * t)
    audio += 0.18 * env(starts[1], 2.0, 0.05, 0.3) * np.sin(2 * np.pi * (220 + 400 * ((t - starts[1]) / 2).clip(0, 1)) * (t - starts[1]))
    audio += click(starts[2] + 0.4, 0.85)
    audio += click(starts[2] + 0.52, 0.4)
    audio += 0.1 * env(starts[4], 2.0, 0.2, 0.4) * np.sin(2 * np.pi * 110 * t)
    audio += boom(starts[6] + 0.1, 0.9)
    audio += metal(starts[6], 2.0, 0.45)
    audio += metal(starts[7], 2.0, 0.4)
    audio += boom(starts[8] + 0.15, 0.7)
    audio += 0.08 * env(starts[9], 2.5, 0.3, 0.5) * np.sin(2 * np.pi * 60 * t)
    audio += metal(starts[10], 2.0, 0.42)
    audio += boom(starts[10] + 0.2, 0.5)
    audio += boom(starts[12] + 0.25, 0.4)
    peak = np.max(np.abs(audio)) + 1e-9
    path = ROOT / "audio" / "sfx_sharp.wav"
    path.parent.mkdir(exist_ok=True)
    write_wav(path, 0.92 * audio / peak)
    return path


def main() -> None:
    work = Path(tempfile.mkdtemp(prefix="sharp_vfx_"))
    clips = []
    durs = []
    starts = []
    acc = 0.0

    print("Rendering sharp motion clips…")
    for idx, (name, dur, kind) in enumerate(BEATS):
        frames = int(round(dur * FPS))
        cdir = work / f"c{idx:02d}"
        render_clip(SHARP / name, frames, kind, cdir, flash=(idx == 2))
        mp4 = work / f"c{idx:02d}.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-framerate", str(FPS),
                "-i", str(cdir / "f_%05d.png"),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "15", "-preset", "slow",
                str(mp4),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        clips.append(mp4)
        durs.append(frames / FPS)
        starts.append(acc)
        if idx < len(BEATS) - 1:
            acc += durs[-1] - MICRO_XFADE
        else:
            acc += durs[-1]
        print(f"  {name}: {durs[-1]:.2f}s")

    # xfade stitch
    silent = work / "silent.mp4"
    inputs = []
    for c in clips:
        inputs += ["-i", str(c)]
    filters = []
    prev = "[0:v]"
    offset = durs[0] - MICRO_XFADE
    for i in range(1, len(clips)):
        lab = f"[v{i}]" if i < len(clips) - 1 else "[vout]"
        # hard-ish cut feel: very short fade
        filters.append(
            f"{prev}[{i}:v]xfade=transition=fade:duration={MICRO_XFADE}:offset={offset:.3f}{lab}"
        )
        prev = lab
        if i < len(clips) - 1:
            offset += durs[i] - MICRO_XFADE
    subprocess.run(
        [
            "ffmpeg", "-y", *inputs,
            "-filter_complex", ";".join(filters),
            "-map", "[vout]", "-r", str(FPS),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "15", "-preset", "slow",
            str(silent),
        ],
        check=True,
    )

    total = sum(durs) - MICRO_XFADE * (len(durs) - 1)
    sfx = synth(total, starts)
    OUT.parent.mkdir(exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(silent), "-i", str(sfx),
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
            "-movflags", "+faststart", str(OUT),
        ],
        check=True,
    )
    subprocess.run(["cp", str(OUT), str(ARTIFACT)], check=True)
    subprocess.run(["cp", str(OUT), str(DOWNLOAD)], check=True)
    print("DONE", OUT, OUT.stat().st_size, f"{total:.1f}s")


if __name__ == "__main__":
    main()
