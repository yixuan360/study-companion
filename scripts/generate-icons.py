from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = "public/icons"
os.makedirs(OUT_DIR, exist_ok=True)


def make_icon(size: int, path: str):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    radius = size // 8
    margin = size // 16
    draw.rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=radius,
        fill=(79, 70, 229),  # indigo-600
    )

    # Inner circle
    draw.ellipse(
        (size * 0.22, size * 0.22, size * 0.78, size * 0.78),
        fill=(255, 255, 255, 230),
    )

    # Text "学"
    font_size = int(size * 0.45)
    try:
        # Try a system Chinese font; fallbacks are harmless if missing.
        font = ImageFont.truetype("arial.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), "学", font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1] - size * 0.03
    draw.text((x, y), "学", font=font, fill=(79, 70, 229))

    img.save(path)


make_icon(192, os.path.join(OUT_DIR, "icon-192.png"))
make_icon(512, os.path.join(OUT_DIR, "icon-512.png"))

# Apple touch icon (180x180) based on 192
Image.open(os.path.join(OUT_DIR, "icon-192.png")).resize(
    (180, 180), Image.Resampling.LANCZOS
).save(os.path.join(OUT_DIR, "apple-touch-icon.png"))

print("Icons generated in", OUT_DIR)
