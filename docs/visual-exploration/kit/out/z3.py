import sys
from PIL import Image
out, ids = sys.argv[1], sys.argv[2:]
tw, th, cols = 640, 400, 3
im = Image.new("RGB", (cols*tw, ((len(ids)+cols-1)//cols)*th), "white")
for i, s in enumerate(ids):
    im.paste(Image.open(f"../zero/{s}.png").convert("RGB").resize((tw-4, th-4)), ((i%cols)*tw+2, (i//cols)*th+2))
im.save(out)
