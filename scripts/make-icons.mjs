// Generates placeholder application icons (PNG set, .icns, .ico) from a vector
// description using ImageMagick. Replace build/icon-source.svg with final artwork
// and re-run `npm run icons`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
const iconsetDir = join(buildDir, 'icon.iconset');
mkdirSync(iconsetDir, { recursive: true });

const svgPath = join(buildDir, 'icon-source.svg');
if (!existsSync(svgPath)) {
  // Restrained "ledger page with a tick" glyph on a macOS squircle.
  writeFileSync(
    svgPath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f6fed"/>
      <stop offset="1" stop-color="#1b4fc0"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
  <rect x="272" y="208" width="480" height="608" rx="40" fill="#ffffff" opacity="0.97"/>
  <rect x="336" y="300" width="352" height="34" rx="17" fill="#c9d4ea"/>
  <rect x="336" y="380" width="352" height="34" rx="17" fill="#c9d4ea"/>
  <rect x="336" y="460" width="240" height="34" rx="17" fill="#c9d4ea"/>
  <path d="M372 650 L470 748 L676 542" fill="none" stroke="#1f7a3a" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
  );
}

const sizes = [16, 32, 64, 128, 256, 512, 1024];
for (const size of sizes) {
  const out = join(iconsetDir, `icon_${size}x${size}.png`);
  execFileSync('convert', ['-background', 'none', '-density', '384', svgPath, '-resize', `${size}x${size}`, out]);
  if (size >= 32) {
    const retina = join(iconsetDir, `icon_${size / 2}x${size / 2}@2x.png`);
    execFileSync('cp', [out, retina]);
  }
}
execFileSync('cp', [join(iconsetDir, 'icon_512x512.png'), join(buildDir, 'icon.png')]);
execFileSync('cp', [join(iconsetDir, 'icon_1024x1024.png'), join(buildDir, 'icon@2x.png')]);

// .ico for Windows
execFileSync('convert', [
  ...[16, 32, 48, 64, 128, 256].map((s) => join(iconsetDir, s === 48 ? 'icon_64x64.png' : `icon_${s}x${s}.png`)),
  join(buildDir, 'icon.ico')
]);

// .icns for macOS: use iconutil when on macOS, otherwise the pure-JS packer below.
try {
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', join(buildDir, 'icon.icns')], { stdio: 'ignore' });
} catch {
  const { readFileSync } = await import('node:fs');
  // ICNS container: big-endian 'icns' header followed by PNG-encoded entries.
  const entries = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024]
  ];
  const chunks = [];
  for (const [type, size] of entries) {
    const png = readFileSync(join(iconsetDir, `icon_${size}x${size}.png`));
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(header, png);
  }
  const body = Buffer.concat(chunks);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write('icns', 0, 'ascii');
  fileHeader.writeUInt32BE(body.length + 8, 4);
  writeFileSync(join(buildDir, 'icon.icns'), Buffer.concat([fileHeader, body]));
}
console.log('Icons written to build/: icon.png, icon@2x.png, icon.ico, icon.icns');
