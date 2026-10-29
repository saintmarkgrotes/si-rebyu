import { mkdir, writeFile } from 'node:fs/promises'

// One vector source keeps the app icon, wordmark, and favicon consistent.
const destination = new URL('../public/brand/', import.meta.url)
const matcha = '#838f58'
const strawberry = '#f9d1d9'
const outline = '#586638'

const lamb = `
  <g stroke="${outline}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path fill="#fff8ec" d="M18 23C12 19 5 22 6 29c1 5 6 8 12 5m28-11c6-4 13-1 12 6-1 5-6 8-12 5"/>
    <path fill="${strawberry}" stroke="none" d="M15 26c-5-3-7 0-5 3 1 2 3 3 6 3zm34 0c5-3 7 0 5 3-1 2-3 3-6 3z"/>
    <path fill="#fff8ec" d="M16 29c-5 2-5 8-2 11-3 5 1 10 6 10 1 6 7 8 12 5 5 3 11 1 12-5 5 0 9-5 6-10 3-3 3-9-2-11z"/>
    <ellipse cx="32" cy="35" rx="17" ry="16" fill="#f5e8d6"/>
    <path fill="#fff8ec" d="M14 28c-5-4-2-12 4-12-1-6 7-10 11-6 4-5 12-2 12 3 7-2 12 5 8 10 3 5-2 10-7 8-4 4-10 3-12-1-5 4-11 2-11-2-2 2-4 2-5 0z"/>
    <g stroke="none" fill="#edb6c3">
      <ellipse cx="21" cy="40" rx="3.5" ry="2.2"/>
      <ellipse cx="43" cy="40" rx="3.5" ry="2.2"/>
    </g>
    <path fill="none" d="M21 36q3-4 6 0m10 0q3-4 6 0"/>
    <path fill="#d78d9f" stroke="none" d="M29 39c0-2 3-2 3 0 0-2 3-2 3 0 0 2-3 3-3 3s-3-1-3-3"/>
    <path fill="none" stroke-width="1.6" d="M32 42v1m-5 0q2 4 5 0 3 4 5 0"/>
  </g>`

const tulip = `
  <g stroke="${outline}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M48 59V48" fill="none" stroke-width="2"/>
    <path d="M48 56c-6 0-8-3-8-6 5 0 8 2 8 6zm0-2c6 0 8-3 8-6-5 0-8 2-8 6z" fill="${matcha}" stroke-width="1.3"/>
    <path d="M41 41v5c0 5 14 5 14 0v-5l-4 2-3-5-3 5z" fill="${strawberry}" stroke-width="1.6"/>
  </g>`

const svg = (title, width, height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
  <title id="title">${title}</title>${content}
</svg>
`

await mkdir(destination, { recursive: true })
const mark = svg('Simang, the si-rebyu lamb', 64, 64, lamb + tulip)
const icon = svg('si-rebyu app icon', 512, 512, `
  <rect width="512" height="512" rx="112" fill="${strawberry}"/>
  <g transform="translate(48 32) scale(6.5)">${lamb}${tulip}</g>`)
const favicon = svg('si-rebyu', 64, 64, `
  <rect width="64" height="64" rx="16" fill="${strawberry}"/>${lamb}`)
const logo = (color) => svg('si-rebyu — your study buddy', 280, 64, `${lamb}${tulip}
  <text x="78" y="43" fill="${color}" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-weight="700" font-size="38" letter-spacing="-1.5">si-rebyu</text>`)

await Promise.all([
  writeFile(new URL('simang-mark.svg', destination), mark),
  writeFile(new URL('app-icon.svg', destination), icon),
  writeFile(new URL('logo-light.svg', destination), logo(matcha)),
  writeFile(new URL('logo-dark.svg', destination), logo(strawberry)),
  writeFile(new URL('../favicon.svg', destination), favicon),
])
console.log('Generated Simang mark, app icon, light/dark logos, and favicon.')
