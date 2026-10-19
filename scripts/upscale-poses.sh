#!/usr/bin/env bash
# Makes the two sharp stills the exercise details sheet switches between:
#   media/gif/X.gif → frontend/public/pose/X-1.webp (frame 1) and X-2.webp (frame 7)
# Those are the GIF's two held positions — every dataset GIF holds frame 1 and frame 7 for a
# full second, with the movement between them — redrawn at 720px by Real-ESRGAN (x4plus).
# The GIFs are 180px, so stretched to fill the sheet they're soft; the in-between frames also
# carry motion trails. Two clean, sharp poses read better than the full blurry rep.
#
# The stills are committed in frontend/public/pose and ship with every build, so this only needs
# running again if the dataset gains exercises. Real-ESRGAN runs on the GPU (Vulkan), so it runs
# on a desktop, not in Docker. It isn't bundled — download realesrgan-ncnn-vulkan from
# github.com/xinntao/Real-ESRGAN/releases and point REALESRGAN at the executable (its models/
# folder must sit beside it).
#
#   REALESRGAN=/path/to/realesrgan-ncnn-vulkan scripts/upscale-poses.sh [media-dir] [out-dir]
#
# About 4s a still on integrated graphics: ~3 hours for all 1,324 exercises. Resumable: an
# exercise with both stills is skipped, and each still is written under a temp name first.
# WebP at quality 82: ~18 KB a still, indistinguishable from a near-lossless JPEG at twice the
# size. Exits 0 only once every exercise has both stills; 2 if some frames came back blank
# (run it again to redo those); 1 if a whole batch did (the GPU isn't reachable).
set -euo pipefail

dir=${1:-"$(dirname "$0")/../media"}
out_dir=${2:-"$(dirname "$0")/../frontend/public/pose"}
exe=${REALESRGAN:?set REALESRGAN to the realesrgan-ncnn-vulkan executable}
models="$(dirname "$exe")/models"
# Exercises per upscaler run. Loading the model costs a few seconds, and on integrated graphics
# a run can go bad partway (see the blank-frame check), so runs stay short.
batch=25
mkdir -p "$out_dir"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Names are cut with parameter expansion, not basename or $(...): on Windows every subprocess
# can cost half a second when the machine is busy, and these loops run once per exercise.
gifs=("$dir"/gif/*.gif)
todo=()
for g in "${gifs[@]}"; do
  b=${g##*/}; b=${b%.gif}
  [ -s "$out_dir/$b-1.webp" ] && [ -s "$out_dir/$b-2.webp" ] || todo+=("$g")
done
total=${#gifs[@]}
echo "↻ Upscaling the two poses of ${#todo[@]} of $total exercises (the rest are done)…"

skipped=0
for ((i = 0; i < ${#todo[@]}; i += batch)); do
  rm -rf "$tmp/in" "$tmp/out"
  mkdir -p "$tmp/in" "$tmp/out"
  for g in "${todo[@]:i:batch}"; do
    b=${g##*/}
    # frames 1 and 7 (n = 0 and 6), written as X-1.png and X-2.png
    ffmpeg -nostdin -v error -i "$g" -vf "select='eq(n\,0)+eq(n\,6)'" -fps_mode passthrough "$tmp/in/${b%.gif}-%d.png"
  done
  # One frame at a time in 128px tiles: on integrated graphics the defaults (two frames at once,
  # bigger tiles) returned blank frames far more often, for about the same speed.
  "$exe" -i "$tmp/in" -o "$tmp/out" -n realesrgan-x4plus -s 4 -t 128 -j 1:1:1 -m "$models" -f png >/dev/null 2>&1 || true
  # The upscaler can exit 0 yet write solid black frames — every one when the GPU isn't
  # reachable (screen locked, display asleep, a process started outside the desktop), now and
  # then a few when the integrated GPU falters under the load. Every real pose sits on white, so
  # a frame with nothing brighter than dark grey is dropped, never saved; its exercise stays
  # unfinished and the next run redoes it.
  kept=0 blank=0
  for p in "$tmp"/out/*.png; do
    [ -e "$p" ] || continue
    ymax=$(ffmpeg -nostdin -v error -i "$p" -vf "scale=64:-1,signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=-" -f null - | grep -o 'YMAX=[0-9]*' | cut -d= -f2)
    if [ "${ymax:-0}" -lt 64 ]; then blank=$((blank + 1)); continue; fi
    b=${p##*/}; out="$out_dir/${b%.png}"
    ffmpeg -nostdin -v error -y -i "$p" -vf "scale=720:-2:flags=lanczos" -c:v libwebp -quality 82 "$out.part.webp"
    mv "$out.part.webp" "$out.webp"
    kept=$((kept + 1))
  done
  if [ $kept -eq 0 ]; then
    echo "✗ Every frame in this batch came back blank, so the GPU isn't reachable. Run it again from a desktop session." >&2
    exit 1
  fi
  skipped=$((skipped + blank))
  done_n=$(( i + batch < ${#todo[@]} ? i + batch : ${#todo[@]} ))
  echo "  $done_n / ${#todo[@]}$([ $blank -gt 0 ] && echo " ($blank blank frames dropped, redone next run)")"
done
echo "✓ $(ls "$out_dir" | grep -c -- '-2\.webp$') of $total exercises have both poses."
[ $skipped -eq 0 ] || exit 2
