"""
Generate every launcher icon from the client's app icon.

    python scripts/generate-icons.py

Source: assets/brand/app-icon.png (navy shield with gold scales and gavel, 1024 px,
drawn as a rounded square on white). The full-bleed navy area inside the
rounded square is cropped and used as the icon artwork.

Outputs
  android/app/src/main/res/mipmap-*/ic_launcher.png             legacy rounded square
  android/app/src/main/res/mipmap-*/ic_launcher_round.png       legacy round
  android/app/src/main/res/mipmap-*/ic_launcher_foreground.png  adaptive foreground (API 26+)
  android/app/src/main/res/mipmap-anydpi-v26/ic_launcher(_round).xml
  android/app/src/main/res/values/ic_launcher_background.xml   adaptive background colour
  assets/brand/playstore-icon-512.png                           Play Store icon

An adaptive icon only guarantees the central 66dp circle of its 108dp canvas,
so the artwork is scaled to 70% there and its edges fade into the background colour.
"""

import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'brand', 'app-icon.png')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
CROP = (170, 170, 854, 854)  # inside the rounded square, no white corners


def load_art():
    return Image.open(SRC).convert('RGB').crop(CROP)


def edge_colour(art):
    w, h = art.size
    px = [art.getpixel((x, y)) for x in range(0, w, 8) for y in (2, h - 3)]
    px += [art.getpixel((x, y)) for y in range(0, h, 8) for x in (2, w - 3)]
    return tuple(sum(c[i] for c in px) // len(px) for i in range(3))


def masked(img, shape):
    size = img.width
    big = size * 4
    mask = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(mask)
    if shape == 'circle':
        d.ellipse((0, 0, big - 1, big - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img.convert('RGBA'), (0, 0), mask.resize((size, size), Image.LANCZOS))
    return out


def foreground(art, size, bg):
    canvas = Image.new('RGBA', (size, size), bg + (255,))
    inner = int(size * 0.70)
    a = art.resize((inner, inner), Image.LANCZOS).convert('RGBA')
    fade = Image.new('L', (inner, inner), 0)
    m = int(inner * 0.06)
    ImageDraw.Draw(fade).rectangle((m, m, inner - m, inner - m), fill=255)
    a.putalpha(fade.filter(ImageFilter.GaussianBlur(m / 2)))
    canvas.alpha_composite(a, ((size - inner) // 2, (size - inner) // 2))
    return canvas


def main():
    art = load_art()
    bg = edge_colour(art)
    for name, k in DENSITIES.items():
        d = os.path.join(RES, 'mipmap-' + name)
        os.makedirs(d, exist_ok=True)
        s = int(48 * k)
        small = art.resize((s, s), Image.LANCZOS)
        masked(small, 'rounded').save(os.path.join(d, 'ic_launcher.png'))
        masked(small, 'circle').save(os.path.join(d, 'ic_launcher_round.png'))
        foreground(art, int(108 * k), bg).save(os.path.join(d, 'ic_launcher_foreground.png'))
    any_dir = os.path.join(RES, 'mipmap-anydpi-v26')
    os.makedirs(any_dir, exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@color/ic_launcher_background"/>\n'
           '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
           '</adaptive-icon>\n')
    for n in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(os.path.join(any_dir, n), 'w') as f:
            f.write(xml)
    with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                '    <color name="ic_launcher_background">#%02X%02X%02X</color>\n</resources>\n' % bg)
    art.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'brand', 'playstore-icon-512.png'))
    print('icons written, background #%02X%02X%02X' % bg)


if __name__ == '__main__':
    main()
