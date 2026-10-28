#!/usr/bin/env node
// Assemble the public Pages site using an explicit asset allowlist.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  output: { type: 'string' },
  releases: { type: 'string' },
} });
if (!values.output) throw new Error('Required option: --output <new directory>');
const out = resolve(values.output);
const site = join(out, 'peligames');
if (existsSync(out)) throw new Error('Choose a new output directory; existing files will not be overwritten.');

let release = null;
if (values.releases) {
  const data = JSON.parse(readFileSync(values.releases, 'utf8'));
  const releases = Array.isArray(data[0]) ? data.flat() : data;
  const candidates = releases.filter(item => !item.draft && item.published_at);
  if (!candidates.length) throw new Error('No public releases found.');
  const latest = candidates.reduce((a, b) => a.published_at > b.published_at ? a : b);
  release = { tag: latest.tag_name, url: latest.html_url, prerelease: latest.prerelease, assets: {} };
  for (const asset of latest.assets) {
    const name = asset.name;
    const kind = name.toLowerCase().endsWith('.appimage') && name.includes('x86_64') ? 'appimage'
      : name.endsWith('_amd64.deb') ? 'deb' : name.endsWith('.x86_64.rpm') ? 'rpm' : null;
    if (kind) release.assets[kind] = { url: asset.browser_download_url, size: asset.size };
  }
  if (!['appimage', 'deb', 'rpm'].every(kind => release.assets[kind])) {
    throw new Error('The newest public release is missing a Linux package; publish all packages before deploying.');
  }
}
const assets = {
  "peligames/assets/peligames.svg": "peligames.svg",
  "peligames/assets/Jersey10-Regular.ttf": "Jersey10-Regular.ttf",
  "peligames/assets/Jersey10-OFL.txt": "Jersey10-OFL.txt",
  "peligames/assets/Oxanium-Variable.ttf": "Oxanium-Variable.ttf",
  "peligames/assets/Oxanium-OFL.txt": "Oxanium-OFL.txt",
  "peligames/assets/lutris.svg": "lutris.svg",
  "peligames/assets/faugus.svg": "faugus.svg",
  "peligames/assets/Faugus-Assets-LICENSE.txt": "Faugus-Assets-LICENSE.txt",
  "peligames/assets/Lutris-LICENSE.txt": "Lutris-LICENSE.txt",
  "peligames/assets/library.jpg": "library.jpg",
  "peligames/assets/game-details.jpg": "game-details.jpg",
  "peligames/assets/nexus.jpg": "nexus.jpg",
  "peligames/assets/dlssnr.jpg": "dlssnr.jpg",
  "peligames/assets/monitoring.jpg": "monitoring.jpg",
  "peligames/assets/themes.jpg": "themes.jpg"
};
for (const source of Object.keys(assets)) {
  if (!statSync(join(root, source)).isFile()) throw new Error(`Missing public asset: ${source}`);
}
mkdirSync(dirname(out), { recursive: true });
mkdirSync(out); // Exclusive creation: never write over an existing output directory.
mkdirSync(site);
mkdirSync(join(site, 'assets'));
copyFileSync(join(root, 'index.html'), join(out, 'index.html'));
for (const name of ['index.html', 'style.css', 'app.js', 'credits.html']) {
  copyFileSync(join(root, 'peligames', name), join(site, name));
}
for (const [source, name] of Object.entries(assets)) {
  copyFileSync(join(root, source), join(site, 'assets', name));
}
writeFileSync(join(out, '.nojekyll'), '');
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
})[char]);
if (release) {
  // Keep the generated HTML current even when JavaScript is unavailable.
  let html = readFileSync(join(site, 'index.html'), 'utf8');
  const label = escape(release.tag + (release.prerelease ? ' experimental' : ''));
  html = html.replace(/(<span data-release-label>)[^<]+/g, (_, prefix) => prefix + label);
  html = html.replaceAll('https://github.com/pelicanux/PeliGames/releases/tag/v0.5.1', escape(release.url));
  for (const [kind, asset] of Object.entries(release.assets)) {
    html = html.replace(new RegExp(`(data-download="${kind}" href=")[^"]+`, 'g'), (_, prefix) => prefix + escape(asset.url));
    html = html.replace(new RegExp(`(data-size="${kind}">)[^<]+`, 'g'), (_, prefix) => `${prefix}${Math.ceil(asset.size / 1048576)} MB`);
  }
  writeFileSync(join(site, 'index.html'), html);
}
writeFileSync(join(site, 'release.json'), JSON.stringify(release ?? {}) + '\n');
function size(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((total, item) => {
    const path = join(directory, item.name);
    return total + (item.isDirectory() ? size(path) : statSync(path).size);
  }, 0);
}
console.log(`Public site: ${out} (${(size(out) / 1048576).toFixed(2)} MiB)`);
