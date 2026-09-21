#!/usr/bin/env python3
"""Compose a cinematic Transformer-style VFX video from keyframes + SFX."""

from __future__ import annotations

import math
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
KF = ROOT / "keyframes"
AUDIO = ROOT / "audio"
OUT = ROOT / "output"
FPS = 24
W, H = 1280, 720
SR = 44100

# duration (seconds) per beat — overlaps handled by crossfade later
BEATS = [
    ("01_key_fob_intro.png", 2.4, "slow_push"),
    ("02_traverse_models.png", 2.8, "pan_right"),
    ("03_7xo_appears.png", 2.0, "slow_push"),
    ("04_key_tap.png", 1.1, "punch_zoom"),
    ("05_car_field.png", 2.0, "static"),
    ("06_car_hover.png", 2.0, "float"),
    ("07_explode_start.png", 2.2, "shake"),
    ("08_mechanical_unfold.png", 2.4, "rise"),
    ("09_robot_formed.png", 2.0, "slow_push"),
    ("10_robot_hold.png", 2.6, "static"),
    ("11_reform_mid.png", 2.4, "shake"),
    ("12_car_restored.png", 2.8, "settle"),
]
XFADE = 0.45


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def ease_in_out(t: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * t)


def sample_motion(kind: str, t: float, n: int, i: int) -> tuple[float, float, float]:
    """Return (scale, dx, dy) for frame progress t in [0,1]."""
    if kind == "slow_push":
        s = 1.0 + 0.08 * ease_in_out(t)
        return s, 0.0, -4.0 * t
    if kind == "pan_right":
        s = 1.06
        return s, -28.0 * t, 0.0
    if kind == "punch_zoom":
        # quick punch then settle
        punch = math.sin(min(t, 0.35) / 0.35 * math.pi) * 0.12
        s = 1.04 + punch
        return s, 0.0, 2.0 * punch * 20
    if kind == "float":
        s = 1.03 + 0.015 * math.sin(t * math.pi * 2)
        return s, 0.0, -6.0 - 4.0 * math.sin(t * math.pi)
    if kind == "shake":
        s = 1.05 + 0.03 * t
        dx = 6.0 * math.sin(i * 1.7) * (0.4 + 0.6 * t)
        dy = 4.0 * math.cos(i * 2.1) * (0.4 + 0.6 * t)
        return s, dx, dy
    if kind == "rise":
        s = 1.0 + 0.12 * ease_in_out(t)
        return s, 0.0, 18.0 * (1.0 - t) - 8.0
    if kind == "settle":
        s = 1.08 - 0.06 * ease_in_out(t)
        return s, 0.0, -3.0 * (1.0 - t)
    # static
    return 1.02, 0.0, 0.0


def render_clip(src: Path, frames: int, kind: str, dest_dir: Path) -> None:
    base = Image.open(src).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
    # slight film grade
    base = ImageEnhance.Contrast(base).enhance(1.08)
    base = ImageEnhance.Color(base).enhance(1.05)
    for i in range(frames):
        t = i / max(frames - 1, 1)
        scale, dx, dy = sample_motion(kind, t, frames, i)
        sw, sh = int(W * scale), int(H * scale)
        scaled = base.resize((sw, sh), Image.Resampling.LANCZOS)
        cx = (sw - W) // 2 + int(dx)
        cy = (sh - H) // 2 + int(dy)
        cx = max(0, min(cx, sw - W))
        cy = max(0, min(cy, sh - H))
        frame = scaled.crop((cx, cy, cx + W, cy + H))
        # vignette-ish darken edges for cinematic feel
        if kind in ("shake", "explode", "rise") or "explode" in src.name:
            frame = ImageEnhance.Brightness(frame).enhance(1.0 + 0.03 * math.sin(t * math.pi))
        frame.save(dest_dir / f"f_{i:05d}.png")


