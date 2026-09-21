# Mahindra XUV 7XO — Transformer-Style Cinematic VFX

Cinematic short film of the **Mahindra XUV 7XO Galaxy Grey** transforming into a towering photorealistic robot and reforming — driven by a Mahindra smart key used as a remote.

## Sequence

1. **Key remote** — Extreme close-up of the Mahindra key fob held like a remote over an open field
2. **Model traverse** — Holographic cycle through Mahindra models
3. **7XO lock-on** — Galaxy Grey XUV 7XO materializes; key button is tapped
4. **Hover** — Static camera; SUV lifts slightly above the grass
5. **Detonation unfold** — Panels explode outward into hydraulics, gears, and glowing armor
6. **Robot form** — Photorealistic towering mech holds in the field
7. **Reform** — Mechanical reverse transform back to the original parked SUV

## Output

| File | Description |
|------|-------------|
| `output/mahindra_xuv7xo_transformer_vfx.mp4` | Final 1280×720 @ 24fps cinematic cut with mechanical SFX |
| `output/storyboard_strip.png` | Keyframe storyboard strip |
| `keyframes/` | Generated cinematic keyframes |
| `reference-xuv7xo.jpg` | Source Galaxy Grey reference still |

## Rebuild

```bash
python3 xuv7xo-transformer-vfx/scripts/compose_vfx.py
```

Requires: Python 3, Pillow, NumPy, FFmpeg.
