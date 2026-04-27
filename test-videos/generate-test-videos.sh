#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# generate-test-videos.sh
# Generates synthetic equirectangular 360° test videos using FFmpeg.
# Each video shows a grid, compass labels (N/S/E/W), resolution, codec, and timer.
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   chmod +x test-videos/generate-test-videos.sh
#   ./test-videos/generate-test-videos.sh
#
# Requirements:
#   ffmpeg with libx264 (standard). libx265 optional for H.265 output.
# ─────────────────────────────────────────────────────────────────────────────

set -e
mkdir -p test-videos

has_encoder() { ffmpeg -encoders 2>/dev/null | grep -q "$1"; }

# ─── Core generator ────────────────────────────────────────────────────────
generate() {
  local label="$1"   # e.g. "4K 360° | H.264"
  local width="$2"
  local height="$3"
  local codec="$4"   # libx264 or libx265
  local crf="$5"
  local outfile="test-videos/${6}.mp4"

  local grid_w=$((width / 8))
  local grid_h=$((height / 8))
  local fs_big=$((height / 16))
  local fs_sm=$((height / 24))

  echo "▶ Generating $outfile (${width}x${height}, $codec)…"

  ffmpeg -y \
    -f lavfi -i "color=c=0x0f172a:size=${width}x${height}:rate=30" \
    -filter_complex "
      [0:v]
      drawgrid=width=${grid_w}:height=${grid_h}:thickness=2:color=0x3b82f6@0.6,
      drawtext=text='N':fontsize=${fs_big}:x=(W-tw)/2:y=${grid_h}-th/2:fontcolor=white,
      drawtext=text='S':fontsize=${fs_big}:x=(W-tw)/2:y=H-${grid_h}-th/2:fontcolor=white,
      drawtext=text='W':fontsize=${fs_big}:x=${grid_w}-tw/2:y=(H-th)/2:fontcolor=white,
      drawtext=text='E':fontsize=${fs_big}:x=W-${grid_w}-tw/2:y=(H-th)/2:fontcolor=white,
      drawtext=text='${label}':fontsize=${fs_big}:x=(W-tw)/2:y=(H-th)/2-${fs_big}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=10,
      drawtext=text='%{pts\\:hms}':fontsize=${fs_sm}:x=W*0.02:y=H*0.04:fontcolor=yellow
    " \
    -t 30 \
    -c:v "$codec" -crf "$crf" -preset fast \
    -movflags +faststart \
    "$outfile"

  local size
  size=$(du -sh "$outfile" | cut -f1)
  echo "  ✓ $outfile ($size)"
}

# ─── H.264 videos ──────────────────────────────────────────────────────────
echo ""
echo "═══ H.264 (libx264) ═══"
generate "1080p 360° | H.264"  1920  960  libx264 23  "360_1080p_h264"
generate "1440p 360° | H.264"  2880 1440  libx264 23  "360_1440p_h264"
generate "4K 360°    | H.264"  3840 1920  libx264 23  "360_4k_h264"
# 8K is very slow — comment out if you're in a hurry
# generate "8K 360°  | H.264"  7680 3840  libx264 23  "360_8k_h264"

# ─── H.265 videos ──────────────────────────────────────────────────────────
echo ""
if has_encoder libx265; then
  echo "═══ H.265 (libx265) ═══"
  generate "1080p 360° | H.265"  1920  960  libx265 28  "360_1080p_h265"
  generate "4K 360°    | H.265"  3840 1920  libx265 28  "360_4k_h265"
else
  echo "⚠  libx265 not found — skipping H.265. Install with: sudo apt install ffmpeg"
fi

# ─── 180° videos (front hemisphere only — common VR headset format) ────────
echo ""
echo "═══ 180° Monoscopic (front hemisphere) ═══"
# 180° equirectangular is 2:1 but only covers the FRONT half of the sphere.
# Aspect ratio is typically 2:1 (same as 360°) but content is centered front-facing.
generate "1080p 180° | H.264"  1920 1080  libx264 23  "180_1080p_h264"
generate "4K 180°    | H.264"  3840 2160  libx264 23  "180_4k_h264"

echo ""
echo "═══════════════════════════════════════════"
echo "✅ Done! Test videos saved to ./test-videos/"
echo ""
echo "Video mapping reference:"
echo "  360° equirectangular → 2:1 aspect (3840×1920 for 4K)"
echo "  180° monoscopic     → ~2:1 or 16:9 (3840×2160 for 4K)"
echo ""
echo "Compass labels in the video help verify correct sphere mapping:"
echo "  • N/S should appear at top/bottom of the sphere"
echo "  • E/W should appear on the left/right equator"
