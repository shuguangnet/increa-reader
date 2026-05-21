#!/usr/bin/env bash
# ── Bundle size analysis ──
# Usage: bundle-size.sh <dist-dir> <output-json-path>
# Computes total and per-chunk sizes (raw, gzip, brotli) for a Vite build output.
set -euo pipefail

DIST_DIR="${1:-packages/ui/dist}"
OUTPUT="${2:-bundle-size-report.json}"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "dist directory not found: ${DIST_DIR}" >&2
  exit 1
fi

# Ensure required tools are available
if ! command -v gzip &>/dev/null; then
  echo "gzip not found" >&2
  exit 1
fi

HAS_BROTLI=true
if ! command -v brotli &>/dev/null; then
  HAS_BROTLI=false
fi

compute_size() {
  local file="$1"
  local raw
  raw="$(stat -c%s "${file}" 2>/dev/null || stat -f%z "${file}" 2>/dev/null)"
  local gzip
  gzip="$(gzip -c "${file}" | wc -c)"
  local brotli=0
  if [[ "${HAS_BROTLI}" == "true" ]]; then
    brotli="$(brotli -c "${file}" | wc -c)"
  fi
  printf '%s %s %s' "${raw}" "${gzip}" "${brotli}"
}

TOTAL_RAW=0
TOTAL_GZIP=0
TOTAL_BROTLI=0
CHUNKS_JSON=""

# Process JS chunks
for f in "${DIST_DIR}/assets/"*.js; do
  if [[ -f "${f}" ]]; then
    sizes="$(compute_size "${f}")"
    read -r raw gzip brotli <<< "${sizes}"
    name="$(basename "${f}")"
    if [[ -n "${CHUNKS_JSON}" ]]; then CHUNKS_JSON+=","; fi
    CHUNKS_JSON+=$'\n    '"{\"name\":\"${name}\",\"type\":\"js\",\"raw\":${raw},\"gzip\":${gzip},\"brotli\":${brotli}}"
    TOTAL_RAW=$((TOTAL_RAW + raw))
    TOTAL_GZIP=$((TOTAL_GZIP + gzip))
    TOTAL_BROTLI=$((TOTAL_BROTLI + brotli))
  fi
done

# Process CSS chunks
for f in "${DIST_DIR}/assets/"*.css; do
  if [[ -f "${f}" ]]; then
    sizes="$(compute_size "${f}")"
    read -r raw gzip brotli <<< "${sizes}"
    name="$(basename "${f}")"
    if [[ -n "${CHUNKS_JSON}" ]]; then CHUNKS_JSON+=","; fi
    CHUNKS_JSON+=$'\n    '"{\"name\":\"${name}\",\"type\":\"css\",\"raw\":${raw},\"gzip\":${gzip},\"brotli\":${brotli}}"
    TOTAL_RAW=$((TOTAL_RAW + raw))
    TOTAL_GZIP=$((TOTAL_GZIP + gzip))
    TOTAL_BROTLI=$((TOTAL_BROTLI + brotli))
  fi
done

# Build JSON report
HAS_BROTLI_STR="false"
if [[ "${HAS_BROTLI}" == "true" ]]; then HAS_BROTLI_STR="true"; fi

# Format sizes in human-readable form
fmt_raw="$(numfmt --to=iec-i --suffix=B "${TOTAL_RAW}" 2>/dev/null || echo "${TOTAL_RAW} B")"
fmt_gzip="$(numfmt --to=iec-i --suffix=B "${TOTAL_GZIP}" 2>/dev/null || echo "${TOTAL_GZIP} B")"
fmt_brotli="$(numfmt --to=iec-i --suffix=B "${TOTAL_BROTLI}" 2>/dev/null || echo "${TOTAL_BROTLI} B")"

cat > "${OUTPUT}" <<JSON
{
  "total": {
    "raw": ${TOTAL_RAW},
    "gzip": ${TOTAL_GZIP},
    "brotli": ${TOTAL_BROTLI}
  },
  "rawFormatted": "${fmt_raw}",
  "gzipFormatted": "${fmt_gzip}",
  "brotliFormatted": "${fmt_brotli}",
  "brotliAvailable": ${HAS_BROTLI_STR},
  "chunks": [${CHUNKS_JSON}
  ]
}
JSON

echo "Bundle size report written to ${OUTPUT}"
echo "  Total: ${fmt_raw}"
echo "  Gzip:  ${fmt_gzip}"
if [[ "${HAS_BROTLI}" == "true" ]]; then
  echo "  Brotli: ${fmt_brotli}"
fi
