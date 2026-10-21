#!/usr/bin/env python3
"""Assign a publication date once per Hugo post bundle, preserving Markdown."""
import argparse
import copy
from datetime import datetime
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

import yaml

LEDGER = Path("data/publications.json")
POST_NAMES = {"index.md": "ko", "index.ko.md": "ko", "index.en.md": "en"}


def timestamp(value):
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"Date requires an explicit timezone: {value}")
    return parsed.isoformat(timespec="seconds")


def parse_front(text):
    match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)", text, re.S)
    if not match:
        raise ValueError("Expected YAML front matter")
    if any(isinstance(token, (yaml.tokens.AnchorToken, yaml.tokens.AliasToken))
           for token in yaml.scan(match[1])):
        raise ValueError("Front matter anchors and aliases are not supported")
    node = yaml.compose(match[1], Loader=yaml.SafeLoader)
    if not isinstance(node, yaml.MappingNode) or node.flow_style:
        raise ValueError("Front matter must be a block YAML mapping")
    keys = []
    for key, _ in node.value:
        if not isinstance(key, yaml.ScalarNode) or key.tag != "tag:yaml.org,2002:str" or key.value == "<<":
            raise ValueError("Front matter requires explicit string keys without YAML merges")
        if key.value in keys:
            raise ValueError(f"Duplicate front matter key: {key.value}")
        keys.append(key.value)
    return match, node, yaml.safe_load(match[1])


def read_post(path):
    text = path.read_bytes().decode("utf-8")
    _, _, fields = parse_front(text)
    return text, fields


def set_field(text, name, value):
    match, node, _ = parse_front(text)
    front = match[1]
    newline = "\r\n" if "\r\n" in text else "\n"
    literal = "'" + str(value).replace("'", "''") + "'"
    existing = next((v for k, v in node.value if k.value == name), None)
    if existing is not None:
        if not isinstance(existing, yaml.ScalarNode):
            raise ValueError(f"Expected a scalar {name}")
        start, end = existing.start_mark.index, existing.end_mark.index
        # A block scalar's span may consume the newline before the next key.
        suffix = newline if front[start:end].endswith("\n") else ""
        front = front[:start] + literal + suffix + front[end:]
    else:
        front += newline + f"{name}: {literal}"
    result = text[:match.start(1)] + front + text[match.end(1):]
    _, _, fields = parse_front(result)
    if fields.get(name) != str(value):
        raise ValueError(f"Failed to safely replace {name}")
    return result


def read_ledger(root):
    path = root / LEDGER
    if not path.is_file():
        raise ValueError("Missing publication ledger; explicitly run bootstrap once")
    ledger = json.loads(path.read_text(encoding="utf-8"))
    if ledger.get("version") != 1 or not isinstance(ledger.get("posts"), dict):
        raise ValueError("Unsupported publication ledger")
    return ledger


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def collect(root):
    groups = {}
    records = []
    bundle_ids = {}
    for path in sorted((root / "content/posts").glob("*/index*.md")):
        if path.name not in POST_NAMES:
            continue
        text, fields = read_post(path)
        records.append((path, text, fields))
        if "publication_id" in fields:
            key = fields["publication_id"]
            if not isinstance(key, str):
                raise ValueError(f"Invalid publication_id: {path}")
            if path.parent in bundle_ids and bundle_ids[path.parent] != key:
                raise ValueError(f"Conflicting publication IDs within bundle: {path.parent}")
            bundle_ids[path.parent] = key
    for path, text, fields in records:
        key = bundle_ids.get(path.parent, path.parent.name)
        if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", key):
            raise ValueError(f"Invalid publication_id: {path}")
        if key in groups and groups[key][0][0].parent != path.parent:
            raise ValueError(f"publication_id reused by different bundles: {key}")
        if any(POST_NAMES[p.name] == POST_NAMES[path.name] for p, _, _ in groups.get(key, [])):
            raise ValueError(f"Duplicate language in bundle: {path.parent}")
        timestamp(fields["date"])
        groups.setdefault(key, []).append((path, text, fields))
    return groups


def eligible(fields, now):
    if fields.get("draft", False):
        return False
    if "publishDate" in fields and datetime.fromisoformat(timestamp(fields["publishDate"])) > now:
        return False
    if "expiryDate" in fields and datetime.fromisoformat(timestamp(fields["expiryDate"])) <= now:
        return False
    return True


