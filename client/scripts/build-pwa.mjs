import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')
const templatePath = path.join(root, 'pwa', 'sw-template.js')

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath]
  }))
  return nested.flat()
}

const files = (await filesUnder(dist))
  .filter(file => path.basename(file) !== 'sw.js' && !file.endsWith('.map'))
  .sort()
const urls = [...new Set([
  '/',
  ...files.map(file => `/${path.relative(dist, file).split(path.sep).join('/')}`),
])]

const hash = createHash('sha256')
for (const file of files) {
  hash.update(path.relative(dist, file))
  hash.update(await readFile(file))
}
const buildId = hash.digest('hex').slice(0, 16)
const template = await readFile(templatePath, 'utf8')
const output = template
  .replace('__BUILD_ID__', buildId)
  .replace('/*__PRECACHE_URLS__*/[]', JSON.stringify(urls, null, 2))

if (output.includes('__BUILD_ID__') || output.includes('__PRECACHE_URLS__')) {
  throw new Error('Service worker template placeholders were not fully replaced')
}
if (!urls.some(url => /^\/assets\/index-.*\.js$/.test(url))) {
  throw new Error('Compiled entry script is missing from the PWA precache list')
}

await writeFile(path.join(dist, 'sw.js'), output)
console.log(`Generated PWA service worker ${buildId} with ${urls.length} precached files.`)
