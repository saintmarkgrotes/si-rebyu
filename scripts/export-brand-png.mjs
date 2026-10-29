import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Rasterize our SVG source in an isolated headless Chromium profile.
// Usage: node scripts/export-brand-png.mjs <path-to-chrome-or-chromium>
const browser = process.argv[2]
if (!browser) throw new Error('Pass the path to a Chrome or Chromium executable.')
const publicDir = new URL('../public/', import.meta.url)
const icon = await readFile(new URL('brand/app-icon.svg', publicDir), 'utf8')
const favicon = await readFile(new URL('favicon.svg', publicDir), 'utf8')
const exports = [
  { file: 'brand/app-icon-512.png', size: 512, source: icon },
  { file: 'brand/app-icon-192.png', size: 192, source: icon },
  { file: 'apple-touch-icon.png', size: 180, source: icon, opaque: true },
  { file: 'favicon-32.png', size: 32, source: favicon },
  { file: 'favicon-16.png', size: 16, source: favicon },
]
const temporaryDir = await mkdtemp(join(tmpdir(), 'si-rebyu-brand-'))
const page = join(temporaryDir, 'export.html')
await writeFile(page, `<!doctype html><html><body><pre id="exports"></pre><script>
  Promise.all(${JSON.stringify(exports)}.map(async ({file, size, source, opaque}) => {
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (opaque) { context.fillStyle = '#f9d1d9'; context.fillRect(0, 0, size, size); }
    context.drawImage(image, 0, 0, size, size);
    return {file, data: canvas.toDataURL('image/png').split(',')[1]};
  })).then(result => { document.querySelector('#exports').textContent = JSON.stringify(result); });
</script></body></html>`)
const result = spawnSync(browser, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${join(temporaryDir, 'profile')}`, '--virtual-time-budget=3000',
  '--dump-dom', pathToFileURL(page).href,
], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true })
if (result.error || result.status !== 0) throw result.error || new Error('Browser export failed.')
const payload = result.stdout.match(/<pre id="exports">(.*?)<\/pre>/s)?.[1]
if (!payload) throw new Error('Browser did not finish rendering the icons.')
for (const { file, data } of JSON.parse(payload)) {
  await writeFile(new URL(file, publicDir), Buffer.from(data, 'base64'))
}

// ICO supports embedded PNG images, retaining the exact exported artwork.
const images = await Promise.all([16, 32].map(async (size) => ({
  size, data: await readFile(new URL(`favicon-${size}.png`, publicDir)),
})))
const header = Buffer.alloc(6 + 16 * images.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
let offset = header.length
images.forEach(({ size, data }, index) => {
  const entry = 6 + 16 * index
  header[entry] = header[entry + 1] = size
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(data.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += data.length
})
await writeFile(new URL('favicon.ico', publicDir), Buffer.concat([header, ...images.map(({ data }) => data)]))
console.log('Exported 512px, 192px, and Apple icons, plus 16px/32px PNG and ICO favicons.')
