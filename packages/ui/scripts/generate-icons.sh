#!/usr/bin/env bash
# generate-icons.sh — Generate PNG icons from SVG sources for PWA manifest
# Requires: Inkscape (preferred) or librsvg (rsvg-convert) or resvg
#
# Usage:
#   ./scripts/generate-icons.sh
#
# This script converts the SVG icons (icon-192.svg, icon-512.svg) into
# PNG format at various sizes required by PWA manifests and creates
# placeholder screenshot files.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$(dirname "$SCRIPT_DIR")/public"

echo "🔧 PWA Icon Generator"
echo "   Public dir: $PUBLIC_DIR"

# Check for SVG → PNG converters
convert_svg() {
  local input="$1" output="$2" size="$3"
  
  if command -v inkscape &>/dev/null; then
    inkscape "$input" -w "$size" -h "$size" -o "$output" 2>/dev/null
  elif command -v rsvg-convert &>/dev/null; then
    rsvg-convert -w "$size" -h "$size" -o "$output" "$input"
  elif command -v resvg &>/dev/null; then
    resvg -z "$(echo "scale=2; $size / 512" | bc)" "$input" "$output" 2>/dev/null
  elif command -v convert &>/dev/null; then
    # ImageMagick — lower quality for SVG but works
    convert -background none -density 300 -resize "${size}x${size}" "$input" "$output"
  else
    echo "⚠️  No SVG→PNG converter found (inkscape, rsvg-convert, resvg, or imagemagick)"
    echo "   Install one with: apt install inkscape / brew install librsvg / pip install resvg-cli"
    return 1
  fi
}

# Generate PNG icons at standard PWA sizes
icon_sizes=(72 96 128 144 152 192 384 512)
svg_source="$PUBLIC_DIR/icon-512.svg"

for size in "${icon_sizes[@]}"; do
  output="$PUBLIC_DIR/icon-${size}x${size}.png"
  echo "  Generating ${size}x${size} icon..."
  if convert_svg "$svg_source" "$output" "$size"; then
    echo "  ✅ $output"
  else
    echo "  ❌ Failed to generate $output"
  fi
done

# Generate Apple touch icon (180x180)
echo "  Generating Apple touch icon..."
convert_svg "$svg_source" "$PUBLIC_DIR/apple-touch-icon.png" 180 && \
  echo "  ✅ apple-touch-icon.png" || \
  echo "  ❌ Failed"

# Generate favicon (32x32)
echo "  Generating favicon..."
convert_svg "$svg_source" "$PUBLIC_DIR/favicon-32x32.png" 32 && \
  echo "  ✅ favicon-32x32.png" || \
  echo "  ❌ Failed"

# Create placeholder screenshots directory
screenshots_dir="$PUBLIC_DIR/screenshots"
mkdir -p "$screenshots_dir"

# Create simple placeholder screenshot PNGs using canvas-style SVG → PNG
# These are just colored rectangles as placeholders — replace with real screenshots
for name in home search chat; do
  # Create a simple placeholder SVG
  placeholder_svg="/tmp/pwa-screenshot-${name}.svg"
  case "$name" in
    home) label="首页" color="#1e293b" ;;
    search) label="搜索" color="#1e40af" ;;
    chat) label="AI 对话" color="#065f46" ;;
  esac
  
  cat > "$placeholder_svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
  <rect width="390" height="844" fill="${color}"/>
  <text x="195" y="422" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="32" fill="white">Increa Reader</text>
  <text x="195" y="460" text-anchor="middle" font-family="system-ui" font-size="18" fill="white">${label}</text>
  <text x="195" y="500" text-anchor="middle" font-family="system-ui" font-size="12" fill="#94a3b8">替换为真实截图</text>
</svg>
EOF

  output="$screenshots_dir/${name}-narrow.png"
  echo "  Generating screenshot ${name}..."
  if convert_svg "$placeholder_svg" "$output" 844; then
    echo "  ✅ $output"
  else
    echo "  ⚠️  Skipping screenshot $name (no converter available)"
  fi
  rm -f "$placeholder_svg"
done

echo ""
echo "✨ Done! If no converter was available, the SVG icons in manifest.json"
echo "   will still work in most modern browsers. When you have a converter,"
echo "   re-run this script to generate PNG versions."