const { readFileSync, writeFileSync, mkdirSync, renameSync } = require('node:fs')
const { dirname, join } = require('node:path')

const DEFAULTS = {
  voiceEnabled: false,
  inputDeviceId: 'default',
  loopbackEnabled: false,
  wakeWord: '小助手',
  wakeWordEnabled: false,
  meetingMode: false,
  voiceTarget: 'chat:current',
  voiceTargetSession: '',
}

function settingsPath(userDataDir) {
  return join(userDataDir, 'voice-settings.json')
}

function load(userDataDir) {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(userDataDir), 'utf8'))
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(userDataDir, settings) {
  const filePath = settingsPath(userDataDir)
  mkdirSync(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 })
  renameSync(tmp, filePath)
}

function createVoiceSettings(userDataDir) {
  let current = load(userDataDir)
  return {
    get: () => ({ ...current }),
    set(patch) {
      current = { ...current, ...patch }
      save(userDataDir, current)
      return { ...current }
    },
  }
}

module.exports = { createVoiceSettings }
