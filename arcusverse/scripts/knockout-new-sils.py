from PIL import Image
import os

dst = r"C:\Users\osinha\Projects\ArcusVerse\public\art"
src = r"C:\Users\osinha\.cursor\projects\c-Users-osinha-Projects-ArcusVerse\assets"
files = [
    "sil-badminton-serve.png",
    "sil-badminton-shuttle.png",
    "sil-badminton-racket.png",
    "sil-tt-forehand.png",
    "sil-tt-serve.png",
    "sil-tt-paddle.png",
    "sil-tt-ball.png",
]

for name in files:
    src_path = os.path.join(src, name)
    path = os.path.join(dst, name)
    im = Image.open(src_path).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r < 45 and g < 45 and b < 45:
                px[x, y] = (0, 0, 0, 0)
            elif max(r, g, b) - min(r, g, b) < 18 and r > 200:
                # knock light gray/white noise if any
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (56, 140, 210, 255)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.save(path)
    print(name, im.size)
