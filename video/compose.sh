#!/usr/bin/env bash
# Builds the final videos from out/ (run inside an ffmpeg image with libass, workdir = this folder):
#   out/relayd-demo-voice.mp4     framed recording + captions + TTS voice
#   out/relayd-demo-captions.mp4  framed recording + captions, no voice (read your own narration over it)
set -euo pipefail
cd /work
source out/audio.env
mkdir -p out/fonts
[ -s out/fonts/Geist.ttf ] || echo "warning: Geist font missing, captions use a fallback font"

# 1. Frames (real timestamps) -> constant 30 fps screen video, sized for the frame.
ffmpeg -y -loglevel error -f concat -safe 0 -i out/frames.txt \
  -vf "fps=30,scale=1632:918:flags=lanczos,format=yuv420p" -c:v libx264 -crf 16 -preset medium out/screen.mp4

# 2. Frame it: background, soft shadow, rounded corners, captions in the band under the screen, gentle fades.
VIDEO_FILTER="[3:v]format=gray,scale=1632:918[m];[2:v]format=rgba[s];[s][m]alphamerge[sr];[0:v][1:v]overlay=0:0[b];[b][sr]overlay=144:62:shortest=1,subtitles=out/captions.ass:fontsdir=out/fonts,fade=t=in:st=0:d=0.6,fade=t=out:st=$FADE_OUT:d=1.0,format=yuv420p[vout]"

ffmpeg -y -loglevel error -loop 1 -i out/bg.png -loop 1 -i out/shadow.png -i out/screen.mp4 -loop 1 -i out/mask.png $VOICE_INPUTS \
  -filter_complex "$VIDEO_FILTER;$AUDIO_FILTER" -map "[vout]" -map "[aout]" -t "$LENGTH" \
  -c:v libx264 -crf 18 -preset medium -r 30 -c:a aac -b:a 160k -movflags +faststart out/relayd-demo-voice.mp4

ffmpeg -y -loglevel error -loop 1 -i out/bg.png -loop 1 -i out/shadow.png -i out/screen.mp4 -loop 1 -i out/mask.png \
  -filter_complex "$VIDEO_FILTER" -map "[vout]" -t "$LENGTH" \
  -c:v libx264 -crf 18 -preset medium -r 30 -movflags +faststart out/relayd-demo-captions.mp4

ls -la out/*.mp4
