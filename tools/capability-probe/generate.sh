#!/usr/bin/env bash
#
# Capability-probe test-media generator.
# Fabricates a diagnostic matrix of SHORT (5s) clips from one master source,
# to determine exactly what a TV's NATIVE <video> decoder can handle
# (container × video codec × audio codec × feature). Run on a box with a
# recent ffmpeg; serve the OUTDIR over HTTP on your LAN so the TV app can probe it.
#
#   ./generate.sh <master-source> <outdir>
#
# The master should ideally be 4K, 10-bit HDR10, >=60fps, with multichannel
# audio. If it's only SDR / stereo, HDR + surround tests still generate but are
# less meaningful (we upmix stereo->5.1 so the audio ENCODERS are still exercised).
#
# NOT generatable here (proprietary / dynamic metadata) — drop REAL samples in
# OUTDIR with these names: hdr_mp4_dv_p5.mp4, hdr_mp4_dv_p8.mp4, hdr_mkv_dv_p7.mkv,
# hdr_mkv_hdr10plus.mkv, aud_mkv_hevc_atmos.mkv, aud_mp4_hevc_atmos.mp4,
# aud_mkv_hevc_dtshd.mkv, edge_sub_pgs.mkv  (see manifest.json → "realSample": true)
set -euo pipefail

MASTER="${1:?usage: generate.sh <master-source> <outdir>}"
OUT="${2:?usage: generate.sh <master-source> <outdir>}"
mkdir -p "$OUT"

DUR=5                     # clip length (seconds)
SS=00:00:10               # seek into the master to skip intros/black
V="-ss $SS -t $DUR -i \"$MASTER\""
# Common encode knobs
X265="-c:v libx265 -preset veryfast"
X264="-c:v libx264 -preset veryfast"
# Upmix any layout to 5.1 for surround-codec tests (harmless if already 5.1)
UPMIX='-af "aformat=channel_layouts=5.1"'
gen() { echo "  -> $1"; shift; eval "ffmpeg -y -hide_banner -loglevel error -ss $SS -t $DUR -i \"$MASTER\" $* "; }

echo "== Matrix 1: core container + codec baseline =="
gen "base_mp4_avc_aac.mp4"   $X264 -c:a aac -b:a 192k  "$OUT/base_mp4_avc_aac.mp4"
gen "base_mkv_avc_aac.mkv"   $X264 -c:a aac -b:a 192k  "$OUT/base_mkv_avc_aac.mkv"
gen "base_mkv_hevc_ac3.mkv"  $X265 -c:a ac3 -b:a 448k  "$OUT/base_mkv_hevc_ac3.mkv"
gen "base_mp4_hevc_eac3.mp4" $X265 -tag:v hvc1 -c:a eac3 -b:a 384k "$OUT/base_mp4_hevc_eac3.mp4"
gen "base_webm_vp9_opus.webm" -c:v libvpx-vp9 -b:v 6M -c:a libopus "$OUT/base_webm_vp9_opus.webm"
gen "base_mkv_av1_opus.mkv"  -c:v libsvtav1 -preset 8 -crf 35 -c:a libopus "$OUT/base_mkv_av1_opus.mkv"
gen "base_avi_divx_mp3.avi"  -c:v mpeg4 -vtag DX50 -c:a libmp3lame -b:a 192k "$OUT/base_avi_divx_mp3.avi"

echo "== Matrix 2: HDR / color space (HDR10 only; DV/HDR10+ need real samples) =="
gen "hdr_mkv_hdr10.mkv" -c:v libx265 -preset veryfast -pix_fmt yuv420p10le \
  -x265-params "hdr10=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400" \
  -c:a ac3 -b:a 448k "$OUT/hdr_mkv_hdr10.mkv"

echo "== Matrix 3: audio licensing / surround (Atmos & DTS-HD MA need real samples) =="
gen "aud_mkv_avc_flac.mkv"   $X264 $UPMIX -c:a flac "$OUT/aud_mkv_avc_flac.mkv"
gen "aud_mkv_avc_truehd.mkv" $X264 $UPMIX -c:a truehd "$OUT/aud_mkv_avc_truehd.mkv"
gen "aud_mkv_avc_dts.mkv"    $X264 $UPMIX -strict -2 -c:a dca "$OUT/aud_mkv_avc_dts.mkv"

echo "== Matrix 4: bitrate / performance ladder (HEVC/aac in mkv) =="
perf() { # name WxH fps bitrate
  gen "$1" $X265 -vf "scale=$2,fps=$3" -b:v "$4" -maxrate "$4" -bufsize "$4" -c:a aac -b:a 192k "$OUT/$1"
}
perf "perf_1080p_60_10m.mkv"  1920x1080 60 10M
perf "perf_4k_30_40m.mkv"     3840x2160 30 40M
perf "perf_4k_60_80m.mkv"     3840x2160 60 80M
perf "perf_4k_60_120m.mkv"    3840x2160 60 120M
perf "perf_8k_60_150m.mkv"    7680x4320 60 150M

echo "== Matrix 5: edge cases =="
# SRT text subtitle muxed in
printf '1\n00:00:00,500 --> 00:00:04,500\nCapability probe subtitle test\n' > "$OUT/_t.srt"
gen "edge_sub_srt.mkv" $X264 -c:a aac -i "$OUT/_t.srt" -c:s srt "$OUT/edge_sub_srt.mkv" || true
rm -f "$OUT/_t.srt"
# 30 dummy audio tracks (stress the demuxer)
MAPS=""; for i in $(seq 1 30); do MAPS="$MAPS -map 0:v:0 -map 0:a:0"; done
gen "edge_tracks_30.mkv" $X264 $MAPS -c:a aac -b:a 96k "$OUT/edge_tracks_30.mkv"
# Anamorphic: 720x480 stored, flagged to display 16:9
gen "edge_anamorphic.mp4" $X264 -vf "scale=720:480,setsar=32/27" -c:a aac "$OUT/edge_anamorphic.mp4"

echo ""
echo "Done. Generated clips in: $OUT"
echo "Now drop the real-sample files (see header) and serve $OUT over HTTP on your LAN."