def write_wav(path: Path, mono: np.ndarray) -> None:
    import wave
    import struct

    mono = np.clip(mono, -1.0, 1.0)
    pcm = (mono * 32767.0).astype(np.int16)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def synth_sfx(total_dur: float) -> Path:
    """Synthesize mechanical / cinematic bed + hits timed to beats."""
    n = int(total_dur * SR)
    t = np.arange(n) / SR
    audio = np.zeros(n, dtype=np.float64)

    # low cinematic drone
    drone = 0.06 * np.sin(2 * np.pi * 55 * t)
    drone += 0.04 * np.sin(2 * np.pi * 82 * t)
    # slow LFO
    drone *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.15 * t)
    audio += drone

    # wind / field ambience (filtered noise)
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(n)
    # simple one-pole lowpass
    wind = np.zeros(n)
    a = 0.02
    for i in range(1, n):
        wind[i] = wind[i - 1] + a * (noise[i] - wind[i - 1])
    audio += 0.04 * wind

    def env_seg(start: float, dur: float, attack: float = 0.02, release: float = 0.2) -> np.ndarray:
        e = np.zeros(n)
        s0 = int(start * SR)
        s1 = int((start + dur) * SR)
        s1 = min(s1, n)
        length = max(s1 - s0, 1)
        local = np.linspace(0, 1, length)
        atk = max(int(attack * SR), 1)
        rel = max(int(release * SR), 1)
        gain = np.ones(length)
        gain[: min(atk, length)] = np.linspace(0, 1, min(atk, length))
        if rel < length:
            gain[-rel:] = np.linspace(1, 0, rel)
        e[s0:s1] = gain
        return e

    # cumulative beat starts (approx, ignoring xfade for hit timing)
    starts = []
    acc = 0.0
    for _, dur, _ in BEATS:
        starts.append(acc)
        acc += dur - XFADE
    # last beat doesn't subtract after
    # recompute more carefully with same formula as video
    starts = []
    acc = 0.0
    for idx, (_, dur, _) in enumerate(BEATS):
        starts.append(acc)
        if idx < len(BEATS) - 1:
            acc += dur - XFADE
        else:
            acc += dur

    def add_click(at: float, amp: float = 0.55):
        e = env_seg(at, 0.12, 0.001, 0.08)
        click = amp * e * (rng.standard_normal(n) * np.exp(-35 * np.maximum(t - at, 0)))
        click += amp * 0.4 * e * np.sin(2 * np.pi * 1800 * t) * np.exp(-40 * np.maximum(t - at, 0))
        return click

    def add_servo(at: float, dur: float = 1.2, amp: float = 0.28):
        e = env_seg(at, dur, 0.05, 0.3)
        # rising chirps
        phase = 2 * np.pi * (220 + 680 * np.clip((t - at) / max(dur, 0.01), 0, 1)) * (t - at)
        servo = amp * e * np.sin(phase)
        servo += amp * 0.15 * e * rng.standard_normal(n)
        return servo

    def add_hydraulic(at: float, dur: float = 1.5, amp: float = 0.35):
        e = env_seg(at, dur, 0.08, 0.4)
        hiss = amp * e * wind * 3.0
        thump = amp * 0.7 * env_seg(at, 0.35, 0.005, 0.3) * np.sin(2 * np.pi * 70 * t)
        return hiss + thump

    def add_boom(at: float, amp: float = 0.7):
        e = env_seg(at, 1.2, 0.01, 0.9)
        boom = amp * e * np.sin(2 * np.pi * 42 * t) * np.exp(-2.5 * np.maximum(t - at, 0))
        boom += amp * 0.3 * e * wind
        return boom

    def add_metal_shift(at: float, dur: float = 2.0, amp: float = 0.32):
        e = env_seg(at, dur, 0.05, 0.35)
        # metallic clanks at irregular intervals
        clank = np.zeros(n)
        for k in range(8):
            ct = at + 0.15 + k * (dur / 9)
            ce = env_seg(ct, 0.08, 0.001, 0.06)
            freq = 900 + 400 * (k % 3)
            clank += amp * ce * np.sin(2 * np.pi * freq * t) * np.exp(-25 * np.maximum(t - ct, 0))
        grind = amp * 0.2 * e * np.sin(2 * np.pi * (140 + 40 * np.sin(2 * np.pi * 3 * t)) * t)
        return clank + grind

    # Beat-aligned SFX
    # 0 key intro — soft beep
    audio += 0.15 * env_seg(starts[0] + 0.4, 0.3, 0.01, 0.2) * np.sin(2 * np.pi * 880 * t)
    # 1 traverse — soft whooshes
    audio += add_servo(starts[1], 2.2, 0.18)
    # 2 appear — confirm chime
    audio += 0.2 * env_seg(starts[2] + 0.3, 0.5, 0.01, 0.35) * np.sin(2 * np.pi * 660 * t)
    # 3 key tap
    audio += add_click(starts[3] + 0.35, 0.75)
    audio += add_click(starts[3] + 0.48, 0.35)
    # 4 field — silence almost, ambient only
    # 5 hover — rising hum
    audio += add_servo(starts[5], 1.8, 0.25)
    audio += 0.12 * env_seg(starts[5], 2.0, 0.2, 0.4) * np.sin(2 * np.pi * 110 * t)
    # 6 explode
    audio += add_boom(starts[6] + 0.15, 0.85)
    audio += add_metal_shift(starts[6] + 0.2, 2.0, 0.4)
    audio += add_hydraulic(starts[6] + 0.3, 1.8, 0.4)
    # 7 unfold
    audio += add_metal_shift(starts[7], 2.2, 0.45)
    audio += add_servo(starts[7] + 0.2, 2.0, 0.35)
    audio += add_hydraulic(starts[7] + 0.4, 1.8, 0.35)
    # 8 robot formed — impact
    audio += add_boom(starts[8] + 0.1, 0.9)
    audio += add_metal_shift(starts[8], 1.5, 0.25)
    # 9 hold — power hum
    audio += 0.1 * env_seg(starts[9], 2.4, 0.3, 0.5) * np.sin(2 * np.pi * 60 * t)
    audio += 0.05 * env_seg(starts[9], 2.4, 0.3, 0.5) * np.sin(2 * np.pi * 240 * t)
    # 10 reform
    audio += add_metal_shift(starts[10], 2.2, 0.42)
    audio += add_servo(starts[10], 2.0, 0.3)
    audio += add_hydraulic(starts[10] + 0.2, 1.8, 0.35)
    # 11 settle
    audio += add_boom(starts[11] + 0.2, 0.45)
    audio += 0.12 * env_seg(starts[11] + 0.8, 0.6, 0.02, 0.4) * np.sin(2 * np.pi * 523 * t)

    # soft limiter
    peak = np.max(np.abs(audio)) + 1e-9
    audio = 0.92 * audio / peak
    path = AUDIO / "sfx_bed.wav"
    write_wav(path, audio)
    return path


