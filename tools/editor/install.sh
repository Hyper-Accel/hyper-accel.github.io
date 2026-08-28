#!/usr/bin/env bash
set -euo pipefail

editor_dir="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
bin_dir="${TECHBLOG_EDITOR_BIN_DIR:-$HOME/.local/bin}"
command_path="$bin_dir/techblog-editor"

mkdir -p "$bin_dir"
ln -sfn "$editor_dir/bin/techblog-editor" "$command_path"

printf 'Installed: %s\n' "$command_path"
if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
  printf 'Add this directory to PATH before running techblog-editor:\n  %s\n' "$bin_dir"
  exit 0
fi

printf 'Run anywhere with:\n  techblog-editor\n'
