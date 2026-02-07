#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

import logging


DEFAULT_CONFIG = {
    "frame_size": [128, 128],
    "input_direction_order": ["down", "right", "up", "left"],
    "attack_folder_priority": ["Attack - Multiweapon", "Attack - Bow", "Attack"],
    "attack_extra_folders": ["Attack - Orbe", "Attack - Orb"],
    "profiles": {
        "weapon": {
            "actions": ["idle", "walk", "attack"],
            "row_direction_order": ["down", "left", "up", "right"],
            "frames_per_view": {"walk": 9, "attack": 9, "idle": 9},
        },
        "hero": {
            "actions": ["walk", "attack", "idle"],
            "row_direction_order": ["down", "left", "up", "right"],
            "frames_per_view": {"walk": 9, "attack": 9, "idle": 9},
        },
        "enemy": {
            "actions": ["idle", "walk", "attack"],
            "row_direction_order": ["down", "left", "up", "right"],
            "frames_per_view": {"idle": 8, "walk": 8, "attack": 8},
        },
        "npc": {
            "actions": ["idle"],
            "row_direction_order": ["down", "left", "up", "right"],
            "frames_per_view": {"idle": "auto"},
        },
        "item": {
            "actions": ["idle"],
            "row_direction_order": ["down"],
            "input_direction_order": ["down"],
            "frames_per_view": {"idle": 9},
        },
    },
    "type_overrides": {},
    "game_root": "/Users/jesussilva/Documents/gpt/gableguardians",
    "targets": [
        "frontend-web/assets/images",
        "frontend-psg1/assets/images",
        "frontend-seeker/assets/images",
    ],
}


def load_config(path):
    config = DEFAULT_CONFIG.copy()
    if not path or not os.path.isfile(path):
        return config
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return deep_merge(config, data)


def deep_merge(base, override):
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            base[key] = deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def find_magick():
    magick = shutil.which("magick")
    if magick:
        return {
            "convert": [magick],
            "montage": [magick, "montage"],
            "identify": [magick, "identify"],
        }
    montage = shutil.which("montage")
    convert = shutil.which("convert")
    identify = shutil.which("identify")
    if montage and convert:
        return {
            "convert": [convert],
            "montage": [montage],
            "identify": [identify] if identify else None,
        }
    return None


def parse_frames_per_view_overrides(values):
    overrides = {}
    for raw in values or []:
        if "=" not in raw:
            raise ValueError(f"Invalid --frames-per-view '{raw}', expected action=NUM")
        action, count = raw.split("=", 1)
        action = action.strip().lower()
        if not action:
            raise ValueError(f"Invalid --frames-per-view '{raw}', missing action name")
        try:
            count_int = int(count.strip())
        except ValueError as exc:
            raise ValueError(
                f"Invalid --frames-per-view '{raw}', NUM must be an integer"
            ) from exc
        if count_int <= 0:
            raise ValueError(
                f"Invalid --frames-per-view '{raw}', NUM must be > 0"
            )
        overrides[action] = count_int
    return overrides