def concat_with_xfade(clip_paths: list[Path], durations: list[float], out_path: Path) -> float:
    """Use ffmpeg xfade to stitch clips. Returns total duration."""
    if len(clip_paths) == 1:
        run(["ffmpeg", "-y", "-i", str(clip_paths[0]), "-c", "copy", str(out_path)])
        return durations[0]

    # Build filter_complex
    inputs = []
    for p in clip_paths:
        inputs.extend(["-i", str(p)])

    filters = []
    # offset accumulates: first clip full, then each next starts at prev_end - xfade
    offset = durations[0] - XFADE
    prev = "[0:v]"
    for i in range(1, len(clip_paths)):
        out_label = f"[v{i}]" if i < len(clip_paths) - 1 else "[vout]"
        filters.append(
            f"{prev}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={offset:.3f}{out_label}"
        )
        prev = out_label
        if i < len(clip_paths) - 1:
            offset += durations[i] - XFADE

    total = sum(durations) - XFADE * (len(durations) - 1)
    fc = ";".join(filters)
    cmd = [
        "ffmpeg",
        "-y",
        *inputs,
        "-filter_complex",
        fc,
        "-map",
        "[vout]",
        "-r",
        str(FPS),
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        str(out_path),
    ]
    run(cmd)
    return total


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    AUDIO.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="xuv7xo_vfx_"))
    clip_paths: list[Path] = []
    durations: list[float] = []

    print("Rendering keyframe motion clips…")
    for name, dur, kind in BEATS:
        frames = int(round(dur * FPS))
        clip_dir = work / name.replace(".png", "")
        clip_dir.mkdir()
        render_clip(KF / name, frames, kind, clip_dir)
        clip_mp4 = work / f"{name}.mp4"
        run(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                str(FPS),
                "-i",
                str(clip_dir / "f_%05d.png"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "18",
                str(clip_mp4),
            ]
        )
        clip_paths.append(clip_mp4)
        durations.append(frames / FPS)
        print(f"  {name}: {frames} frames ({durations[-1]:.2f}s) [{kind}]")

    silent = work / "silent.mp4"
    print("Crossfading clips…")
    total = concat_with_xfade(clip_paths, durations, silent)
    print(f"Video duration ≈ {total:.2f}s")

    print("Synthesizing mechanical SFX…")
    sfx = synth_sfx(total)

    final = OUT / "mahindra_xuv7xo_transformer_vfx.mp4"
    print("Muxing audio…")
    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(silent),
            "-i",
            str(sfx),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(final),
        ]
    )

    # also write a high-quality artifact copy
    artifact = Path("/opt/cursor/artifacts/mahindra_xuv7xo_transformer_vfx.mp4")
    run(["cp", str(final), str(artifact)])

    # preview strip of key moments
    strip_names = [
        "01_key_fob_intro.png",
        "04_key_tap.png",
        "06_car_hover.png",
        "08_mechanical_unfold.png",
        "09_robot_formed.png",
        "12_car_restored.png",
    ]
    thumbs = [Image.open(KF / n).resize((320, 180), Image.Resampling.LANCZOS) for n in strip_names]
    strip = Image.new("RGB", (320 * len(thumbs), 180))
    for i, th in enumerate(thumbs):
        strip.paste(th, (i * 320, 0))
    strip_path = OUT / "storyboard_strip.png"
    strip.save(strip_path)
    run(["cp", str(strip_path), "/opt/cursor/artifacts/xuv7xo_storyboard_strip.png"])

    print(f"Done: {final}")
    print(f"Artifact: {artifact}")


if __name__ == "__main__":
    main()
