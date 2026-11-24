"""Build the offline NeuroSurge Lite ZIP from the reviewed game inventory."""

import argparse
import hashlib
from html import escape
import json
import os
from pathlib import Path, PurePosixPath
import stat
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from markdown_it import MarkdownIt


ROOT = Path(__file__).resolve().parent.parent
FOLDER = "NeuroSurge Lite"
LITE_MENU = "lite/offline-menu.html"
SIMPLE_GUIDE = "lite/OFFLINE.md"
TECHNICAL_GUIDE = "lite/OFFLINE-TECHNICAL.md"
FULL_GAME_URL = "https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html"
FULL_PREVIEW_URL = "https://eliminatenoise.github.io/NeuroTranslation/previews/neurosurge/scene/example/preview.html"
GUIDE_PAGES = {"simple": "PLAYER-GUIDE.html", "technical": "PLAYER-GUIDE-TECHNICAL.html"}
CREDITS = "assets/player-guides/CREDITS-AND-LICENCES.txt"
ATTRIBUTION = "assets/player-guides/ASSET-ATTRIBUTION-INDEX.txt"


def digest(body):
    return hashlib.sha256(body).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def checked_file(name, expected=None):
    relative = PurePosixPath(name)
    if (relative.is_absolute() or relative.as_posix() != name or not relative.parts
            or ".." in relative.parts or "\\" in name or ":" in name):
        raise ValueError(f"Unsafe path in the game inventory: {name!r}")
    path = ROOT / name
    if not path.is_file() or not path.resolve().is_relative_to(ROOT) or path.is_symlink():
        raise ValueError(f"Expected a regular game file: {name}")
    content = path.read_bytes()
    if expected and (expected["bytes"] != len(content) or expected["sha256"] != digest(content)):
        raise ValueError(f"File differs from the reviewed inventory: {name}")
    return content


def covered_files(source):
    full_name = "packs/PACK-INDEX.json"
    lite_name = "lite/packs/PACK-INDEX.json"
    full_bytes = checked_file(full_name, source[full_name])
    full = json.loads(full_bytes)
    lite = json.loads(checked_file(lite_name, source[lite_name]))
    if lite["transport"] != {"codec": "brotli", "fullIndexSha256": digest(full_bytes)}:
        raise ValueError("The Lite asset index does not identify this Full asset index.")
    if full["rig"] != lite["rig"] or len(full["packs"]) != len(lite["packs"]):
        raise ValueError("The two editions have different packs or rig.")

    originals = set()
    full_files = {full_name, "packs/" + full["rig"]["file"]}
    for full_pack, lite_pack in zip(full["packs"], lite["packs"]):
        shared_fields = ("file", "name", "keys", "rawBytes", "triangles")
        if any(full_pack[field] != lite_pack[field] for field in shared_fields):
            raise ValueError("The Lite pack does not cover the corresponding Full meshes.")
        name = full_pack["file"]
        for prefix, pack in (("packs/", full_pack), ("lite/packs/", lite_pack)):
            entry = source[prefix + name]
            if (entry["bytes"], entry["sha256"]) != (pack["bytes"], pack["sha256"]):
                raise ValueError(f"Pack integrity differs from the release inventory: {prefix}{name}")
        full_files.add("packs/" + name)
        originals.update("packets/" + key for key in lite_pack["keys"])

    if not originals or not (originals | full_files) <= source.keys():
        raise ValueError("The package inventory does not cover the source meshes and Full packs.")
    return originals, full_files


def rewrite_text(payload, name, replacements):
    text = payload[name].decode("utf-8")
    for source, target in replacements.items():
        if text.count(source) != 1:
            raise ValueError(f"Update the packaged guide text in {name}: {source!r}")
        text = text.replace(source, target)
    payload[name] = text.encode("utf-8")