def precheck_pngs(magick_cmds, files, timeout_seconds=None):
    identify_cmd = magick_cmds.get("identify")
    if not identify_cmd:
        raise RuntimeError("ImageMagick identify is required for precheck")
    for path in files:
        subprocess.run(
            identify_cmd + ["-quiet", "-ping", path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout_seconds,
        )


def list_dirs(root):
    for entry in os.scandir(root):
        if entry.is_dir():
            yield entry.name, entry.path


def list_pngs(folder):
    files = []
    for entry in os.scandir(folder):
        if entry.is_file() and entry.name.lower().endswith(".png"):
            files.append(entry.name)
    return sorted(files)


def find_folder_case_insensitive(subdirs, target):
    for name in subdirs:
        if name.lower() == target.lower():
            return name
    return None


def pick_attack_folder(subdirs, priority):
    for candidate in priority:
        found = find_folder_case_insensitive(subdirs, candidate)
        if found:
            return found
    matches = sorted([name for name in subdirs if name.lower().startswith("attack")])
    return matches[0] if matches else None


def pick_ordered_attack_folders(subdirs):
    matches = []
    for name in subdirs:
        match = re.match(r"^a(\d+)_", name, flags=re.IGNORECASE)
        if match:
            matches.append((int(match.group(1)), name))
    matches.sort(key=lambda item: item[0])
    return [name for _, name in matches]


def pick_extra_attack_folders(subdirs, extras):
    matched = []
    for candidate in extras:
        found = find_folder_case_insensitive(subdirs, candidate)
        if found and found not in matched:
            matched.append(found)
    return matched


def classify_folder(name, overrides):
    if name in overrides:
        return overrides[name]
    lower = name.lower()
    if lower.startswith("npc_"):
        return "npc"
    if lower.startswith("i_"):
        return "item"
    if lower.startswith("w_"):
        return "weapon"
    if lower.startswith("pj_"):
        return "hero"
    if lower.startswith("e") and "_" in name[1:]:
        prefix = name.split("_", 1)[0]
        if prefix[1:].isdigit():
            return "enemy"
    if lower.startswith("enemy"):
        return "enemy"
    return None


def output_name_for_folder(name):
    trimmed = name.strip()
    if "_" in trimmed:
        prefix, rest = trimmed.split("_", 1)
        lower = prefix.lower()
        if lower == "npc":
            return rest.strip() or trimmed
        if lower == "i":
            return rest.strip() or trimmed
        if lower == "w":
            return rest.strip() or trimmed
        if lower.startswith("e") and lower[1:].isdigit():
            return rest.strip() or trimmed
    return trimmed


def validate_output_base(name, folder_name):
    if not name:
        raise RuntimeError(f"Invalid output name derived from {folder_name}")
    lowered = name.lower()
    if not lowered.isascii():
        raise RuntimeError(
            f"Invalid name '{name}' in {folder_name}: must be ASCII lowercase"
        )
    if not re.match(r"^[a-z0-9_]+$", lowered):
        raise RuntimeError(
            f"Invalid name '{name}' in {folder_name}: use a-z, 0-9, underscore only"
        )
    return lowered


def build_sprite_sheet(
    magick_cmds,
    object_dir,
    output_path,
    profile,
    frame_size,
    input_direction_order,
    attack_folder_priority,
    attack_extra_folders,
    timeout_seconds=None,
    verbose=False,
    precheck=False,
    stitch_mode="montage",
):
    subdirs = [name for name, _ in list_dirs(object_dir)]
    ordered_attack_folders = pick_ordered_attack_folders(subdirs)
    extra_attack_folders = pick_extra_attack_folders(subdirs, attack_extra_folders)
    action_entries = []
    for action in profile["actions"]:
        if action == "attack":
            folder = pick_attack_folder(subdirs, attack_folder_priority)
        else:
            folder = find_folder_case_insensitive(subdirs, action)
        if not folder:
            raise RuntimeError(f"Missing '{action}' folder in {object_dir}")
        action_entries.append({"action": action, "folder": folder, "frames_key": action})
    for folder in ordered_attack_folders:
        action_entries.append(
            {"action": "attack_extra", "folder": folder, "frames_key": "attack"}
        )
    for folder in extra_attack_folders:
        if folder not in ordered_attack_folders:
            action_entries.append(
                {"action": "attack_extra", "folder": folder, "frames_key": "attack"}
            )

    rows = []
    row_frame_counts = []
    frames_per_view_config = profile.get("frames_per_view", {})
    max_mtime = 0.0
    if len(input_direction_order) < 1:
        raise RuntimeError("input_direction_order must have at least 1 entry")
    for entry in action_entries:
        full_path = os.path.join(object_dir, entry["folder"])
        files = list_pngs(full_path)
        if not files:
            raise RuntimeError(f"No PNGs in {full_path}")
        for filename in files:
            mtime = os.path.getmtime(os.path.join(full_path, filename))
            if mtime > max_mtime:
                max_mtime = mtime
        if len(files) % len(input_direction_order) != 0:
            raise RuntimeError(
                f"Expected PNG count divisible by {len(input_direction_order)} in {full_path}"
            )
        frames_per_view_total = len(files) // len(input_direction_order)
        desired = frames_per_view_config.get(entry["frames_key"], frames_per_view_total)
        if desired in (None, "auto"):
            desired = frames_per_view_total
        if desired > frames_per_view_total:
            raise RuntimeError(
                f"Not enough frames for {entry['folder']} in {object_dir} "
                f"(need {desired}, have {frames_per_view_total})"
            )
        frames_by_direction = {}
        for idx, direction in enumerate(input_direction_order):
            start = idx * frames_per_view_total
            end = (idx + 1) * frames_per_view_total
            frames_by_direction[direction] = [
                os.path.join(full_path, name) for name in files[start:end]
            ]
        for direction in profile["row_direction_order"]:
            if direction not in frames_by_direction:
                raise RuntimeError(
                    f"Missing direction {direction} for {entry['folder']}"
                )
            row_frames = frames_by_direction[direction][:desired]
            rows.append(row_frames)
            row_frame_counts.append(desired)

    if not rows:
        raise RuntimeError(f"No rows generated for {object_dir}")

    max_columns = max(row_frame_counts)
    with tempfile.TemporaryDirectory() as tmpdir:
        blank_path = os.path.join(tmpdir, "blank.png")
        width, height = frame_size
        subprocess.run(
            magick_cmds["convert"]
            + ["-size", f"{width}x{height}", "xc:none", blank_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout_seconds,
        )

        file_list_path = os.path.join(tmpdir, "filelist.txt")
        with open(file_list_path, "w", encoding="utf-8") as handle:
            for row_idx, row_frames in enumerate(rows):
                handle.write("\n".join(row_frames))
                pad = max_columns - row_frame_counts[row_idx]
                if pad > 0:
                    handle.write("\n")
                    handle.write("\n".join([blank_path] * pad))
                handle.write("\n")

        tile = f"{max_columns}x{len(rows)}"
        geometry = f"{width}x{height}+0+0"
        if precheck:
            unique_frames = sorted({frame for row in rows for frame in row})
            logging.info("Precheck start: %s (%d files)", output_path, len(unique_frames))
            if verbose:
                print(f"Precheck {output_path} files={len(unique_frames)}")
            precheck_pngs(magick_cmds, unique_frames, timeout_seconds=timeout_seconds)
            logging.info("Precheck done: %s", output_path)

        if stitch_mode == "append":
            row_paths = []
            logging.info("Append start: %s rows=%d cols=%d", output_path, len(rows), max_columns)
            if verbose:
                print(f"Append {output_path} rows={len(rows)} cols={max_columns}")
            for idx, row_frames in enumerate(rows):
                if not row_frames:
                    raise RuntimeError(f"No frames for row {idx} in {object_dir}")
                row_path = os.path.join(tmpdir, f"row_{idx:03d}.png")
                subprocess.run(
                    magick_cmds["convert"]
                    + row_frames
                    + [
                        "+append",
                        "-quiet",
                        "-define",
                        "png:exclude-chunks=all",
                        "-strip",
                        row_path,
                    ],
                    check=True,
                    timeout=timeout_seconds,
                )
                row_paths.append(row_path)
            subprocess.run(
                magick_cmds["convert"]
                + row_paths
                + [
                    "-append",
                    "-quiet",
                    "-define",
                    "png:exclude-chunks=all",
                    "-strip",
                    output_path,
                ],
                check=True,
                timeout=timeout_seconds,
            )
            logging.info("Append done: %s", output_path)
        else:
            logging.info(
                "Montage start: %s tile=%s frames=%d",
                output_path,
                tile,
                len(rows) * max_columns,
            )
            if verbose:
                print(f"Montage {output_path} tile={tile}")
            subprocess.run(
                magick_cmds["montage"]
                + [
                    "-quiet",
                    "-define",
                    "png:exclude-chunks=all",
                    "-strip",
                    "-background",
                    "none",
                    "-tile",
                    tile,
                    "-geometry",
                    geometry,
                    f"@{file_list_path}",
                    output_path,
                ],
                check=True,
                timeout=timeout_seconds,
            )
            logging.info("Montage done: %s", output_path)

    return max_mtime


def needs_rebuild(output_path, latest_input_mtime, force_rebuild=False):
    if force_rebuild:
        return True
    if not os.path.isfile(output_path):
        return True
    return os.path.getmtime(output_path) < latest_input_mtime


def copy_to_targets(output_path, output_name, object_type, config):
    game_root = config["game_root"]
    targets = config["targets"]
    if object_type == "enemy":
        bucket = "enemys"
    elif object_type == "npc":
        bucket = "NPC"
    elif object_type == "item":
        bucket = "items"
    elif object_type == "hero":
        bucket = "character"
    else:
        bucket = "weapons"
    for target in targets:
        dest_dir = os.path.join(game_root, target, bucket)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, output_name)
        if not os.path.isfile(dest_path):
            shutil.copy2(output_path, dest_path)
            continue
        if os.path.getmtime(dest_path) < os.path.getmtime(output_path):
            shutil.copy2(output_path, dest_path)


def remove_existing_outputs(output_path, output_name, object_type, config):
    if os.path.isfile(output_path):
        os.remove(output_path)
    game_root = config["game_root"]
    targets = config["targets"]
    if object_type == "enemy":
        bucket = "enemys"
    elif object_type == "npc":
        bucket = "NPC"
    elif object_type == "item":
        bucket = "items"
    elif object_type == "hero":
        bucket = "character"
    else:
        bucket = "weapons"
    for target in targets:
        dest_dir = os.path.join(game_root, target, bucket)
        dest_path = os.path.join(dest_dir, output_name)
        if os.path.isfile(dest_path):
            os.remove(dest_path)


def main():
    parser = argparse.ArgumentParser(
        description="Build sprite sheets from folder animations."
    )
    parser.add_argument(
        "--config",
        default="spritesgg.config.json",
        help="Optional JSON config file path.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and report without writing outputs.",
    )
    parser.add_argument(
        "--rebuild-all",
        action="store_true",
        help="Rebuild all matching folders regardless of timestamps.",
    )
    parser.add_argument(
        "--prompt",
        action="store_true",
        help="Prompt to rebuild all before running (interactive terminals only).",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Timeout in seconds for each ImageMagick command.",
    )
    parser.add_argument(
        "--log-file",
        default="build_sprites.log",
        help="Path to write a run log.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print extra per-folder details.",
    )
    parser.add_argument(
        "--precheck",
        action="store_true",
        help="Validate PNGs with ImageMagick identify before montage.",
    )
    parser.add_argument(
        "--stitch",
        choices=["montage", "append"],
        default="montage",
        help="Stitching method for sprite sheets.",
    )
    parser.add_argument(
        "--frames-per-view",
        action="append",
        default=[],
        help="Override frames per view, e.g. idle=24 (repeatable).",
    )
    parser.add_argument(
        "--only",
        help="Process only a specific folder name (case-insensitive).",
    )
    parser.add_argument(
        "--items-only",
        action="store_true",
        help="Process only I_ item folders (excluded from the default run).",
    )
    parser.add_argument(
        "--include-items",
        action="store_true",
        help="Include I_ item folders in the default run.",
    )
    args = parser.parse_args()

    config = load_config(args.config)
    try:
        frames_overrides = parse_frames_per_view_overrides(args.frames_per_view)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    magick_cmds = find_magick()
    if not magick_cmds:
        print("Error: ImageMagick (magick or convert) is required.", file=sys.stderr)
        return 1

    root = os.getcwd()
    logging.basicConfig(
        filename=args.log_file,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    processed = 0
    skipped = 0
    errors = 0
    candidates = []
    for name, path in list_dirs(root):
        if name.startswith("."):
            continue
        object_type = classify_folder(name, config.get("type_overrides", {}))
        profile = config["profiles"].get(object_type)
        if not profile:
            print(f"Skipping {name}: unknown or unsupported prefix")
            skipped += 1
            continue
        if object_type == "item" and not (args.items_only or args.include_items):
            print(f"Skipping {name}: items are not included by default")
            skipped += 1
            continue
        candidates.append((name, path, object_type, profile))

    if args.only:
        matched = [
            entry
            for entry in candidates
            if entry[0].lower() == args.only.lower()
        ]
        if not matched:
            print(f"No matching folder for --only '{args.only}'", file=sys.stderr)
            return 1
        candidates = matched
    elif args.items_only:
        candidates = [entry for entry in candidates if entry[2] == "item"]
        if not candidates:
            print("No item folders found for --items-only", file=sys.stderr)
            return 1

    total = len(candidates)
    if total == 0:
        print("No valid folders found.", file=sys.stderr)
        return 0

    force_rebuild = args.rebuild_all
    if args.prompt and sys.stdin.isatty():
        reply = input("Rebuild all sprite sheets? [y/N]: ").strip().lower()
        force_rebuild = reply in ("y", "yes")

    for idx, (name, path, object_type, profile) in enumerate(candidates, start=1):
        if frames_overrides:
            profile = profile.copy()
            profile_frames = dict(profile.get("frames_per_view", {}))
            profile_frames.update(frames_overrides)
            profile["frames_per_view"] = profile_frames
        print(
            f"[{idx}/{total}] Checking {name} "
            f"(built {processed}, skipped {skipped}, errors {errors})"
        )

        output_base = output_name_for_folder(name)
        output_base = validate_output_base(output_base, name)
        output_name = f"{output_base}.png"
        if not output_name or output_name == ".png":
            print(f"Skipping {name}: invalid output name")
            skipped += 1
            continue
        output_path = os.path.join(path, output_name)

        try:
            latest_input_mtime = 0.0
            subdirs = [d for d, _ in list_dirs(path)]
            ordered_attack_folders = pick_ordered_attack_folders(subdirs)
            extra_attack_folders = []
            if name.lower() == "w_shield":
                extra_attack_folders = pick_extra_attack_folders(
                    subdirs, config.get("attack_extra_folders", [])
                )
            for action in profile["actions"]:
                if action == "attack":
                    folder = pick_attack_folder(
                        subdirs, config["attack_folder_priority"]
                    )
                    folders = [folder] if folder else []
                else:
                    folder = find_folder_case_insensitive(subdirs, action)
                    folders = [folder] if folder else []
                if not folders:
                    raise RuntimeError(f"Missing '{action}' folder")
                for folder in folders:
                    full_path = os.path.join(path, folder)
                    files = list_pngs(full_path)
                    if not files:
                        raise RuntimeError(f"No PNGs in {full_path}")
                    for filename in files:
                        mtime = os.path.getmtime(os.path.join(full_path, filename))
                        if mtime > latest_input_mtime:
                            latest_input_mtime = mtime
            for folder in ordered_attack_folders:
                full_path = os.path.join(path, folder)
                files = list_pngs(full_path)
                if not files:
                    raise RuntimeError(f"No PNGs in {full_path}")
                for filename in files:
                    mtime = os.path.getmtime(os.path.join(full_path, filename))
                    if mtime > latest_input_mtime:
                        latest_input_mtime = mtime
            for folder in extra_attack_folders:
                if folder in ordered_attack_folders:
                    continue
                full_path = os.path.join(path, folder)
                files = list_pngs(full_path)
                if not files:
                    raise RuntimeError(f"No PNGs in {full_path}")
                for filename in files:
                    mtime = os.path.getmtime(os.path.join(full_path, filename))
                    if mtime > latest_input_mtime:
                        latest_input_mtime = mtime
            if not needs_rebuild(output_path, latest_input_mtime, force_rebuild):
                if not args.dry_run and os.path.isfile(output_path):
                    copy_to_targets(output_path, output_name, object_type, config)
                skipped += 1
                continue

            if args.dry_run:
                print(f"Would build: {name} ({idx}/{total})")
                processed += 1
                continue

            if force_rebuild and not args.dry_run:
                remove_existing_outputs(
                    output_path, output_name, object_type, config
                )
            print(f"Building {name} ({idx}/{total})...")
            logging.info("Start build: %s", name)
            start_time = time.time()
            build_sprite_sheet(
                magick_cmds,
                path,
                output_path,
                profile,
                config["frame_size"],
                profile.get("input_direction_order", config["input_direction_order"]),
                config["attack_folder_priority"],
                config.get("attack_extra_folders", [])
                if name.lower() == "w_shield"
                else [],
                timeout_seconds=args.timeout,
                verbose=args.verbose,
                precheck=args.precheck,
                stitch_mode=args.stitch,
            )
            elapsed = time.time() - start_time
            print(f"Built {output_name} in {elapsed:.1f}s")
            logging.info("Built %s in %.1fs", output_name, elapsed)
            copy_to_targets(output_path, output_name, object_type, config)
            processed += 1
        except (RuntimeError, subprocess.TimeoutExpired) as exc:
            print(f"Error in {name}: {exc}", file=sys.stderr)
            logging.error("Error in %s: %s", name, exc)
            errors += 1

    print(
        f"Done. Built: {processed}, Skipped: {skipped}, Errors: {errors}",
        file=sys.stderr,
    )
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
