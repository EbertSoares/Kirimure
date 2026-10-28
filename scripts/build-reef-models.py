"""Convert the source FBX reef pack into normalized, web-ready GLB libraries.

Run with Blender, not the system Python:

    Blender --background --factory-startup --python scripts/build-reef-models.py -- \
      /path/to/Corals_FBX /path/to/output

The source files are never modified. Each mesh remains an independent named node,
while textures and materials are shared by the models in the same GLB library.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector


FBX_LIBRARIES = {
    "Corals.FBX": "corals-individual.glb",
    "CoralGroups.FBX": "coral-groups.glb",
    "CoralRocks.FBX": "coral-rocks.glb",
    "Seaweeds.FBX": "seaweeds.glb",
}

MATERIAL_TEXTURES = {
    "Coral_13_15_16": "Corals_13_14_15_16",
    "Coral_14": "Corals_13_14_15_16",
    "Coral_3_6": "Corals_3and6",
    "Corals_1_5_8_9": "Corals_1_5_8_9",
    "Corals_2_7_10_12": "Corals_2_7_10_12",
    "Volume4": "CoralRocks_Volume4",
}

CUTOUT_MATERIALS = {"Coral_14", "Coral_3_6"}


def arguments() -> tuple[Path, Path]:
    try:
        separator = sys.argv.index("--")
        source, output = sys.argv[separator + 1 : separator + 3]
    except (ValueError, IndexError):
        raise SystemExit("Expected: -- SOURCE_DIRECTORY OUTPUT_DIRECTORY")
    return Path(source).resolve(), Path(output).resolve()


def clean_name(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return cleaned or "reef-model"


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def image_node(nodes, image_path: Path, label: str, colorspace: str):
    image = bpy.data.images.load(str(image_path), check_existing=True)
    image.colorspace_settings.name = colorspace
    node = nodes.new("ShaderNodeTexImage")
    node.name = label
    node.label = label
    node.image = image
    node.interpolation = "Linear"
    return node


def rebuild_material(material, texture_dir: Path) -> None:
    prefix = MATERIAL_TEXTURES.get(material.name)
    if prefix is None:
        return

    diffuse_name = f"{prefix}_color.png" if material.name == "Volume4" else f"{prefix}_diff.png"
    normal_name = f"{prefix}_nmap.png" if material.name == "Volume4" else f"{prefix}_normal.png"
    gloss_name = f"{prefix}_gloss.png"
    diffuse_path = texture_dir / diffuse_name
    normal_path = texture_dir / normal_name
    gloss_path = texture_dir / gloss_name

    if not diffuse_path.exists():
        raise FileNotFoundError(f"Missing base-color texture: {diffuse_path}")

    material.use_nodes = True
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    material.use_backface_culling = False
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (660, 40)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (330, 40)
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = 0.78 if material.name == "Volume4" else 0.72
    shader.inputs["Specular IOR Level"].default_value = 0.28
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    diffuse = image_node(nodes, diffuse_path, "Base color", "sRGB")
    diffuse.location = (-620, 180)
    links.new(diffuse.outputs["Color"], shader.inputs["Base Color"])

    if material.name in CUTOUT_MATERIALS:
        links.new(diffuse.outputs["Alpha"], shader.inputs["Alpha"])
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        if hasattr(material, "alpha_threshold"):
            material.alpha_threshold = 0.32

    if normal_path.exists():
        normal = image_node(nodes, normal_path, "Normal", "Non-Color")
        normal.location = (-620, -100)
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.location = (-120, -100)
        normal_map.inputs["Strength"].default_value = 0.72
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])

    if gloss_path.exists():
        gloss = image_node(nodes, gloss_path, "Gloss", "Non-Color")
        gloss.location = (-620, -350)
        invert = nodes.new("ShaderNodeInvert")
        invert.location = (-120, -350)
        links.new(gloss.outputs["Color"], invert.inputs["Color"])
        links.new(invert.outputs["Color"], shader.inputs["Roughness"])


def normalize_meshes(source_name: str) -> list:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    used_names: dict[str, int] = {}

    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.select_set(False)

        base_name = clean_name(obj.name)
        occurrence = used_names.get(base_name, 0) + 1
        used_names[base_name] = occurrence
        obj.name = base_name if occurrence == 1 else f"{base_name}-{occurrence:02d}"
        obj.data.name = f"{obj.name}-mesh"

        vertices = obj.data.vertices
        minimum = Vector((min(v.co.x for v in vertices), min(v.co.y for v in vertices), min(v.co.z for v in vertices)))
        maximum = Vector((max(v.co.x for v in vertices), max(v.co.y for v in vertices), max(v.co.z for v in vertices)))
        offset = Vector((-(minimum.x + maximum.x) * 0.5, -(minimum.y + maximum.y) * 0.5, -minimum.z))
        for vertex in vertices:
            vertex.co += offset
        obj.data.update()
        obj.location = (0.0, 0.0, 0.0)

        obj["source_fbx"] = source_name
        obj["height_m"] = round(maximum.z - minimum.z, 4)
        obj["footprint_m"] = [
            round(maximum.x - minimum.x, 4),
            round(maximum.y - minimum.y, 4),
        ]

    return meshes


def convert(source_dir: Path, output_dir: Path, source_name: str, output_name: str) -> None:
    source_path = source_dir / source_name
    if not source_path.exists():
        raise FileNotFoundError(source_path)

    reset_scene()
    bpy.ops.wm.fbx_import(filepath=str(source_path))

    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    for material in list(bpy.data.materials):
        rebuild_material(material, source_dir)

    meshes = normalize_meshes(source_name)
    output_path = output_dir / output_name
    output_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"REEF_EXPORT {output_name}: {len(meshes)} independent meshes")


def main() -> None:
    source_dir, output_dir = arguments()
    for source_name, output_name in FBX_LIBRARIES.items():
        convert(source_dir, output_dir, source_name, output_name)


if __name__ == "__main__":
    main()