def bootstrap(root):
    """Register legacy dates without modifying any existing post."""
    root = Path(root)
    if (root / LEDGER).exists():
        raise ValueError("Publication ledger already exists; bootstrap is one-time only")
    ledger = {"version": 1, "posts": {}}
    now = datetime.now(ZoneInfo("Asia/Seoul"))
    for key, posts in collect(root).items():
        dates = {POST_NAMES[p.name]: timestamp(f["date"])
                 for p, _, f in posts if eligible(f, now)}
        if dates:
            ledger["posts"][key] = {"date": dates.get("ko", next(iter(dates.values()))), "dates": dates}
    write_json(root / LEDGER, ledger)
    return ledger


def prepare(root, now, plan_path=None):
    root = Path(root)
    now = timestamp(now)
    ledger = read_ledger(root)
    original = copy.deepcopy(ledger)
    groups = collect(root)
    writes = {}
    plan = {"version": 1, "posts": {}, "files": {}}
    for key, posts in groups.items():
        posts = [(p, t, f) for p, t, f in posts if eligible(f, datetime.fromisoformat(now))]
        if not posts:
            continue
        entry = ledger["posts"].setdefault(key, {"date": now, "dates": {}})
        for path, text, fields in posts:
            language = POST_NAMES[path.name]
            date = entry["dates"].setdefault(language, entry["date"])
            if timestamp(fields["date"]) != date:
                text = set_field(text, "date", date)
            add_id = "publication_id" not in fields
            if add_id:
                text = set_field(text, "publication_id", key)
            if text.encode("utf-8") != path.read_bytes():
                writes[path] = text
                plan["files"][path.relative_to(root).as_posix()] = {
                    "id": key, "date": date, "add_id": add_id}
        if entry != original["posts"].get(key):
            plan["posts"][key] = entry
    for path, text in writes.items():
        path.write_bytes(text.encode("utf-8"))
    if ledger != original:
        write_json(root / LEDGER, ledger)
    if plan_path is not None:
        write_json(Path(plan_path), plan)
    return plan


def finalize(root, plan):
    """Replay only publication fields onto latest main after a successful deploy."""
    root = Path(root)
    if plan.get("version") != 1:
        raise ValueError("Unsupported publication plan")
    ledger = read_ledger(root)
    original = copy.deepcopy(ledger)
    for key, desired in plan["posts"].items():
        existing = ledger["posts"].get(key)
        if existing:
            if existing["date"] != desired["date"] or any(
                lang in existing["dates"] and existing["dates"][lang] != date
                for lang, date in desired["dates"].items()
            ):
                raise ValueError(f"Conflicting publication record: {key}")
            existing["dates"].update(desired["dates"])
        else:
            ledger["posts"][key] = copy.deepcopy(desired)
    writes = {}
    groups = collect(root)
    for relative, change in plan["files"].items():
        parts = Path(relative).parts
        if len(parts) != 4 or parts[:2] != ("content", "posts") or parts[3] not in POST_NAMES:
            raise ValueError(f"Invalid publication path: {relative}")
        path = root / relative
        if not path.exists():
            # A concurrent deletion must not resurrect content. An explicit ID
            # lets a concurrently renamed bundle retain its publication date.
            matches = [p for p, _, _ in groups.get(change["id"], [])
                       if POST_NAMES[p.name] == POST_NAMES[parts[3]]]
            if not matches:
                continue
            path = matches[0]
        text, fields = read_post(path)
        bundle_key = next((key for key, posts in groups.items()
                           if any(p == path for p, _, _ in posts)), None)
        if bundle_key != change["id"]:
            raise ValueError(f"Publication identity changed: {relative}")
        text = set_field(text, "date", timestamp(change["date"]))
        if change["add_id"]:
            text = set_field(text, "publication_id", change["id"])
        if text.encode("utf-8") != path.read_bytes():
            writes[path] = text
    for path, text in writes.items():
        path.write_bytes(text.encode("utf-8"))
    if ledger != original:
        write_json(root / LEDGER, ledger)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("bootstrap", "prepare", "finalize"))
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--now", default=None, help="Timezone-aware ISO 8601 build timestamp")
    args = parser.parse_args()
    if args.command == "bootstrap":
        result = bootstrap(args.root)
        print(f"Registered {len(result['posts'])} existing posts; Markdown unchanged")
    elif args.command == "prepare":
        now = args.now or datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds")
        result = prepare(args.root, now, args.plan)
        print(f"Publication plan: {len(result['posts'])} records, {len(result['files'])} files")
    else:
        if args.plan is None:
            parser.error("finalize requires --plan")
        finalize(args.root, json.loads(args.plan.read_text(encoding="utf-8")))
        print("Publication fields applied; unrelated content preserved")


if __name__ == "__main__":
    main()
