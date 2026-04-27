#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# convert-to-vp9.sh — Convert 4K AV1 (or any codec) MP4 → VP9 WebM
# Optimized for playback in Chrome on Android (Pixel 4 XL, etc.)
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   chmod +x scripts/convert-to-vp9.sh
#   ./scripts/convert-to-vp9.sh input.mp4
#   ./scripts/convert-to-vp9.sh input.mp4 output.webm   # optional custom output name
# ─────────────────────────────────────────────────────────────────────────────

set -e

INPUT="$1"
OUTPUT="${2:-}"

# Validate input
if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 <input.mp4> [output.webm]"
  echo "Example: $0 my_vr_video.mp4"
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "❌ File not found: $INPUT"
  exit 1
fi

# Auto-generate output filename if not provided
if [[ -z "$OUTPUT" ]]; then
  BASENAME="${INPUT%.*}"
  OUTPUT="${BASENAME}_vp9.webm"
fi

# Check ffmpeg is available
if ! command -v ffmpeg &>/dev/null; then
  echo "❌ ffmpeg not found. Install with: sudo apt install ffmpeg"
  exit 1
fi

# ── Probe the input ────────────────────────────────────────────────────────
echo ""
echo "📂 Input:  $INPUT"
echo "📦 Output: $OUTPUT"
echo ""

WIDTH=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width -of csv=p=0 "$INPUT" 2>/dev/null)
HEIGHT=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=height -of csv=p=0 "$INPUT" 2>/dev/null)
CODEC=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name -of csv=p=0 "$INPUT" 2>/dev/null)
DURATION=$(ffprobe -v error -show_entries format=duration \
  -of csv=p=0 "$INPUT" 2>/dev/null | xargs printf "%.0f")

echo "ℹ  Detected: ${WIDTH}x${HEIGHT} | codec: ${CODEC} | duration: ~${DURATION}s"
echo ""

# ── Quality settings based on resolution ──────────────────────────────────
# VP9 CRF: lower = better quality, larger file (range 0-63)
if   [[ "$WIDTH" -ge 7680 ]]; then CRF=30; SPEED=2; LABEL="8K"
elif [[ "$WIDTH" -ge 3840 ]]; then CRF=32; SPEED=2; LABEL="4K"
elif [[ "$WIDTH" -ge 2560 ]]; then CRF=33; SPEED=3; LABEL="1440p"
else                                CRF=34; SPEED=4; LABEL="1080p"
fi

echo "⚙  VP9 encode settings: CRF=${CRF}, cpu-used=${SPEED} (${LABEL} preset)"
echo "⏳ Converting… (this may take several minutes for 4K content)"
echo ""

# ── Convert ────────────────────────────────────────────────────────────────
# -b:v 0          → pure CRF mode (variable bitrate, quality-controlled)
# -deadline good  → good speed/quality tradeoff (-deadline best is very slow)
# -cpu-used N     → 0=slowest/best, 5=fastest/worst; 2 is a solid balance for 4K
# -row-mt 1       → enable row-based multithreading (faster on multi-core)
# -c:a libopus    → best audio codec for WebM (much better than vorbis)
# -b:a 192k       → good audio quality
ffmpeg -i "$INPUT" \
  -c:v libvpx-vp9 \
  -crf "$CRF" \
  -b:v 0 \
  -deadline good \
  -cpu-used "$SPEED" \
  -row-mt 1 \
  -c:a libopus \
  -b:a 192k \
  -progress pipe:1 \
  "$OUTPUT"

# ── Summary ────────────────────────────────────────────────────────────────
if [[ -f "$OUTPUT" ]]; then
  IN_SIZE=$(du -sh "$INPUT"  | cut -f1)
  OUT_SIZE=$(du -sh "$OUTPUT" | cut -f1)
  echo ""
  echo "✅ Done!"
  echo "   Input:  $INPUT ($IN_SIZE)"
  echo "   Output: $OUTPUT ($OUT_SIZE)"
else
  echo "❌ Conversion failed — output file not found."
  exit 1
fi
