#!/usr/bin/env bash
# Makes the small picture each exercise row shows (the picker, Library, routine editor, workout card):
#   frontend/public/pose/X-1.webp → frontend/public/thumb/X.webp, 160px
# Cut from the sharp pose rather than the dataset's 180px img/ frame, so it's crisper and — being in
# frontend/public like the poses — ships with every build. img/ only exists where the media service
# runs, which left the hosted preview with grey placeholders. 160px is 2.5x the largest slot (64px),
# enough for a phone's pixel density; the 720px pose would cost ~18 KB a row to show at 50px.
#
# Committed, so this only needs running again if the dataset gains exercises (after
# scripts/upscale-poses.sh has made their poses). Resumable: a finished thumb is skipped, and each
# is written under a temp name first.
#
#   scripts/make-thumbs.sh [pose-dir] [out-dir]
set -euo pipefail

pose_dir=${1:-"$(dirname "$0")/../frontend/public/pose"}
out_dir=${2:-"$(dirname "$0")/../frontend/public/thumb"}
mkdir -p "$out_dir"

# Names are cut with parameter expansion, not basename: on Windows every subprocess can cost half
# a second, and this loop runs once per exercise.
made=0 have=0
for p in "$pose_dir"/*-1.webp; do
  [ -e "$p" ] || continue
  b=${p##*/}; b=${b%-1.webp}
  if [ -s "$out_dir/$b.webp" ]; then have=$((have + 1)); continue; fi
  ffmpeg -nostdin -v error -y -i "$p" -vf "scale=160:160:flags=lanczos" -c:v libwebp -quality 80 "$out_dir/$b.part.webp"
  mv "$out_dir/$b.part.webp" "$out_dir/$b.webp"
  made=$((made + 1))
done
echo "✓ $made thumbnails made, $have already there — $(ls "$out_dir" | grep -c '\.webp$') in total."
