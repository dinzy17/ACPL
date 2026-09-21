#!/usr/bin/env node
/**
 * Capture continuous WebGL VFX as a real H.264 MP4 (frame-clock driven).
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, 'output', 'xuv7xo_LIVE_transformer_vfx.mp4');
const ARTIFACT = '/opt/cursor/artifacts/xuv7xo_LIVE_transformer_vfx.mp4';
const FPS = 24;
const DURATION = 26;
const W = 1280, H = 720;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exit ${c}`))));
  });
}

async function main() {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/live_transform.html';
    const file = path.join(WEB, url);
    if (!file.startsWith(WEB) || !fs.existsSync(file)) {
      res.writeHead(404); res.end('missing'); return;
    }
    const ext = path.extname(file);
    const types = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(8765, '127.0.0.1', r));
  console.log('Serving http://127.0.0.1:8765');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  await page.goto('http://127.0.0.1:8765/live_transform.html?manual=1&hud=0', {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => window.__VFX_READY__ === true, null, { timeout: 15000 });

  const tmp = path.join(ROOT, 'output', '_frames');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const total = FPS * DURATION;
  console.log(`Capturing ${total} continuous frames @ ${FPS}fps…`);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    await page.evaluate((time) => window.__VFX_SET_TIME__(time), t);
    const buf = await page.screenshot({
      type: 'jpeg',
      quality: 92,
      clip: { x: 0, y: 0, width: W, height: H },
    });
    fs.writeFileSync(path.join(tmp, `f_${String(i).padStart(5, '0')}.jpg`), buf);
    if (i % 48 === 0) console.log(`  ${i}/${total} (t=${t.toFixed(2)}s)`);
  }
  console.log(`Capture done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await browser.close();
  server.close();

  console.log('Encoding H.264 MP4…');
  await run('ffmpeg', [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(tmp, 'f_%05d.jpg'),
    '-i', path.join(ROOT, 'audio', 'sfx_bed.wav'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'medium',
    '-crf', '17',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    OUT,
  ]);

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.copyFileSync(OUT, ARTIFACT);
  // Also copy a clearly named download alias
  fs.copyFileSync(OUT, '/opt/cursor/artifacts/REAL_VIDEO_xuv7xo_transformer.mp4');
  console.log('Wrote', OUT);
  console.log('Artifact', ARTIFACT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
