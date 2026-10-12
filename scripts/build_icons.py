"""Build PNG, Apple touch and ICO icons from the source SVG during Pages deployment."""
import io
import sys
from pathlib import Path

import cairosvg
from PIL import Image

source = Path(sys.argv[1])
output = Path(sys.argv[2])
svg = source.read_bytes()

for filename, size in [('favicon-32.png', 32), ('apple-touch-icon.png', 180)]:
    (output / filename).write_bytes(cairosvg.svg2png(bytestring=svg, output_width=size, output_height=size))

image = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg, output_width=64, output_height=64))).convert('RGBA')
image.save(output / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