def player_guide_page(markdown, other_page):
    title, separator, navigation, *body = markdown.decode("utf-8").splitlines()
    if not title.startswith("# ") or separator or "[Play Lite]" not in navigation:
        raise ValueError("Expected a player guide title and navigation.")
    title = escape(title[2:])
    source = "\n".join(body).strip().replace("(README.md)", "(START.html)").replace(
        "(lite/README.md)", "(lite/technical.html#local)"
    ).replace("(CREDITS-AND-LICENCES.md)", f"({CREDITS})")
    contents = MarkdownIt("commonmark", {"html": False}).render(source)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <link rel="stylesheet" href="lite/lite.css">
</head>
<body>
  <main>
    <nav aria-label="Player guide">
      <a href="scene/example/preview.html?edition=lite">Play Lite</a>
      <a href="index.html">Game menu</a>
      <a href="{GUIDE_PAGES[other_page]}">{other_page.capitalize()} player guide</a>
    </nav>
    <h1>{title}</h1>
    {contents}
  </main>
</body>
</html>
""".encode("utf-8")


def assembly():
    source_manifest = checked_file("release-manifest.json")
    source_spec = json.loads(source_manifest)
    source = {row["path"]: row for row in source_spec["files"]}
    if source_spec["schema_version"] != 1 or len(source) != len(source_spec["files"]):
        raise ValueError("Expected the reviewed game inventory with unique file names.")
    originals, full_files = covered_files(source)
    omitted = originals | full_files
    payload = {
        name: checked_file(name, row)
        for name, row in source.items()
        if name not in omitted
        and name != "DESIGN-DECISIONS.md"
        and not name.startswith(("tests/", "tools/", "scene/src/camera/tests/"))
    }

    template = payload.pop(LITE_MENU).decode("utf-8")
    if "@ROOT@" not in template:
        raise ValueError("The Lite menu template is missing the path to the game.")
    payload["index.html"] = template.replace("@ROOT@", "").encode("utf-8")
    payload["lite/index.html"] = template.replace("@ROOT@", "../").encode("utf-8")
    payload["START.html"] = payload["index.html"]
    payload["README.md"] = payload.pop(SIMPLE_GUIDE)
    payload["README-TECHNICAL.md"] = payload.pop(TECHNICAL_GUIDE)
    payload["lite/asset-pin.mjs"] += b"export const OFFLINE_LITE_ONLY = true;\n"
    payload[CREDITS] = payload["CREDITS-AND-LICENCES.md"]
    payload[ATTRIBUTION] = payload["ASSET-ATTRIBUTION-INDEX.md"]

    rewrite_text(payload, "lite/README.md", {
        "[Open NeuroSurge Full](../)": f"[Play Full preview online]({FULL_PREVIEW_URL})",
        "(OFFLINE.md)": "(../README.md)",
        "(OFFLINE-TECHNICAL.md)": "(../README-TECHNICAL.md)",
    })
    rewrite_text(payload, "PREVIEW-NOTES.html", {
        '<a href="scene/example/preview.html">Play Full</a>': f'<a href="{FULL_PREVIEW_URL}">Play Full preview online</a>',
        "https://github.com/eliminatenoise/NeuroSurge/blob/main/PLAYER-GUIDE.md": GUIDE_PAGES["simple"],
        "https://github.com/eliminatenoise/NeuroSurge/blob/main/PLAYER-GUIDE-TECHNICAL.md": GUIDE_PAGES["technical"],
        'href="CREDITS-AND-LICENCES.md"': f'href="{CREDITS}"',
    })
    for edition, guide, other in (
        ("simple", "PLAYER-GUIDE.md", "technical"), ("technical", "PLAYER-GUIDE-TECHNICAL.md", "simple")
    ):
        links = {
            f"[Play Full]({FULL_GAME_URL})": f"[Play Full preview online]({FULL_PREVIEW_URL})",
            f"[Play Lite]({FULL_GAME_URL}?edition=lite)": "[Play Lite](scene/example/preview.html?edition=lite)",
        }
        if guide == "PLAYER-GUIDE.md":
            links["[launcher instructions](https://eliminatenoise.github.io/NeuroSurge/START.html)"] = "[launcher instructions](README.md)"
        rewrite_text(payload, guide, links)
        payload[GUIDE_PAGES[edition]] = player_guide_page(payload[guide], other)
        rewrite_text(payload, f"lite/{edition}.html", {
            'href="./"': 'href="index.html"',
            "../PLAYER-GUIDE.md": "../" + GUIDE_PAGES[edition],
            "../CREDITS-AND-LICENCES.md": "../" + CREDITS,
            "../ASSET-ATTRIBUTION-INDEX.md": "../" + ATTRIBUTION,
        })
    rewrite_text(payload, "movement-mirror.html", {"Full and Lite game menu": "Game menu"})
    rewrite_text(payload, "assets/player-guides/PLAYER-GUIDE.txt", {
        "Open https://eliminatenoise.github.io/NeuroSurge/. The page runs locally in your browser after downloading its files.":
            "Open the NeuroSurge Lite launcher for your system. The game runs in your browser from the files in this folder.",
        "Choose **Play Full** or **Play Lite** on the menu.": "Choose **Play Lite** on the menu.",
    })

    mount = json.loads(payload["joint-game.json"])
    if mount["version"] != 1 or "index.html" not in mount["files"]:
        raise ValueError("Expected version 1 of the local model's game inventory.")
    mount["files"] = [name for name in mount["files"] if name in payload] + [*GUIDE_PAGES.values(), ATTRIBUTION]
    payload["joint-game.json"] = json_bytes(mount)

    package = {
        "schema_version": 1,
        "version": source_spec["version"],
        "source_inventory_sha256": digest(source_manifest),
        "edition": "offline Lite",
        "packed_source_meshes_omitted": len(originals),
        "full_transport_files_omitted": len(full_files),
        "files": [
            {"path": name, "bytes": len(data), "sha256": digest(data)}
            for name, data in sorted(payload.items())
        ],
    }
    payload["release-manifest.json"] = json_bytes(package)
    payload["SHA256SUMS"] = "".join(
        f"{digest(data)}  {name}\n" for name, data in sorted(payload.items())
    ).encode("utf-8")
    return payload, package


def write_archive(output, payload):
    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=output.parent, prefix=".neurosurge-lite-", suffix=".zip", delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with ZipFile(temporary, "w") as archive:
            for name, data in sorted(payload.items()):
                entry = ZipInfo(f"{FOLDER}/{name}", date_time=(2020, 1, 1, 0, 0, 0))
                entry.create_system = 3
                permissions = 0o755 if name.endswith((".sh", ".command")) else 0o644
                entry.external_attr = (stat.S_IFREG | permissions) << 16
                archive.writestr(entry, data, compress_type=ZIP_DEFLATED, compresslevel=9)
        with ZipFile(temporary) as archive:
            if archive.namelist() != [f"{FOLDER}/{name}" for name in sorted(payload)]:
                raise ValueError("The ZIP member list differs from the package inventory.")
            for name, data in payload.items():
                if archive.read(f"{FOLDER}/{name}") != data:
                    raise ValueError(f"ZIP readback differs: {name}")
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="path for the new offline ZIP")
    args = parser.parse_args()
    payload, package = assembly()
    write_archive(args.output, payload)
    print(json_bytes({
        "archive": str(args.output),
        "archive_bytes": args.output.stat().st_size,
        "archive_sha256": digest(args.output.read_bytes()),
        "files": len(payload),
        "packed_source_meshes_omitted": package["packed_source_meshes_omitted"],
        "full_transport_files_omitted": package["full_transport_files_omitted"],
        "source_inventory_sha256": package["source_inventory_sha256"],
    }).decode("utf-8"), end="")


if __name__ == "__main__":
    main()
