from __future__ import annotations

import argparse
import io
import json
import struct
from pathlib import Path

from PIL import Image


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def pad4(data: bytes, pad_byte: bytes) -> bytes:
    padding = (-len(data)) % 4
    return data + (pad_byte * padding)


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
      raise ValueError(f"{path} is not a GLB v2 file")
    if total_length != len(data):
      raise ValueError(f"{path} length mismatch")

    offset = 12
    json_data = None
    bin_data = None

    while offset < len(data):
      chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
      chunk_start = offset + 8
      chunk_end = chunk_start + chunk_length
      chunk_data = data[chunk_start:chunk_end]

      if chunk_type == JSON_CHUNK:
        json_data = json.loads(chunk_data.rstrip(b" \t\r\n\0").decode("utf-8"))
      elif chunk_type == BIN_CHUNK:
        bin_data = chunk_data

      offset = chunk_end

    if json_data is None or bin_data is None:
      raise ValueError(f"{path} must contain JSON and BIN chunks")

    return json_data, bin_data


def write_glb(path: Path, gltf: dict, bin_data: bytes) -> None:
    json_bytes = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bin_bytes = pad4(bin_data, b"\0")
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

    with path.open("wb") as handle:
      handle.write(struct.pack("<4sII", b"glTF", 2, total_length))
      handle.write(struct.pack("<II", len(json_bytes), JSON_CHUNK))
      handle.write(json_bytes)
      handle.write(struct.pack("<II", len(bin_bytes), BIN_CHUNK))
      handle.write(bin_bytes)


def resize_image(data: bytes, mime_type: str, max_size: int, jpeg_quality: int) -> tuple[bytes, str, tuple[int, int], tuple[int, int]]:
    with Image.open(io.BytesIO(data)) as image:
      original_size = image.size
      image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
      resized_size = image.size

      output = io.BytesIO()
      has_alpha = image.mode in ("RGBA", "LA") or ("transparency" in image.info)

      if has_alpha:
        image.save(output, format="PNG", optimize=True)
        return output.getvalue(), "image/png", original_size, resized_size

      image.convert("RGB").save(
        output,
        format="JPEG",
        quality=jpeg_quality,
        optimize=True,
        progressive=True,
      )
      return output.getvalue(), "image/jpeg", original_size, resized_size


def build_mobile_glb(input_path: Path, output_path: Path, max_texture_size: int, jpeg_quality: int) -> list[dict]:
    gltf, bin_data = read_glb(input_path)
    buffer_views = gltf.get("bufferViews", [])
    replacements: dict[int, tuple[bytes, str, tuple[int, int], tuple[int, int]]] = {}
    report = []

    for image_index, image in enumerate(gltf.get("images", [])):
      view_index = image.get("bufferView")
      if view_index is None:
        continue

      view = buffer_views[view_index]
      start = view.get("byteOffset", 0)
      end = start + view["byteLength"]
      source_bytes = bin_data[start:end]
      resized_bytes, next_mime, original_size, resized_size = resize_image(
        source_bytes,
        image.get("mimeType", ""),
        max_texture_size,
        jpeg_quality,
      )

      replacements[view_index] = (resized_bytes, next_mime, original_size, resized_size)
      image["mimeType"] = next_mime

      report.append(
        {
          "image": image.get("name", f"image_{image_index}"),
          "mimeType": next_mime,
          "originalSize": original_size,
          "resizedSize": resized_size,
          "originalBytes": len(source_bytes),
          "mobileBytes": len(resized_bytes),
        }
      )

    chunks: list[bytes] = []
    offset = 0

    for view_index, view in enumerate(buffer_views):
      replacement = replacements.get(view_index)

      if replacement is None:
        start = view.get("byteOffset", 0)
        next_bytes = bin_data[start:start + view["byteLength"]]
      else:
        next_bytes = replacement[0]

      view["byteOffset"] = offset
      view["byteLength"] = len(next_bytes)
      chunks.append(next_bytes)
      offset += len(next_bytes)

      padding = (-offset) % 4
      if padding:
        chunks.append(b"\0" * padding)
        offset += padding

    mobile_bin = b"".join(chunks)
    gltf["buffers"][0]["byteLength"] = len(mobile_bin)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_glb(output_path, gltf, mobile_bin)

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a lighter mobile GLB by resizing embedded textures.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-texture-size", type=int, default=1024)
    parser.add_argument("--jpeg-quality", type=int, default=62)
    args = parser.parse_args()

    report = build_mobile_glb(args.input, args.output, args.max_texture_size, args.jpeg_quality)
    print(json.dumps({"output": str(args.output), "images": report}, indent=2))


if __name__ == "__main__":
    main()
