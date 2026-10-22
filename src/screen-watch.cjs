// DSH bridge: screen capture plus the host's HTTP RPC API. DeskDSH sends
// voice text (and optionally a screenshot) into a DSH conversation through
// POST /api/<method> instead of DOM automation. Screenshots live only in
// memory; DSH stores them as durable attachments like a manually uploaded
// image.

const { desktopCapturer, screen } = require('electron')
const { randomUUID } = require('node:crypto')

function makeDshRpc(origin) {
  return async function dshRpc(method, payload) {
    const response = await fetch(`${origin}/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: randomUUID(),
        method,
        payload,
      }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json()
    if (body?.result?.ok === true) return body.result.value
    const err = body?.result?.error
    throw new Error(err ? `${err.code}: ${err.message}` : 'unexpected RPC response')
  }
}

async function capturePrimaryScreen() {
  const display = screen.getPrimaryDisplay()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: display.size.width, height: display.size.height },
    fetchWindowIcons: false,
  })
  if (!sources.length) throw new Error('no screen source')
  const image = sources[0].thumbnail
  if (image.isEmpty()) throw new Error('empty capture')
  const jpeg = image.toJPEG(82)
  return { data: jpeg.toString('base64'), mediaType: 'image/jpeg' }
}

function createDshBridge(origin) {
  const rpc = makeDshRpc(origin)

  async function listSessions() {
    const value = await rpc('session.list', {})
    return value?.items ?? []
  }

  // Session title lives in the projection cache: projections.values.title
  function sessionTitle(s) {
    const v = s?.projections?.values
    return typeof v?.title === 'string' ? v.title : ''
  }

  function lastPromptAt(s) {
    return s?.projections?.values?.sessionListMetadata?.lastPromptAt
      ?? s?.updatedAt ?? 0
  }

  // Resolve the session DeskDSH should talk to:
  // explicit title (发送目标=指定会话) wins; otherwise the most recent session.
  async function resolveSessionId(preferredTitle) {
    const items = await listSessions()
    const usable = items.filter(s => s && s.blank !== true)
    if (preferredTitle) {
      const match = usable.find(s => sessionTitle(s) === preferredTitle)
        || usable.find(s => sessionTitle(s).includes(preferredTitle))
      if (match) return match.sessionId
    }
    const recent = usable.sort((a, b) => lastPromptAt(b) - lastPromptAt(a))[0]
    return recent ? recent.sessionId : undefined
  }

  async function sendPrompt(sessionId, text, image) {
    const content = []
    if (text) content.push({ type: 'text', text })
    if (image) content.push({ type: 'image', mediaType: image.mediaType, data: image.data, name: 'screenshot.jpg' })
    if (!content.length) throw new Error('nothing to send')
    return rpc('session.prompt', {
      sessionId,
      mode: 'queue',
      content,
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  }

  return { rpc, listSessions, resolveSessionId, sendPrompt, capturePrimaryScreen }
}

module.exports = { createDshBridge }
