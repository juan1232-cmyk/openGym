#!/usr/bin/env bash
# Makes the two sharp stills the exercise details sheet switches between:
#   media/gif/X.gif → media/pose/X-1.jpg (frame 1) and media/pose/X-2.jpg (frame 7)
# Those are the GIF's two held positions — every dataset GIF holds frame 1 and frame 7 for a
# full second, with the movement between them — redrawn at 720px by Real-ESRGAN (x4plus).
# The GIFs are 180px, so stretched to fill the sheet they're soft; the in-between frames also
# carry motion trails. Two clean, sharp poses read better than the full blurry rep.
#
# Real-ESRGAN runs on the GPU (Vulkan), so this runs on a desktop rather than in Docker:
# afterwards, copy media/pose/ next to media/gif/ on the server. It isn't bundled — download
# realesrgan-ncnn-vulkan from github.com/xinntao/Real-ESRGAN/releases and point REALESRGAN at
# the executable (its models/ folder must sit beside it).
#
#   REALESRGAN=/path/to/realesrgan-ncnn-vulkan scripts/upscale-poses.sh [media-dir]
#
# About 10s a still on integrated graphics: ~7 hours for all 1,324 exercises. Resumable: an
# exercise with both stills is skipped, and each still is written under a temp name first.
set -euo pipefail

dir=${1:-"$(dirname "$0")/../media"}
exe=${REALESRGAN:?set REALESRGAN to the realesrgan-ncnn-vulkan executable}
models="$(dirname "$exe")/models"
batch=100  # exercises per upscaler run: loading the model takes minutes, so runs are big
mkdir -p "$dir/pose"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

todo=()
for g in "$dir"/gif/*.gif; do
  b=$(basename "$g" .gif)
  [ -s "$dir/pose/$b-1.jpg" ] && [ -s "$dir/pose/$b-2.jpg" ] || todo+=("$g")
done
total=$(ls "$dir"/gif/*.gif | wc -l)
echo "↻ Upscaling the two poses of ${#todo[@]} of $total exercises (the rest are done)…"

for ((i = 0; i < ${#todo[@]}; i += batch)); do
  rm -rf "$tmp/in" "$tmp/out"
  mkdir -p "$tmp/in" "$tmp/out"
  for g in "${todo[@]:i:batch}"; do
    # frames 1 and 7 (n = 0 and 6), written as X-1.png and X-2.png
    ffmpeg -nostdin -v error -i "$g" -vf "select='eq(n\,0)+eq(n\,6)'" -fps_mode passthrough "$tmp/in/$(basename "$g" .gif)-%d.png"
  done
  "$exe" -i "$tmp/in" -o "$tmp/out" -n realesrgan-x4plus -s 4 -m "$models" -f png >/dev/null 2>&1
  for p in "$tmp"/out/*.png; do
    out="$dir/pose/$(basename "$p" .png)"
    ffmpeg -nostdin -v error -y -i "$p" -vf "scale=720:-2:flags=lanczos" -q:v 2 "$out.part.jpg"
    mv "$out.part.jpg" "$out.jpg"
  done
  done_n=$(( i + batch < ${#todo[@]} ? i + batch : ${#todo[@]} ))
  echo "  $done_n / ${#todo[@]}"
done
echo "✓ $(( $(ls "$dir/pose" | grep -c -- '-2\.jpg$') )) of $total exercises have both poses."
