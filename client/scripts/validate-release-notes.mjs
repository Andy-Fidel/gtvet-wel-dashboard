import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const releases = JSON.parse(await readFile(new URL('../src/data/releases.json', import.meta.url), 'utf8'))
const roles = new Set(['SuperAdmin', 'HQManager', 'HQStaff', 'RegionalAdmin', 'Admin', 'Manager', 'Staff', 'IndustryPartner', 'Guardian'])
const ids = new Set()
const nonempty = value => typeof value === 'string' && value.trim().length > 0
assert.ok(Array.isArray(releases) && releases.length, 'Add at least one release')
for (const [index, release] of releases.entries()) {
  assert.match(release.id, /^[a-z0-9-]+$/, 'Release IDs must be stable lowercase slugs')
  assert.ok(!ids.has(release.id), `Duplicate release ID: ${release.id}`)
  ids.add(release.id)
  assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD release dates')
  assert.equal(new Date(`${release.date}T12:00:00Z`).toISOString().slice(0, 10), release.date, 'Use a real calendar date')
  if (index) assert.ok(releases[index - 1].date >= release.date, 'Keep releases newest first')
  assert.ok(nonempty(release.title) && nonempty(release.summary), `Explain release ${release.id}`)
  assert.ok(Array.isArray(release.changes) && release.changes.length, `Add changes to ${release.id}`)
  const titles = new Set()
  for (const change of release.changes) {
    assert.ok(['New', 'Improved', 'Fixed'].includes(change.kind), 'Use New, Improved or Fixed')
    assert.ok(nonempty(change.title) && nonempty(change.body) && nonempty(change.audience), 'Explain what changed and who it helps')
    assert.ok(!titles.has(change.title), 'Change titles must be unique within a release')
    titles.add(change.title)
    if (change.roles) assert.ok(Array.isArray(change.roles) && change.roles.length && change.roles.every(role => roles.has(role)), 'Use valid audience roles')
    if (change.action) {
      assert.ok(nonempty(change.action.label), 'Give each action a readable label')
      assert.match(change.action.path, /^\/[a-z0-9][a-z0-9/-]*$/, 'Actions must link to an internal portal page')
    }
  }
}
console.log(`Validated ${releases.length} releases; latest: ${releases[0].id}`)
