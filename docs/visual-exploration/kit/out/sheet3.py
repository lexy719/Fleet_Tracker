import sys
from PIL import Image
out, ids = sys.argv[1], sys.argv[2:]
im = Image.new("RGB", (1600, ((len(ids)+1)//2)*500), "white")
for i, s in enumerate(ids):
    im.paste(Image.open(f"../spatial/{s}.png").convert("RGB").resize((794, 494)), ((i%2)*800+3, (i//2)*500+3))
im.save(out)
