"""Pastes screenshots side by side into one contact sheet, so several views can be judged in one look.

    python assets-src/scripts/sheet.py OUT.png IN1.png IN2.png ... [--height 900]
"""
import sys

from PIL import Image


def main() -> None:
    args = sys.argv[1:]
    height = 900
    if "--height" in args:
        i = args.index("--height")
        height = int(args[i + 1])
        del args[i : i + 2]
    out, *inputs = args
    images = []
    for path in inputs:
        image = Image.open(path).convert("RGB")
        images.append(image.resize((round(image.width * height / image.height), height), Image.LANCZOS))
    sheet = Image.new("RGB", (sum(image.width for image in images), height), "white")
    x = 0
    for image in images:
        sheet.paste(image, (x, 0))
        x += image.width
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
