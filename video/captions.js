/**
 * Builds captions (ASS for burning in, SRT for YouTube) and the audio mix filter from
 * scenes.json + out/timeline.json. Run with node from the video folder.
 */
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const OUT = path.join(DIR, "out");
const scenes = JSON.parse(fs.readFileSync(path.join(DIR, "scenes.json"), "utf8"));
const tl = JSON.parse(fs.readFileSync(path.join(OUT, "timeline.json"), "utf8"));
const VOICE_DELAY = 0.15; // small breath before each line

// Split into caption-sized chunks at sentence and clause boundaries (max ~74 characters).
function chunks(text) {
  const out = [];
  for (const sentence of text.match(/[^.!?]+[.!?]?/g).map((s) => s.trim()).filter(Boolean)) {
    if (sentence.length <= 74) { out.push(sentence); continue; }
    let cur = "";
    for (const part of sentence.split(/(?<=,)\s+/)) {
      if ((cur + " " + part).trim().length > 74 && cur) { out.push(cur.trim()); cur = part; }
      else cur = (cur + " " + part).trim();
    }
    if (cur) out.push(cur.trim());
  }
  return out;
}

const cues = [];
for (const s of scenes) {
  const m = tl.scenes.find((x) => x.id === s.id);
  if (!m) continue;
  const parts = chunks(s.text);
  const total = parts.reduce((a, p) => a + p.length, 0);
  let t = (m.voiceStart ?? m.start) + VOICE_DELAY;
  for (const p of parts) {
    const d = (m.voice * p.length) / total;
    cues.push({ start: t, end: t + d - 0.05, text: p });
    t += d;
  }
}

const ass = (t) => {
  const h = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = (t % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(mm).padStart(2, "0")}:${ss}`;
};
const srt = (t) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000), ss = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};

fs.writeFileSync(
  path.join(OUT, "captions.ass"),
  `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Geist,38,&H00F2EEF3,&H00F2EEF3,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,160,160,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cues.map((c) => `Dialogue: 0,${ass(c.start)},${ass(c.end)},Cap,,0,0,0,,{\\fad(120,120)}${c.text}`).join("\n")}
`,
);
fs.writeFileSync(path.join(OUT, "captions.srt"), cues.map((c, i) => `${i + 1}\n${srt(c.start)} --> ${srt(c.end)}\n${c.text}\n`).join("\n"));

// Audio: each scene's voice placed at its scene start, mixed, normalised.
const inputs = scenes.filter((s) => tl.scenes.find((x) => x.id === s.id)).map((s) => `-i out/voice/${s.id}.wav`).join(" ");
const delays = scenes
  .map((s, i) => {
    const m = tl.scenes.find((x) => x.id === s.id);
    const ms = Math.round(((m.voiceStart ?? m.start) + VOICE_DELAY) * 1000);
    return `[${i + 4}:a]adelay=${ms}|${ms},aresample=48000[a${i}]`;
  })
  .join(";");
const mix = `${scenes.map((_, i) => `[a${i}]`).join("")}amix=inputs=${scenes.length}:normalize=0,apad,atrim=0:${tl.length.toFixed(2)},afade=t=out:st=${(tl.length - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
fs.writeFileSync(path.join(OUT, "audio.env"), `VOICE_INPUTS="${inputs}"\nAUDIO_FILTER="${delays};${mix}"\nLENGTH=${tl.length.toFixed(2)}\nFADE_OUT=${(tl.length - 1).toFixed(2)}\n`);
console.log(`${cues.length} captions, length ${tl.length.toFixed(1)}s`);
