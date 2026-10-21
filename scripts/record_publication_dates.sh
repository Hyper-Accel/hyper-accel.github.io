#!/usr/bin/env bash
# Run only in the dedicated clean CI checkout, after a successful Pages deploy.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
plan="${1:?Usage: record_publication_dates.sh /absolute/path/publication-plan.json}"
[[ "$plan" = /* && -f "$plan" ]] || { printf '%s\n' 'Plan must be an existing absolute path' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { printf '%s\n' 'Refusing to change a dirty checkout' >&2; exit 1; }

for attempt in 1 2 3; do
  git fetch origin main
  git switch --detach origin/main
  python3 "$script_dir/publication_dates.py" finalize --plan "$plan"
  git add -- data/publications.json content/posts
  if git diff --cached --quiet; then
    printf '%s\n' 'Publication dates already recorded; no commit needed'
    exit 0
  fi
  git -c user.name='github-actions[bot]' \
      -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
      -c commit.gpgsign=false \
      commit -m 'chore: record first-publication dates'
  if git push origin HEAD:refs/heads/main; then
    # Read back the remote; a racing later commit may legitimately be ahead.
    git fetch origin main
    git merge-base --is-ancestor HEAD origin/main
    printf '%s\n' 'Publication dates committed and verified on origin/main'
    exit 0
  fi
  printf 'Publication push failed (attempt %s/3); retrying on latest main\n' "$attempt" >&2
done
printf '%s\n' 'Unable to record publication dates. Fix permissions/conflicts and rerun failed jobs before another deployment.' >&2
exit 1
