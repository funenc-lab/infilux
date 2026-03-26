#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_SVG="$ROOT_DIR/src/renderer/assets/logo.svg"
MAC_SOURCE_SVG="$ROOT_DIR/src/renderer/assets/logo-mac.svg"
MAC_LIGHT_SOURCE_SVG="$ROOT_DIR/src/renderer/assets/logo-mac-light.svg"
MONO_SOURCE_SVG="$ROOT_DIR/src/renderer/assets/logo-mono.svg"
BUILD_DIR="$ROOT_DIR/build"
BUILD_ICON_DIR="$BUILD_DIR/icons"
TRAY_DIR="$BUILD_DIR/tray"
RENDERER_ASSET_DIR="$ROOT_DIR/src/renderer/assets"
DOCS_ASSET_DIR="$ROOT_DIR/docs/assets"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/infilux-logo.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

render_png() {
  local source_path="$1"
  local size="$2"
  local output_path="$3"

  magick -background none "$source_path" -resize "${size}x${size}" "PNG32:$output_path"
}

require_command magick
require_command iconutil

mkdir -p "$BUILD_DIR" "$BUILD_ICON_DIR" "$RENDERER_ASSET_DIR" "$DOCS_ASSET_DIR"
mkdir -p "$TRAY_DIR"

render_png "$SOURCE_SVG" 1024 "$BUILD_DIR/icon.png"
render_png "$MAC_SOURCE_SVG" 1024 "$BUILD_DIR/icon-mac.png"
render_png "$MAC_LIGHT_SOURCE_SVG" 1024 "$BUILD_DIR/icon-mac-light.png"
render_png "$SOURCE_SVG" 2048 "$DOCS_ASSET_DIR/logo.png"
render_png "$SOURCE_SVG" 32 "$RENDERER_ASSET_DIR/logo.png"

for size in 16 32 48 64 128 256 512; do
  render_png "$SOURCE_SVG" "$size" "$BUILD_ICON_DIR/${size}x${size}.png"
done

render_png "$SOURCE_SVG" 24 "$TMP_DIR/24x24.png"

magick \
  "$BUILD_ICON_DIR/16x16.png" \
  "$TMP_DIR/24x24.png" \
  "$BUILD_ICON_DIR/32x32.png" \
  "$BUILD_ICON_DIR/48x48.png" \
  "$BUILD_ICON_DIR/64x64.png" \
  "$BUILD_ICON_DIR/128x128.png" \
  "$BUILD_ICON_DIR/256x256.png" \
  "$BUILD_DIR/icon.ico"

ICONSET_DIR="$TMP_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

render_png "$MAC_SOURCE_SVG" 16 "$ICONSET_DIR/icon_16x16.png"
render_png "$MAC_SOURCE_SVG" 32 "$ICONSET_DIR/icon_16x16@2x.png"
render_png "$MAC_SOURCE_SVG" 32 "$ICONSET_DIR/icon_32x32.png"
render_png "$MAC_SOURCE_SVG" 64 "$ICONSET_DIR/icon_32x32@2x.png"
render_png "$MAC_SOURCE_SVG" 128 "$ICONSET_DIR/icon_128x128.png"
render_png "$MAC_SOURCE_SVG" 256 "$ICONSET_DIR/icon_128x128@2x.png"
render_png "$MAC_SOURCE_SVG" 256 "$ICONSET_DIR/icon_256x256.png"
render_png "$MAC_SOURCE_SVG" 512 "$ICONSET_DIR/icon_256x256@2x.png"
render_png "$MAC_SOURCE_SVG" 512 "$ICONSET_DIR/icon_512x512.png"
cp "$BUILD_DIR/icon-mac.png" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"

magick "$MONO_SOURCE_SVG" -background none -resize 18x18 "$TRAY_DIR/iconTemplate.png"
magick "$MONO_SOURCE_SVG" -background none -resize 36x36 "$TRAY_DIR/iconTemplate@2x.png"
magick "$MONO_SOURCE_SVG" -background none -resize 54x54 "$TRAY_DIR/iconTemplate@3x.png"

echo "Generated logo assets from $SOURCE_SVG"
