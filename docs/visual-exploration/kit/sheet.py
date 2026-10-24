# quick review montage: python sheet.py out.png ID ID ...
import sys
from PIL import Image
out, ids = sys.argv[1], sys.argv[2:]
tw, th, cols = 800, 500, 2
rows = (len(ids) + cols - 1) // cols
im = Image.new("RGB", (cols * tw, rows * th), "white")
for i, s in enumerate(ids):
    t = Image.open(f"../studies/{s}.png").convert("RGB").resize((tw - 6, th - 6), Image.LANCZOS)
    im.paste(t, ((i % cols) * tw + 3, (i // cols) * th + 3))
im.save(out)
