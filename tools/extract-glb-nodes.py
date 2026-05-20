from __future__ import annotations

import argparse
import copy
import io
import json
import re
import struct
from pathlib import Path
from typing import Any

from PIL import Image


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def pad4(data: bytes, pad_byte: bytes) -> bytes:
    padding = (-len(data)) % 4
    return data + (pad_byte * padding)


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
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


def write_glb(path: Path, gltf: dict[str, Any], bin_data: bytes) -> None:
    json_bytes = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bin_bytes = pad4(bin_data, b"\0")
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

    with path.open("wb") as handle:
        handle.write(struct.pack("<4sII", b"glTF", 2, total_length))
        handle.write(struct.pack("<II", len(json_bytes), JSON_CHUNK))
        handle.write(json_bytes)
        handle.write(struct.pack("<II", len(bin_bytes), BIN_CHUNK))
        handle.write(bin_bytes)


def slugify(value: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or fallback


def buffer_view_bytes(gltf: dict[str, Any], bin_data: bytes, buffer_view_index: int) -> bytes:
    view = gltf["bufferViews"][buffer_view_index]
    offset = view.get("byteOffset", 0)
    length = view["byteLength"]
    return bin_data[offset : offset + length]


def convert_image(data: bytes, mime_type: str, max_size: int, jpeg_quality: int) -> tuple[bytes, str, dict[str, Any]]:
    with Image.open(io.BytesIO(data)) as image:
        original_size = image.size
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        resized_size = image.size
        has_alpha = image.mode in ("RGBA", "LA") or ("transparency" in image.info)
        output = io.BytesIO()

        if has_alpha:
            image.save(output, format="PNG", optimize=True)
            next_mime = "image/png"
        else:
            image.convert("RGB").save(output, format="JPEG", quality=jpeg_quality, optimize=True)
            next_mime = "image/jpeg"

        return (
            output.getvalue(),
            next_mime,
            {
                "originalSize": list(original_size),
                "resizedSize": list(resized_size),
                "originalBytes": len(data),
                "webBytes": output.tell(),
                "mimeType": next_mime,
            },
        )


def walk_texture_infos(value: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        if isinstance(value.get("index"), int):
            found.append(value)
        for key, nested in value.items():
            if key != "index":
                found.extend(walk_texture_infos(nested))
    elif isinstance(value, list):
        for item in value:
            found.extend(walk_texture_infos(item))
    return found


def union_bounds(mesh: dict[str, Any], accessors: list[dict[str, Any]]) -> dict[str, list[float]] | None:
    min_values = [float("inf"), float("inf"), float("inf")]
    max_values = [float("-inf"), float("-inf"), float("-inf")]
    found_position = False

    for primitive in mesh.get("primitives", []):
        position_index = primitive.get("attributes", {}).get("POSITION")
        if not isinstance(position_index, int):
            continue
        accessor = accessors[position_index]
        if "min" not in accessor or "max" not in accessor:
            continue
        found_position = True
        for index in range(3):
            min_values[index] = min(min_values[index], accessor["min"][index])
            max_values[index] = max(max_values[index], accessor["max"][index])

    if not found_position:
        return None

    return {"min": min_values, "max": max_values}


class Extractor:
    def __init__(self, gltf: dict[str, Any], bin_data: bytes, max_texture_size: int, jpeg_quality: int) -> None:
        self.gltf = gltf
        self.bin_data = bin_data
        self.max_texture_size = max_texture_size
        self.jpeg_quality = jpeg_quality

        self.accessor_map: dict[int, int] = {}
        self.buffer_view_map: dict[int, int] = {}
        self.material_map: dict[int, int] = {}
        self.texture_map: dict[int, int] = {}
        self.image_map: dict[int, int] = {}
        self.sampler_map: dict[int, int] = {}

        self.out_accessors: list[dict[str, Any]] = []
        self.out_buffer_views: list[dict[str, Any]] = []
        self.out_materials: list[dict[str, Any]] = []
        self.out_textures: list[dict[str, Any]] = []
        self.out_images: list[dict[str, Any]] = []
        self.out_samplers: list[dict[str, Any]] = []
        self.out_bin = bytearray()
        self.image_report: list[dict[str, Any]] = []

    def append_bytes(self, data: bytes) -> int:
        offset = len(self.out_bin)
        self.out_bin.extend(data)
        padding = (-len(self.out_bin)) % 4
        if padding:
            self.out_bin.extend(b"\0" * padding)
        return offset

    def include_buffer_view(self, index: int, override_data: bytes | None = None) -> int:
        if override_data is None and index in self.buffer_view_map:
            return self.buffer_view_map[index]

        source_view = self.gltf["bufferViews"][index]
        data = override_data if override_data is not None else buffer_view_bytes(self.gltf, self.bin_data, index)
        new_view = copy.deepcopy(source_view)
        new_view["buffer"] = 0
        new_view["byteOffset"] = self.append_bytes(data)
        new_view["byteLength"] = len(data)
        self.out_buffer_views.append(new_view)
        new_index = len(self.out_buffer_views) - 1

        if override_data is None:
            self.buffer_view_map[index] = new_index

        return new_index

    def include_accessor(self, index: int) -> int:
        if index in self.accessor_map:
            return self.accessor_map[index]

        source_accessor = copy.deepcopy(self.gltf["accessors"][index])
        if isinstance(source_accessor.get("bufferView"), int):
            source_accessor["bufferView"] = self.include_buffer_view(source_accessor["bufferView"])

        sparse = source_accessor.get("sparse")
        if isinstance(sparse, dict):
            indices = sparse.get("indices")
            values = sparse.get("values")
            if isinstance(indices, dict) and isinstance(indices.get("bufferView"), int):
                indices["bufferView"] = self.include_buffer_view(indices["bufferView"])
            if isinstance(values, dict) and isinstance(values.get("bufferView"), int):
                values["bufferView"] = self.include_buffer_view(values["bufferView"])

        self.out_accessors.append(source_accessor)
        new_index = len(self.out_accessors) - 1
        self.accessor_map[index] = new_index
        return new_index

    def include_sampler(self, index: int) -> int:
        if index in self.sampler_map:
            return self.sampler_map[index]

        self.out_samplers.append(copy.deepcopy(self.gltf.get("samplers", [])[index]))
        new_index = len(self.out_samplers) - 1
        self.sampler_map[index] = new_index
        return new_index

    def include_image(self, index: int) -> int:
        if index in self.image_map:
            return self.image_map[index]

        source_image = copy.deepcopy(self.gltf.get("images", [])[index])
        if isinstance(source_image.get("bufferView"), int):
            original_view = source_image["bufferView"]
            source_mime = source_image.get("mimeType", "image/png")
            image_data = buffer_view_bytes(self.gltf, self.bin_data, original_view)
            image_data, next_mime, report = convert_image(
                image_data,
                source_mime,
                self.max_texture_size,
                self.jpeg_quality,
            )
            report["name"] = source_image.get("name", f"image-{index}")
            self.image_report.append(report)
            source_image["bufferView"] = self.include_buffer_view(original_view, image_data)
            source_image["mimeType"] = next_mime

        self.out_images.append(source_image)
        new_index = len(self.out_images) - 1
        self.image_map[index] = new_index
        return new_index

    def include_texture(self, index: int) -> int:
        if index in self.texture_map:
            return self.texture_map[index]

        source_texture = copy.deepcopy(self.gltf.get("textures", [])[index])
        if isinstance(source_texture.get("source"), int):
            source_texture["source"] = self.include_image(source_texture["source"])
        if isinstance(source_texture.get("sampler"), int):
            source_texture["sampler"] = self.include_sampler(source_texture["sampler"])

        self.out_textures.append(source_texture)
        new_index = len(self.out_textures) - 1
        self.texture_map[index] = new_index
        return new_index

    def include_material(self, index: int) -> int:
        if index in self.material_map:
            return self.material_map[index]

        source_material = copy.deepcopy(self.gltf.get("materials", [])[index])
        for texture_info in walk_texture_infos(source_material):
            texture_info["index"] = self.include_texture(texture_info["index"])

        self.out_materials.append(source_material)
        new_index = len(self.out_materials) - 1
        self.material_map[index] = new_index
        return new_index

    def extract_mesh(self, mesh_index: int) -> dict[str, Any]:
        source_mesh = copy.deepcopy(self.gltf["meshes"][mesh_index])
        for primitive in source_mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            for key, accessor_index in list(attributes.items()):
                attributes[key] = self.include_accessor(accessor_index)

            if isinstance(primitive.get("indices"), int):
                primitive["indices"] = self.include_accessor(primitive["indices"])

            if isinstance(primitive.get("material"), int):
                primitive["material"] = self.include_material(primitive["material"])

            for target in primitive.get("targets", []):
                for key, accessor_index in list(target.items()):
                    target[key] = self.include_accessor(accessor_index)

        return source_mesh

    def gltf_for_node(self, node_index: int) -> tuple[dict[str, Any], dict[str, Any]]:
        node = self.gltf["nodes"][node_index]
        mesh_index = node.get("mesh")
        if not isinstance(mesh_index, int):
            raise ValueError(f"Node {node_index} has no mesh")

        source_mesh = self.gltf["meshes"][mesh_index]
        local_bounds = union_bounds(source_mesh, self.gltf.get("accessors", []))
        mesh = self.extract_mesh(mesh_index)

        out_node = {"name": node.get("name", f"node-{node_index}"), "mesh": 0}
        if "extras" in node:
            out_node["extras"] = copy.deepcopy(node["extras"])

        out_gltf: dict[str, Any] = {
            "asset": copy.deepcopy(self.gltf.get("asset", {"version": "2.0"})),
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [out_node],
            "meshes": [mesh],
            "accessors": self.out_accessors,
            "bufferViews": self.out_buffer_views,
            "buffers": [{"byteLength": len(self.out_bin)}],
        }

        if self.out_materials:
            out_gltf["materials"] = self.out_materials
        if self.out_textures:
            out_gltf["textures"] = self.out_textures
        if self.out_images:
            out_gltf["images"] = self.out_images
        if self.out_samplers:
            out_gltf["samplers"] = self.out_samplers
        if self.gltf.get("extensionsUsed"):
            out_gltf["extensionsUsed"] = copy.deepcopy(self.gltf["extensionsUsed"])
        if self.gltf.get("extensionsRequired"):
            out_gltf["extensionsRequired"] = copy.deepcopy(self.gltf["extensionsRequired"])

        transform: dict[str, Any] = {}
        for key in ("matrix", "translation", "rotation", "scale"):
            if key in node:
                transform[key] = copy.deepcopy(node[key])

        manifest_part = {
            "nodeIndex": node_index,
            "meshIndex": mesh_index,
            "name": node.get("name", f"node-{node_index}"),
            "meshName": source_mesh.get("name", f"mesh-{mesh_index}"),
            "transform": transform,
            "primitiveCount": len(source_mesh.get("primitives", [])),
        }

        if local_bounds is not None:
            manifest_part["localBounds"] = local_bounds

        return out_gltf, manifest_part


def extract_nodes(
    source: Path,
    output_dir: Path,
    scene_id: str,
    max_texture_size: int,
    jpeg_quality: int,
) -> dict[str, Any]:
    gltf, bin_data = read_glb(source)
    output_dir.mkdir(parents=True, exist_ok=True)
    parts_dir = output_dir / "parts"
    parts_dir.mkdir(exist_ok=True)

    manifest: dict[str, Any] = {
        "id": scene_id,
        "name": scene_id.replace("-", " ").title(),
        "source": source.name,
        "asset": gltf.get("asset", {}),
        "partCount": 0,
        "textureMaxSize": max_texture_size,
        "parts": [],
    }

    seen_slugs: dict[str, int] = {}

    for node_index, node in enumerate(gltf.get("nodes", [])):
        if not isinstance(node.get("mesh"), int):
            continue

        name = node.get("name", f"node-{node_index}")
        base_slug = slugify(name, f"node-{node_index}")
        count = seen_slugs.get(base_slug, 0)
        seen_slugs[base_slug] = count + 1
        slug = base_slug if count == 0 else f"{base_slug}-{count + 1}"

        extractor = Extractor(gltf, bin_data, max_texture_size, jpeg_quality)
        out_gltf, part = extractor.gltf_for_node(node_index)
        file_name = f"{slug}.glb"
        out_path = parts_dir / file_name
        write_glb(out_path, out_gltf, bytes(extractor.out_bin))

        part["id"] = slug
        part["src"] = f"parts/{file_name}"
        part["bytes"] = out_path.stat().st_size
        part["webImages"] = extractor.image_report
        manifest["parts"].append(part)

    manifest["partCount"] = len(manifest["parts"])
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract mesh nodes from a GLB into individual GLBs plus a scene manifest.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--scene-id", default=None)
    parser.add_argument("--max-texture-size", type=int, default=1024)
    parser.add_argument("--jpeg-quality", type=int, default=72)
    args = parser.parse_args()

    scene_id = args.scene_id or slugify(args.source.stem, "scene")
    manifest = extract_nodes(args.source, args.output_dir, scene_id, args.max_texture_size, args.jpeg_quality)
    total_bytes = sum(part["bytes"] for part in manifest["parts"])
    print(
        json.dumps(
            {
                "scene": manifest["id"],
                "parts": manifest["partCount"],
                "output": str(args.output_dir),
                "totalBytes": total_bytes,
                "largestPart": max((part["bytes"] for part in manifest["parts"]), default=0),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
