# Mahindra XUV 7XO — Sharp Cinematic Transformer VFX

## Final deliverable (sharp, no I2V blur)

`output/xuv7xo_SHARP_cinematic_vfx.mp4` — ~28s, 1280×720, CRF15, mechanical SFX

Built from **sharp photoreal keyframes** (no Stable-Video / morph blur). Micro camera pushes + hard cuts.

## Rebuild

```bash
python3 scripts/compose_sharp_cinematic.py
```

## Note on fluid CGI motion

True continuous Transformer-style mechanical animation (panel-by-panel unfolding without blur) needs a dedicated video model API (Kling / Runway / Veo / fal.ai). Provide an API key to unlock that quality tier.
