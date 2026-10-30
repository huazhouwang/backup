// Renders public/icons/icon.svg to the PNG sizes needed by the manifest and iOS.
// Run manually after changing the SVG: `node scripts/render-icons.mjs` (needs Playwright).
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const dir = fileURLToPath(new URL('../public/icons/', import.meta.url))
const svg = await readFile(dir + 'icon.svg', 'utf8')

// Maskable icons need the artwork inside the central 80% safe zone on a full-bleed background.
const maskable = svg
  .replace(
    '<rect width="512" height="512" rx="112" fill="#2b3a67"/>',
    '<rect width="512" height="512" fill="#2b3a67"/><g transform="translate(51.2 51.2) scale(.8)">',
  )
  .replace('</svg>', '</g></svg>')

// The lock screen's Now Playing shows artwork as a square and fills transparency with white.
const cover = svg.replace('rx="112" ', '')

const targets = [
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-512.png', size: 512, source: svg },
  { file: 'icon-maskable-512.png', size: 512, source: maskable },
  // iOS applies its own rounded mask and ignores transparency, so use the full-bleed variant.
  { file: 'apple-touch-icon.png', size: 180, source: maskable },
  { file: 'cover-512.png', size: 512, source: cover },
]

// One page renders the icons one after another on purpose.
/* oxlint-disable no-await-in-loop */
const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, source } of targets) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${source}`,
  )
  await writeFile(dir + file, await page.screenshot({ omitBackground: true }))
}
await browser.close()
