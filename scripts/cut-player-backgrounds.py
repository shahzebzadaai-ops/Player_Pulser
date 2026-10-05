"""Replace the solid black studio background on player caricatures with transparency.

The cutout is a flood from the image edges through near-black, low-chroma pixels.
Blue jerseys and hair that are not connected through that background stay intact.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets" / "players"


def near_black(r: int, g: int, b: int, limit: int, chroma: int) -> bool:
    brightest = r if r >= g and r >= b else g if g >= b else b
    darkest = r if r <= g and r <= b else g if g <= b else b
    return brightest <= limit and brightest - darkest <= chroma


def cut(path: Path) -> None:
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    raw = bytearray(image.tobytes())
    seen = bytearray(width * height)
    queue: list[int] = []

    def consider(index: int) -> None:
        if seen[index]:
            return
        offset = index * 4
        if not near_black(raw[offset], raw[offset + 1], raw[offset + 2], 6, 6):
            return
        seen[index] = 1
        queue.append(index)

    for x in range(width):
        consider(x)
        consider((height - 1) * width + x)
    for y in range(height):
        consider(y * width)
        consider(y * width + width - 1)

    head = 0
    while head < len(queue):
        index = queue[head]
        head += 1
        offset = index * 4
        raw[offset + 3] = 0
        x = index % width
        y = index // width
        if x > 0:
            consider(index - 1)
        if x + 1 < width:
            consider(index + 1)
        if y > 0:
            consider(index - width)
        if y + 1 < height:
            consider(index + width)

    Image.frombytes("RGBA", (width, height), bytes(raw)).save(path, "WEBP", quality=86, method=4)


def main() -> None:
    files = sorted(ROOT.glob("*.webp"))
    if not files:
        raise SystemExit(f"No player artwork in {ROOT}")
    for path in files:
        cut(path)
        print(path.name)


if __name__ == "__main__":
    main()
