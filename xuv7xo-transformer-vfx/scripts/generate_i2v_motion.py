#!/usr/bin/env python3
"""Generate real motion video clips from photoreal keyframes via HF Spaces SVD, then stitch."""

from __future__ import annotations

import shutil
import subprocess
import time
from pathlib import Path

from gradio_client import Client, handle_file

ROOT = Path(__file__).resolve().parents[1]
KF = ROOT / "keyframes"
CLIPS = ROOT / "output" / "i2v_clips"
OUT = ROOT / "output" / "xuv7xo_PHOTOREAL_motion_vfx.mp4"
ARTIFACT = Path("/opt/cursor/artifacts/REAL_VIDEO_xuv7xo_transformer.mp4")
ARTIFACT2 = Path("/opt/cursor/artifacts/xuv7xo_PHOTOREAL_motion_vfx.mp4")

# (filename, motion_bucket, fps, seed) — higher motion_bucket = more motion
SHOTS = [
    ("01_key_fob_intro.png", 140, 7, 11),
    ("02_traverse_models.png", 160, 7, 22),
    ("04_key_tap.png", 120, 7, 33),
    ("05_car_field.png", 90, 7, 44),
    ("06_car_hover.png", 150, 7, 55),
    ("07_explode_start.png", 180, 7, 66),
    ("08_mechanical_unfold.png", 170, 7, 77),
    ("09_robot_formed.png", 110, 7, 88),
    ("10_robot_hold.png", 80, 7, 99),
    ("11_reform_mid.png", 170, 7, 111),
    ("12_car_restored.png", 70, 7, 122),
]


def gen_clip(client: Client, src: Path, dest: Path, motion: float, fps: float, seed: int) -> None:
    print(f"  I2V {src.name} motion={motion} …", flush=True)
    # Resize first (API expects that path on some spaces)
    try:
        resized = client.predict(handle_file(str(src)), api_name="/resize_image")
        img = resized if isinstance(resized, str) else (resized.get("path") if isinstance(resized, dict) else src)
    except Exception:
        img = str(src)

    result = client.predict(
        handle_file(img) if isinstance(img, str) else handle_file(str(src)),
        seed,
        False,  # randomize_seed
        motion,
        fps,
        1.2,  # max_guidance
        1.0,  # min_guidance
        1024,
        576,
        4,  # steps
        api_name="/video",
    )
    # result is (video_dict_or_path, seed)
    video = result[0]
    if isinstance(video, dict):
        video_path = video.get("video") or video.get("path")
    else:
        video_path = video
    if not video_path:
        raise RuntimeError(f"No video returned for {src.name}: {result!r}")
    shutil.copy(video_path, dest)
    print(f"    -> {dest} ({dest.stat().st_size} bytes)", flush=True)


def stitch(clips: list[Path], audio: Path, out: Path) -> None:
    # Normalize each clip to 1280x720 24fps
    norm_dir = CLIPS / "_norm"
    norm_dir.mkdir(parents=True, exist_ok=True)
    norms = []
    for i, c in enumerate(clips):
        n = norm_dir / f"n_{i:02d}.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(c),
                "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-an",
                str(n),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        norms.append(n)

    # Probe durations
    durs = []
    for n in norms:
        outp = subprocess.check_output(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(n),
            ],
            text=True,
        ).strip()
        durs.append(float(outp))

    xfade = 0.35
    inputs = []
    for n in norms:
        inputs.extend(["-i", str(n)])
    inputs.extend(["-i", str(audio)])

    filters = []
    prev = "[0:v]"
    offset = durs[0] - xfade
    for i in range(1, len(norms)):
        label = f"[v{i}]" if i < len(norms) - 1 else "[vout]"
        filters.append(
            f"{prev}[{i}:v]xfade=transition=fade:duration={xfade}:offset={offset:.3f}{label}"
        )
        prev = label
        if i < len(norms) - 1:
            offset += durs[i] - xfade

    fc = ";".join(filters)
    audio_idx = len(norms)
    cmd = [
        "ffmpeg", "-y", *inputs,
        "-filter_complex", fc,
        "-map", "[vout]",
        "-map", f"{audio_idx}:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        str(out),
    ]
    subprocess.run(cmd, check=True)


def main() -> None:
    CLIPS.mkdir(parents=True, exist_ok=True)
    print("Connecting to AnimateLCM-SVD space…", flush=True)
    client = Client("wangfuyun/AnimateLCM-SVD")

    clip_paths: list[Path] = []
    for name, motion, fps, seed in SHOTS:
        dest = CLIPS / f"{Path(name).stem}.mp4"
        if dest.exists() and dest.stat().st_size > 50_000:
            print(f"  skip existing {dest.name}", flush=True)
        else:
            for attempt in range(3):
                try:
                    gen_clip(client, KF / name, dest, motion, fps, seed)
                    break
                except Exception as e:
                    print(f"    attempt {attempt+1} failed: {e}", flush=True)
                    time.sleep(8)
            else:
                raise RuntimeError(f"Failed I2V for {name}")
        clip_paths.append(dest)

    audio = ROOT / "audio" / "sfx_bed.wav"
    # Pad audio to ~40s for longer stitch
    audio_pad = CLIPS / "sfx_pad.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-stream_loop", "2", "-i", str(audio), "-t", "45", str(audio_pad)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    print("Stitching continuous photoreal motion video…", flush=True)
    stitch(clip_paths, audio_pad, OUT)
    shutil.copy(OUT, ARTIFACT)
    shutil.copy(OUT, ARTIFACT2)
    print("DONE", OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
