// Validates the exported site's GEO surface — run this after any change to
// lib/site.ts, lib/schema.ts, lib/metadata.ts or a page's metadata block.
//
// Checks: one JSON-LD graph per page, a
// self-consistent entity graph, a canonical on every indexable page, and no
// fabricated properties.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run after `pnpm build`, from anywhere:  node scripts/validate-geo.mjs
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'out')
// The expected canonical origin is READ FROM lib/site.ts, not hardcoded. This
// check previously hardcoded the apex; when SITE_URL is corrected the validator
// must follow it automatically, or it reports every page as broken (or worse,
// keeps passing a host that no longer matches the site).
const SITE_URL = /export const SITE_URL = '([^']+)'/.exec(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'site.ts'), 'utf8'),
)?.[1]
if (!SITE_URL) { console.error('validate-geo: could not read SITE_URL from lib/site.ts'); process.exit(1) }

const FABRICATED = ['telephone', 'streetAddress', 'aggregateRating', 'review', 'priceRange', 'numberOfEmployees', 'faxNumber']

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === '_next' ? [] : htmlFiles(p)
    return f.endsWith('.html') ? [p] : []
  })
}

let pages = 0, withLd = 0, problems = []
const orgIds = new Set(), types = new Map()

for (const file of htmlFiles(OUT)) {
  const rel = file.replace(OUT, '').replace(/index\.html$/, '') || '/'
  const html = readFileSync(file, 'utf8')
  if (rel.includes('404') || rel.includes('_not-found')) continue
  pages++

  const isNoindex = /name="robots"[^>]*content="[^"]*noindex/.test(html)
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1]
  if (!isNoindex && !canonical) problems.push(`${rel}: no canonical`)
  if (canonical && !canonical.startsWith(SITE_URL)) problems.push(`${rel}: canonical not on ${SITE_URL} — ${canonical}`)

  // og:image regressed silently once already: a page setting its own
  // openGraph REPLACES the layout's, dropping the image. Check every page.
  if (!isNoindex) {
    for (const tag of ['og:image', 'og:url', 'og:title', 'twitter:image']) {
      const re = new RegExp(`(property|name)="${tag}"`)
      if (!re.test(html)) problems.push(`${rel}: missing ${tag}`)
    }
    const ogUrl = /<meta property="og:url" content="([^"]+)"/.exec(html)?.[1]
    if (ogUrl && canonical && ogUrl !== canonical) problems.push(`${rel}: og:url ${ogUrl} != canonical ${canonical}`)
    const ogImg = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]
    if (ogImg && !ogImg.startsWith('https://')) problems.push(`${rel}: og:image not absolute (${ogImg})`)
  }

  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  if (isNoindex) continue
  if (blocks.length !== 1) { problems.push(`${rel}: ${blocks.length} JSON-LD blocks (want 1)`); continue }
  withLd++

  let data
  try { data = JSON.parse(blocks[0][1].replace(/\\u003c/g, '<')) }
  catch (e) { problems.push(`${rel}: JSON-LD does not parse — ${e.message}`); continue }

  const graph = data['@graph'] || []
  const ids = new Set(graph.map((n) => n['@id']).filter(Boolean))
  for (const n of graph) {
    const t = Array.isArray(n['@type']) ? n['@type'].join('+') : n['@type']
    types.set(t, (types.get(t) || 0) + 1)
  }
  const org = graph.find((n) => String(n['@id']).endsWith('#organization'))
  if (!org) problems.push(`${rel}: no Organization node`)
  else {
    orgIds.add(org['@id'])
    const blob = JSON.stringify(org)
    for (const f of FABRICATED) if (blob.includes(`"${f}"`)) problems.push(`${rel}: Organization asserts ${f}`)
  }

  // every internal @id reference must resolve to a node in the same graph
  const refs = []
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (v && typeof v === 'object') {
      const keys = Object.keys(v)
      if (keys.length === 1 && keys[0] === '@id') refs.push(v['@id'])
      else Object.values(v).forEach(walk)
    }
  }
  walk(graph)
  for (const r of new Set(refs)) if (!ids.has(r)) problems.push(`${rel}: dangling @id reference ${r}`)
}

console.log(`pages checked:        ${pages}`)
console.log(`pages with JSON-LD:   ${withLd}`)
console.log(`distinct Organization @id across the site: ${orgIds.size} ${orgIds.size === 1 ? '(correct — one entity)' : '(WRONG — should be 1)'}`)
console.log(`node types emitted:   ${[...types].map(([t, n]) => `${t}×${n}`).join(', ')}`)
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n` + problems.map((p) => '  - ' + p).join('\n') : '\nNo problems found.')
