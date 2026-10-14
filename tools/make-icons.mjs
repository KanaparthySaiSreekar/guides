// Renders the apps' home-screen / manifest icons to PNGs with headless Chrome.  node tools/make-icons.mjs [icon portal pca]
import fs from 'node:fs';
import { P } from './lib.mjs';
import { launch } from './cdp.mjs';

// Drafting-table palette: navy ink ground, a cyanotype-blue card behind a vellum card with an amber highlighter stroke.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" fill="#15233A"/>
  <g stroke="rgba(127,176,255,.10)" stroke-width="2">${Array.from({ length: 15 }, (_, i) => `<path d="M${32 + i * 32} 0V512M0 ${32 + i * 32}H512"/>`).join('')}</g>
  <rect x="118" y="112" width="260" height="310" rx="30" fill="#2F5FD0" transform="rotate(-9 248 267)"/>
  <rect x="140" y="104" width="260" height="310" rx="30" fill="#F3F6FB"/>
  <rect x="176" y="168" width="150" height="22" rx="11" fill="#15233A"/>
  <rect x="176" y="222" width="188" height="14" rx="7" fill="#9AA8BF"/>
  <rect x="176" y="256" width="170" height="14" rx="7" fill="#9AA8BF"/>
  <rect x="168" y="290" width="150" height="26" rx="6" fill="#FFE9A8"/>
  <rect x="176" y="296" width="134" height="14" rx="7" fill="#E3A92E"/>
  <path d="M300 358l24 24 44-52" fill="none" stroke="#15704A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
// Study Portal: the same ground with a blueprint sheet charting the seven domain weights (17/13/19/16/14/14/7).
const W = [17, 13, 19, 16, 14, 14, 7], HUES = ['#2F6BD6', '#0E958A', '#7852D2', '#C98410', '#CF4858', '#3D944A', '#687790'];
const portal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" fill="#15233A"/>
  <g stroke="rgba(127,176,255,.10)" stroke-width="2">${Array.from({ length: 15 }, (_, i) => `<path d="M${32 + i * 32} 0V512M0 ${32 + i * 32}H512"/>`).join('')}</g>
  <rect x="104" y="96" width="304" height="320" rx="30" fill="#F3F6FB"/>
  <rect x="104" y="96" width="304" height="64" rx="30" fill="#2F5FD0"/><rect x="104" y="130" width="304" height="30" fill="#2F5FD0"/>
  <rect x="136" y="118" width="120" height="20" rx="10" fill="#F3F6FB"/>
  ${W.map((w, i) => `<rect x="140" y="${184 + i * 30}" width="${Math.round(w / 19 * 220)}" height="18" rx="9" fill="${HUES[i]}"/>`).join('')}
</svg>`;
// GCP-PCA Field Guide: the same ground with a vellum sheet holding a small architecture diagram (a cloud feeding three
// services), in the guide's own blue and amber.
const pca = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" fill="#15233A"/>
  <g stroke="rgba(127,176,255,.10)" stroke-width="2">${Array.from({ length: 15 }, (_, i) => `<path d="M${32 + i * 32} 0V512M0 ${32 + i * 32}H512"/>`).join('')}</g>
  <rect x="104" y="96" width="304" height="320" rx="30" fill="#F3F6FB"/>
  <g fill="#1D4FBF"><circle cx="222" cy="186" r="30"/><circle cx="262" cy="166" r="40"/><circle cx="300" cy="190" r="28"/><rect x="192" y="186" width="136" height="32" rx="16"/></g>
  <path d="M260 218V256M168 256H352M168 256V286M260 256V286M352 256V286" fill="none" stroke="#9AA8BF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="138" y="286" width="60" height="60" rx="12" fill="#E2EAFA" stroke="#1D4FBF" stroke-width="8"/>
  <rect x="230" y="286" width="60" height="60" rx="12" fill="#FBEEDB" stroke="#B86A10" stroke-width="8"/>
  <rect x="322" y="286" width="60" height="60" rx="12" fill="#E2EAFA" stroke="#1D4FBF" stroke-width="8"/>
</svg>`;
const ICONS = { icon: [svg, 'guides/ccarp/icons/flashcards'], portal: [portal, 'guides/ccarp/icons/portal'], pca: [pca, 'guides/gcp-pca/icons/portal'] };
const pick = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ICONS);
for (const name of pick) { if (!ICONS[name]) throw new Error(`unknown icon ${name}`); fs.mkdirSync(P(ICONS[name][1], '..'), { recursive: true }); fs.writeFileSync(P(`${ICONS[name][1]}.svg`), ICONS[name][0]); }
const b = await launch({ port: 9360 });
for (const name of pick) for (const size of [180, 192, 512]) {
  const [art, out] = ICONS[name];
  await b.viewport(size, size, false);
  await b.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(`<style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}</style>${art}`) });
  await b.sleep(400);
  await b.shot(P(`${out}-${size}.png`));
  console.log(`${name}-${size}.png`);
}
b.close();
