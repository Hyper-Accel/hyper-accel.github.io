#!/usr/bin/env python3
"""One-off migration: one category per post, old categories folded into tags.

Usage: python3 tools/migrate_categories.py [--dry-run]
"""
import re
import sys
from pathlib import Path

POSTS = Path("content/posts")

# slug -> new single category (English term; display names live in content/categories/*/_index*.md)
CATEGORY = {
    "how-GPU-works": "AI Hardware",
    "TPU-deep-dive": "AI Hardware",
    "lpu-deep-dive": "AI Hardware",
    "cerebras-wse": "AI Hardware",
    "cpu-revival": "AI Hardware",
    "jalapeno-shock": "AI Hardware",
    "what-is-hbf": "Memory and Storage",
    "hbf-workload": "Memory and Storage",
    "hbf-challenge": "Memory and Storage",
    "what-is-cxl": "Memory and Storage",
    "cxl-workload": "Memory and Storage",
    "nvidia-icms-dpu": "Memory and Storage",
    "crafting-compilers": "Compilers and Kernels",
    "crafting-compilers-Ch1-1": "Compilers and Kernels",
    "polyhedral-compiler-analysis": "Compilers and Kernels",
    "what-is-legato": "Compilers and Kernels",
    "torch-compile-anatomy": "Compilers and Kernels",
    "pallas-programming-model": "Compilers and Kernels",
    "rocm-aiter": "Compilers and Kernels",
    "what-is-the-transformers": "LLM and Models",
    "sglang-review": "LLM and Models",
    "project-glasswing-mythos-preview": "LLM and Models",
    "development-environment-with-k8s-ch1": "Infra and DevOps",
    "arc-setup-guide": "Infra and DevOps",
    "k8s-device-plugin": "Infra and DevOps",
    "how-we-use-ai": "Engineering Culture",
    "moving-back-to-terminals": "Engineering Culture",
    "what-is-sdd": "Engineering Culture",
    "tech-blog-operation": "Engineering Culture",
    "ces2026-report": "Conference Reports",
    "naverdan2025-report": "Conference Reports",
    "pytorchcon2025-report": "Conference Reports",
}

# old category values that are too generic to keep as tags
DROP = {"report", "ai", "ai hardware", "architecture", "engineering-culture",
        "agentic workflow", "ai trends", "ai engineering", "developer tools"}

ITEM_RE = re.compile(r"""\s*(?:'([^']*)'|"([^"]*)"|([^,\[\]]+))""")


def parse_flow(value: str):
    inner = value.strip()
    if not (inner.startswith("[") and inner.endswith("]")):
        return [inner.strip("'\"")]
    inner = inner[1:-1]
    out = []
    for m in ITEM_RE.finditer(inner):
        s = next(g for g in m.groups() if g is not None).strip()
        if s:
            out.append(s)
    return out


def dump_flow(items):
    return "[" + ", ".join('"' + i.replace('"', '\\"') + '"' for i in items) + "]"


def migrate(path: Path, category: str, dry: bool):
    lines = path.read_text(encoding="utf-8").split("\n")
    assert lines[0].strip() == "---", path
    end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")

    cat_idx = tag_idx = None
    for i in range(1, end):
        key = lines[i].split(":", 1)[0].strip()
        if key == "categories":
            cat_idx = i
        elif key == "tags":
            tag_idx = i

    old_cats = parse_flow(lines[cat_idx].split(":", 1)[1]) if cat_idx is not None else []
    tags = parse_flow(lines[tag_idx].split(":", 1)[1]) if tag_idx is not None else []

    seen = {t.lower() for t in tags}
    for c in old_cats:
        k = c.lower()
        if k == category.lower() or k in DROP or k in seen:
            continue
        tags.append(c)
        seen.add(k)

    new_cat_line = f"categories: {dump_flow([category])}"
    new_tag_line = f"tags: {dump_flow(tags)}"

    if cat_idx is not None:
        lines[cat_idx] = new_cat_line
    else:
        lines.insert(end, new_cat_line)
        end += 1
    if tag_idx is not None:
        lines[tag_idx] = new_tag_line
    else:
        lines.insert(end, new_tag_line)

    print(f"{path}: {old_cats} -> [{category}] | tags {len(tags)}")
    if not dry:
        path.write_text("\n".join(lines), encoding="utf-8")


def main():
    dry = "--dry-run" in sys.argv
    slugs = sorted(p.name for p in POSTS.iterdir() if p.is_dir())
    missing = [s for s in slugs if s not in CATEGORY]
    if missing:
        sys.exit(f"unmapped posts: {missing}")
    for slug in slugs:
        for f in sorted((POSTS / slug).glob("index*.md")):
            migrate(f, CATEGORY[slug], dry)


if __name__ == "__main__":
    main()
