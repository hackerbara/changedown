#!/bin/bash
# Post-production for ChangeTracks demo videos.
# Trims, crops, and converts raw screencapture recordings.
#
# Usage: ./postprocess.sh <video-name>
# Example: ./postprocess.sh v1-track-changes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
FINAL_DIR="$SCRIPT_DIR/final"

VIDEO_NAME="${1:?Usage: ./postprocess.sh <video-name>}"
RAW_FILE="$OUTPUT_DIR/${VIDEO_NAME}.mov"

if [ ! -f "$RAW_FILE" ]; then
    echo "Error: Raw video not found: $RAW_FILE"
    exit 1
fi

mkdir -p "$FINAL_DIR"

echo "Processing: $VIDEO_NAME"

# MP4 (H.264, 1920x1080) — for Marketplace / direct embedding
echo "  -> MP4"
ffmpeg -y -i "$RAW_FILE" \
    -c:v libx264 -preset slow -crf 23 \
    -pix_fmt yuv420p \
    -an \
    "$FINAL_DIR/${VIDEO_NAME}.mp4"

# GIF (960x540, 10fps) — for GitHub README
echo "  -> GIF"
ffmpeg -y -i "$RAW_FILE" \
    -vf "fps=10,scale=960:540:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
    "$FINAL_DIR/${VIDEO_NAME}.gif"

# WebM (VP9) — web fallback
echo "  -> WebM"
ffmpeg -y -i "$RAW_FILE" \
    -c:v libvpx-vp9 -crf 30 -b:v 0 \
    -an \
    "$FINAL_DIR/${VIDEO_NAME}.webm"

echo "Done: $FINAL_DIR/${VIDEO_NAME}.{mp4,gif,webm}"
ls -lh "$FINAL_DIR/${VIDEO_NAME}."* | awk '{print "  " $5 "\t" $NF}'
