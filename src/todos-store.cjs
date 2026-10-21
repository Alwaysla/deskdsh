const { readFileSync, writeFileSync, renameSync, mkdirSync } = require('node:fs')
const { dirname } = require('node:path')
const { randomUUID } = require('node:crypto')

function sanitize(raw) {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    if (!item || typeof item.id !== 'string' || typeof item.text !== 'string') return []
    const text = item.text.trim().slice(0, 240)
    if (!text) return []
    return [{ id: item.id, text, completed: item.completed === true, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now() }]
  }).slice(0, 500)
}

function createTodoStore(filePath) {
  let items = []
  try { items = sanitize(JSON.parse(readFileSync(filePath, 'utf8'))) } catch {}
  function save() {
    mkdirSync(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp`
    writeFileSync(temporary, JSON.stringify(items, null, 2) + '\n', { mode: 0o600 })
    renameSync(temporary, filePath)
  }
  const snapshot = () => items.map(item => ({ ...item }))
  return {
    list: snapshot,
    add(text) {
      const clean = typeof text === 'string' ? text.trim().slice(0, 240) : ''
      if (!clean) return snapshot()
      items.unshift({ id: randomUUID(), text: clean, completed: false, createdAt: Date.now() })
      save(); return snapshot()
    },
    update(id, text) {
      const clean = typeof text === 'string' ? text.trim().slice(0, 240) : ''
      if (!clean) return snapshot()
      const item = items.find(entry => entry.id === id)
      if (item) { item.text = clean; save() }
      return snapshot()
    },
    toggle(id) {
      const item = items.find(entry => entry.id === id)
      if (item) { item.completed = !item.completed; save() }
      return snapshot()
    },
    remove(id) {
      const next = items.filter(entry => entry.id !== id)
      if (next.length !== items.length) { items = next; save() }
      return snapshot()
    },
  }
}

module.exports = { createTodoStore }
