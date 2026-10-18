/**
 * Scripted screen recording of the live site for the demo video.
 * Runs in zenika/alpine-chrome:with-puppeteer with this folder mounted at /usr/src/app/v:
 *   docker run --rm --network host -v ~/relayd/video:/usr/src/app/v zenika/alpine-chrome:with-puppeteer node v/record.js
 * Writes out/frames/*.jpg, out/frames.txt (ffconcat with real frame durations), out/timeline.json,
 * and the static compositing layers (out/bg.png, out/shadow.png, out/mask.png).
 */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const OUT = path.join(DIR, "out");
const FRAMES = path.join(OUT, "frames");
const BASE = process.env.BASE || "https://getrelayd.vercel.app";
const durations = JSON.parse(fs.readFileSync(path.join(OUT, "durations.json"), "utf8"));
const VW = 1440, VH = 810, DPR = 4 / 3; // frames come out 1920x1080
const PAD = 1.4; // seconds of breathing room after each line of voice
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

/* ---------- in-page overlays: cursor, click ripple, camera zoom ---------- */
function installOverlay() {
  if (window.__rlInstalled) return;
  window.__rlInstalled = true;
  const add = () => {
    const st = document.createElement("style");
    st.textContent = `
      #__cur{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:scale 120ms ease;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
      #__cur.down{scale:.86}
      .__rip{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;z-index:2147483646;pointer-events:none;
        background:rgba(91,75,219,.22);box-shadow:0 0 0 2px rgba(91,75,219,.6);animation:__rip 560ms cubic-bezier(.22,1,.36,1) forwards}
      @keyframes __rip{from{transform:scale(.25);opacity:1}to{transform:scale(1.7);opacity:0}}
      html,body{cursor:none!important} *{cursor:none!important}`;
    document.documentElement.appendChild(st);
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M5 3 L5 24 L10.4 19 L14.2 27.2 L17.6 25.7 L13.9 17.7 L21 17.7 Z" fill="#141014" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    window.__setCur = (x, y) => (c.style.transform = `translate(${x - 5}px, ${y - 3}px)`);
    if (window.__curStart) window.__setCur(window.__curStart.x, window.__curStart.y);
    addEventListener("mousemove", (e) => window.__setCur(e.clientX, e.clientY), true);
    addEventListener("mousedown", (e) => {
      c.classList.add("down");
      const r = document.createElement("div");
      r.className = "__rip";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
    addEventListener("mouseup", () => c.classList.remove("down"), true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add);
  else add();
}

async function zoom(page, target, s = 1, ms = 1000) {
  await page.evaluate(
    (target, s, ms) => {
      const b = document.body;
      const z = window.__z || { tx: 0, ty: 0, s: 1 };
      let cx = innerWidth / 2 + scrollX, cy = innerHeight / 2 + scrollY;
      if (s !== 1 && target) {
        const el = typeof target === "string" ? document.querySelector(target) : null;
        const r = el ? el.getBoundingClientRect() : target;
        // back to un-zoomed document coordinates
        cx = (r.x + r.width / 2 + scrollX - z.tx) / z.s;
        cy = (r.y + r.height / 2 + scrollY - z.ty) / z.s;
      }
      const W = document.documentElement.clientWidth, H = Math.max(document.documentElement.scrollHeight, innerHeight);
      let tx = innerWidth / 2 + scrollX - s * cx, ty = innerHeight / 2 + scrollY - s * cy;
      tx = Math.min(scrollX, Math.max(scrollX + innerWidth - s * W, tx));
      ty = Math.min(scrollY, Math.max(scrollY + innerHeight - s * H, ty));
      if (s === 1) { tx = 0; ty = 0; }
      b.style.transformOrigin = "0 0";
      b.style.transition = `transform ${ms}ms cubic-bezier(.22,1,.36,1)`;
      b.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      window.__z = { tx, ty, s };
    },
    target, s, ms,
  );
  await sleep(ms + 80);
}

/* ---------- smooth cursor ---------- */
let mx = VW * 0.62, my = VH * 0.55;
async function glide(page, x, y, ms = 750) {
  const sx = mx, sy = my;
  const begin = Date.now();
  for (;;) {
    // time-based, so a glide lasts its intended duration however slow each mouse event is
    const t = Math.min(1, (Date.now() - begin) / ms);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // a slight arc, like a hand
    const arc = Math.sin(Math.PI * t) * Math.min(40, Math.hypot(x - sx, y - sy) * 0.08);
    await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e - arc);
    if (t >= 1) break;
    await sleep(10);
  }
  mx = x;
  my = y;
}
async function center(page, selector, pick) {
  return page.evaluate((selector, pick) => {
    const all = [...document.querySelectorAll(selector)];
    const el = pick ? all.find((e) => (e.getAttribute("aria-label") || e.textContent || "").includes(pick)) : all[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  }, selector, pick);
}
async function glideTo(page, selector, pick, ms) {
  const c = await center(page, selector, pick);
  if (!c) throw new Error(`not found: ${selector} ${pick || ""}`);
  await glide(page, c.x, c.y, ms);
  return c;
}
async function click(page) {
  await page.mouse.down();
  await sleep(110);
  await page.mouse.up();
}
/** Glide onto a control until the element under the cursor really is that control. */
async function aim(page, selector, pick, ms = 800) {
  for (let i = 0; i < 5; i++) {
    const c = await center(page, selector, pick);
    if (!c) { await sleep(400); continue; }
    await glide(page, c.x, c.y, i ? 350 : ms);
    await sleep(250);
    const ok = await page.evaluate((x, y, selector, pick) => {
      const el = document.elementFromPoint(x, y);
      const hit = el && el.closest(selector);
      return !!hit && (!pick || (hit.getAttribute("aria-label") || hit.textContent || "").includes(pick));
    }, c.x, c.y, selector, pick);
    if (ok) return true;
    console.log("re-aim", selector, pick || "", Math.round(c.x), Math.round(c.y));
    await sleep(350);
  }
  return false;
}
/** Glide onto a control and only click once the element under the cursor really is that control. */
async function aimPress(page, after, selector, pick, ms = 800) {
  for (let i = 0; i < 4; i++) {
    const c = await center(page, selector, pick);
    if (!c) { await sleep(400); continue; }
    await glide(page, c.x, c.y, i ? 350 : ms);
    await sleep(250);
    const ok = await page.evaluate((x, y, selector, pick) => {
      const el = document.elementFromPoint(x, y);
      const hit = el && el.closest(selector);
      return !!hit && (!pick || (hit.getAttribute("aria-label") || hit.textContent || "").includes(pick));
    }, c.x, c.y, selector, pick);
    if (ok) return press(page, after, selector, pick);
    console.log("re-aim", selector, pick || "", Math.round(c.x), Math.round(c.y));
    await sleep(350);
  }
  return press(page, after, selector, pick);
}
/** Click where the cursor is, then confirm the screen changed; if not, activate the same control directly. */
async function press(page, after, selector, pick) {
  await click(page);
  try {
    await page.waitForSelector(after, { timeout: 3000 });
  } catch {
    console.log("click fallback:", selector, pick || "");
    await page.evaluate((selector, pick) => {
      const all = [...document.querySelectorAll(selector)];
      const el = pick ? all.find((e) => (e.getAttribute("aria-label") || e.textContent || "").includes(pick)) : all[0];
      if (el) el.click();
    }, selector, pick);
    await page.waitForSelector(after, { timeout: 15000 });
  }
}

/* ---------- static layers for compositing ---------- */
async function renderLayers(browser) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const shot = async (html, file, transparent) => {
    await p.setContent(`<!doctype html><html><body style="margin:0;width:1920px;height:1080px;overflow:hidden;${transparent ? "background:transparent" : ""}">${html}</body></html>`);
    await p.screenshot({ path: path.join(OUT, file), omitBackground: !!transparent });
  };
  await shot(
    `<div style="position:absolute;inset:0;background:linear-gradient(160deg,#1a1219 0%,#241b22 45%,#3a2638 100%)"></div>
     <div style="position:absolute;left:-10%;top:-30%;width:70%;height:90%;border-radius:50%;background:#5b4bdb;filter:blur(160px);opacity:.45"></div>
     <div style="position:absolute;right:-12%;bottom:-35%;width:65%;height:85%;border-radius:50%;background:#f2a98a;filter:blur(170px);opacity:.38"></div>
     <div style="position:absolute;left:30%;bottom:-40%;width:50%;height:70%;border-radius:50%;background:#c9919a;filter:blur(160px);opacity:.25"></div>`,
    "bg.png",
  );
  await shot(`<div style="position:absolute;left:144px;top:62px;width:1632px;height:918px;border-radius:22px;box-shadow:0 40px 90px rgba(0,0,0,.55),0 8px 24px rgba(0,0,0,.35)"></div>`, "shadow.png", true);
  await p.setViewport({ width: 1632, height: 918, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:#000"><div style="width:1632px;height:918px;border-radius:22px;background:#fff"></div></body></html>`);
  await p.screenshot({ path: path.join(OUT, "mask.png") });
  await p.close();
}

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"] });
  await renderLayers(browser);

  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DPR });
  await page.evaluateOnNewDocument((x, y) => { window.__curStart = { x, y }; }, mx, my);
  await page.evaluateOnNewDocument(installOverlay);

  // Warm the live site (Vercel cold start) before recording.
  await page.goto(`${BASE}/ward`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector(".rf-patient", { timeout: 60000 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.mouse.move(mx, my);
  await sleep(300);

  const cdp = await page.target().createCDPSession();
  const frames = [];
  let busy = Promise.resolve();
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const i = frames.length;
    frames.push(metadata.timestamp);
    busy = busy.then(() => fs.promises.writeFile(path.join(FRAMES, `${String(i).padStart(6, "0")}.jpg`), Buffer.from(data, "base64")));
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  // Reload so the hero animation plays from the start while we are recording.
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  const t0 = now();

  const marks = [];
  // Each line of voice starts at its scene start, or later at cue(): after the action it describes is on screen.
  let voiceAt = 0;
  const cue = () => { voiceAt = now(); };
  const scene = async (id, fn) => {
    const start = now();
    voiceAt = start;
    const m = { id, start: start - t0, voice: durations[id] };
    marks.push(m);
    await fn(start);
    m.voiceStart = voiceAt - t0;
    const left = voiceAt + durations[id] + PAD - now();
    if (left > 0) await sleep(left * 1000);
  };
  const at = async (start, sec) => {
    const left = start + sec - now();
    if (left > 0) await sleep(left * 1000);
  };

  await scene("hero", async (s) => {
    await at(s, 1.0);
    await glide(page, VW * 0.66, VH * 0.42, 1100);
    await at(s, 2.9);
    await zoom(page, ".lp-card", 1.32, 1200);
    await at(s, 6.6);
    await glideTo(page, ".lp-nil", null, 900);
  });

  await scene("open", async (s) => {
    await zoom(page, null, 1, 900);
    await at(s, 1.4);
    await glideTo(page, ".lp-hero .lp-btn", "Open the demo ward", 1100);
    await at(s, 5.6);
    await aimPress(page, ".rf-patient", ".lp-hero .lp-btn", "Open the demo ward", 300);
  });

  await scene("graph", async (s) => {
    await at(s, 1.0);
    const g = await center(page, ".wd-glass");
    await zoom(page, { x: g.rect.x, y: g.rect.y, width: g.rect.width, height: Math.min(g.rect.height, 560) }, 1.18, 1200);
    await at(s, 6.4);
    await glideTo(page, ".rf-patient", null, 1000);
  });

  await scene("why", async (s) => {
    await at(s, 0.6);
    await zoom(page, ".rf-fact[aria-label*='ALLERGY']", 1.55, 1100);
    await glideTo(page, ".rf-fact", "ALLERGY", 800);
    await at(s, 4.6);
    await zoom(page, ".rf-fact[aria-label*='Augmentin 1.2g IV given']", 1.55, 1300);
    await glideTo(page, ".rf-fact", "Augmentin 1.2g IV given", 800);
    await at(s, 11.6);
    await zoom(page, ".rf-shared.red", 1.45, 1200);
    await glideTo(page, ".rf-shared.red", null, 700);
  });

  await scene("patient", async (s) => {
    await zoom(page, null, 1, 800);
    await sleep(350);
    await aim(page, ".rf-patient", null, 750);
    cue();
    await sleep(1100);
    await press(page, ".wd-lines .hit", ".rf-patient");
    await glide(page, VW * 0.78, VH * 0.3, 900);
    await sleep(600);
    await zoom(page, ".wd-lines", 1.22, 1200);
  });

  await scene("meds", async (s) => {
    await zoom(page, null, 1, 800);
    await sleep(200);
    await aimPress(page, ".rf-patient", ".wd-back", null, 600);
    await sleep(500);
    await aim(page, ".rf-fact", "Augmentin 1.2g IV given", 750);
    cue();
    await sleep(1000);
    await press(page, "tr.focus", ".rf-fact", "Augmentin 1.2g IV given");
    await glide(page, VW * 0.82, VH * 0.25, 700);
    await zoom(page, "tr.focus", 1.35, 1100);
  });

  await scene("leftout", async (s) => {
    await zoom(page, null, 1, 700);
    await glide(page, 38, VH * 0.3, 700);
    await sleep(450);
    await aimPress(page, ".wd-quote", ".wd-item", "Left out of handover", 450);
    await glide(page, VW * 0.66, VH * 0.62, 700);
    cue();
    await sleep(700);
    await zoom(page, ".wd-quote", 1.25, 1100);
  });

  await scene("how", async (s) => {
    await zoom(page, null, 1, 700);
    await glide(page, 38, VH * 0.45, 700);
    await sleep(450);
    await aimPress(page, "details summary", ".wd-item", "How it works", 450);
    await glide(page, VW * 0.6, VH * 0.5, 700);
    cue();
    await sleep(2200);
    await aimPress(page, "details[open]", "details summary", null, 700);
    await sleep(500);
    await zoom(page, ".wd-pre", 1.3, 1100);
  });

  await scene("close", async (s) => {
    await zoom(page, null, 1, 700);
    await aimPress(page, ".lp-card", ".wd-brand", null, 750);
    await sleep(400);
    cue();
    await glide(page, VW * 0.72, VH * 0.7, 1200);
    await sleep(800);
    await zoom(page, "#top", 1.06, 2400);
  });

  const end = now();
  await cdp.send("Page.stopScreencast");
  await busy;
  await browser.close();

  // ffconcat list using each frame's real on-screen time, clipped to the recording window.
  const ts = frames.map((t) => t - t0);
  let list = "ffconcat version 1.0\n";
  ts.forEach((t, i) => {
    const next = i + 1 < ts.length ? ts[i + 1] : end - t0;
    const d = Math.max(0.001, next - Math.max(0, t));
    if (next <= 0) return;
    list += `file 'frames/${String(i).padStart(6, "0")}.jpg'\nduration ${d.toFixed(4)}\n`;
  });
  list += `file 'frames/${String(ts.length - 1).padStart(6, "0")}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, "frames.txt"), list);
  fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify({ length: end - t0, scenes: marks, frames: frames.length }, null, 1));
  console.log(`recorded ${(end - t0).toFixed(1)}s, ${frames.length} frames`);
  for (const m of marks) console.log(m.id, m.start.toFixed(2), "voice", m.voice);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
