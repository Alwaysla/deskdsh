const enabledBox = document.querySelector('#voice-enabled')
const wakeBox = document.querySelector('#wake-word-enabled')
const wakeInput = document.querySelector('#wake-word')
const deviceSelect = document.querySelector('#input-device')
const modelStatus = document.querySelector('#model-status')
const downloadArea = document.querySelector('#download-area')
const downloadBtn = document.querySelector('#download-btn')
const progressBar = document.querySelector('#progress-bar')
const preview = document.querySelector('#preview')
const micBtn = document.querySelector('#mic-btn')
const selfTestBtn = document.querySelector('#self-test')
const meetingBtn = document.querySelector('#meeting-btn')
const meetingStatus = document.querySelector('#meeting-status')
const meetingText = document.querySelector('#meeting-text')
const sendToDsh = document.querySelector('#send-to-dsh')
const closeBtns = document.querySelectorAll('.close-btn')
const viewHome = document.querySelector('#view-home')
const viewSettings = document.querySelector('#view-settings')
const openSettingsBtn = document.querySelector('#open-settings')
const backBtn = document.querySelector('#back')
const targetSelect = document.querySelector('#voice-target')
const sessionPickRow = document.querySelector('#session-pick-row')
const targetSessionSelect = document.querySelector('#target-session')
const refreshTargetsBtn = document.querySelector('#refresh-targets')
const targetStatus = document.querySelector('#target-status')

let settings = {}
let listening = false
let meetingActive = false
let meetingTranscript = ''

async function init() {
  settings = await window.deskDshVoice.getSettings()
  enabledBox.checked = settings.voiceEnabled
  wakeBox.checked = settings.wakeWordEnabled
  wakeInput.value = settings.wakeWord || ''
  await refreshDevices()
  await refreshModelStatus()
  applyTargetUI()
}

function applyTargetUI() {
  targetSelect.value = settings.voiceTarget || 'chat:current'
  const specific = targetSelect.value === 'full:session'
  sessionPickRow.hidden = !specific
  if (specific) void loadTargetSessions()
}

async function loadTargetSessions() {
  targetStatus.textContent = '正在加载会话列表…'
  refreshTargetsBtn.disabled = true
  try {
    const sessions = await window.deskDshVoice.listTargets()
    targetSessionSelect.innerHTML = ''
    const current = sessions.find(s => s.current)
    for (const s of sessions) {
      const opt = document.createElement('option')
      opt.value = s.title
      opt.textContent = s.current ? `${s.title}（当前）` : s.title
      targetSessionSelect.append(opt)
    }
    if (sessions.length) {
      const saved = settings.voiceTargetSession || ''
      if (saved) targetSessionSelect.value = saved
      if (!targetSessionSelect.value) targetSessionSelect.value = sessions[0].title
      targetStatus.textContent = `共 ${sessions.length} 个会话${current ? `，当前打开「${current.title}」` : ''}`
    } else {
      targetStatus.textContent = '未找到会话（DSH 未连接或无历史会话）'
    }
  } catch {
    targetStatus.textContent = '加载会话列表失败'
  } finally {
    refreshTargetsBtn.disabled = false
  }
}

targetSelect.addEventListener('change', () => {
  settings.voiceTarget = targetSelect.value
  window.deskDshVoice.setSettings({ voiceTarget: targetSelect.value })
  applyTargetUI()
})
targetSessionSelect.addEventListener('change', () => {
  settings.voiceTargetSession = targetSessionSelect.value
  window.deskDshVoice.setSettings({ voiceTargetSession: targetSessionSelect.value })
})
refreshTargetsBtn.addEventListener('click', () => void loadTargetSessions())

async function refreshDevices() {
  const devices = await window.deskDshVoice.listDevices()
  deviceSelect.innerHTML = '<option value="default">系统默认</option>'
  for (const d of devices) {
    const opt = document.createElement('option')
    opt.value = d.deviceId
    opt.textContent = d.label || `设备 ${d.deviceId.slice(0, 8)}`
    deviceSelect.append(opt)
  }
  deviceSelect.value = settings.inputDeviceId || 'default'
}

async function refreshModelStatus() {
  const ready = await window.deskDshVoice.getSettings().then(s => s.modelReady)
  if (ready) {
    modelStatus.textContent = '✅ 模型已就绪'
    downloadArea.hidden = true
  } else {
    modelStatus.textContent = '⚠️ 需要下载模型 (~230MB)'
    downloadArea.hidden = false
  }
}

enabledBox.addEventListener('change', () => {
  settings.voiceEnabled = enabledBox.checked
  window.deskDshVoice.setSettings({ voiceEnabled: enabledBox.checked })
})
wakeBox.addEventListener('change', () => {
  settings.wakeWordEnabled = wakeBox.checked
  window.deskDshVoice.setSettings({ wakeWordEnabled: wakeBox.checked })
})
wakeInput.addEventListener('change', () => {
  const w = wakeInput.value.trim()
  settings.wakeWord = w || '小助手'
  window.deskDshVoice.setSettings({ wakeWord: settings.wakeWord })
})
deviceSelect.addEventListener('change', () => {
  settings.inputDeviceId = deviceSelect.value
  window.deskDshVoice.setSettings({ inputDeviceId: deviceSelect.value })
})
downloadBtn.addEventListener('click', () => {
  downloadBtn.disabled = true
  downloadBtn.textContent = '下载中…'
  window.deskDshVoice.downloadModel()
})
window.deskDshVoice.onDownloadProgress(pct => {
  if (pct >= 0) progressBar.style.width = `${pct}%`
  if (pct >= 100) {
    downloadBtn.textContent = '下载完成'
    modelStatus.textContent = '✅ 模型已就绪'
    setTimeout(() => { downloadArea.hidden = true }, 1500)
  }
})

micBtn.addEventListener('click', async () => {
  if (listening) {
    window._voiceCapture.stopCapture()
    listening = false
    micBtn.classList.remove('recording')
    micBtn.textContent = '🎤 开始说话'
    preview.textContent = '已停止'
    window.deskDshVoice.toggleListening()
  } else {
    const ok = await window._voiceCapture.startCapture(settings.inputDeviceId)
    if (ok) {
      listening = true
      micBtn.classList.add('recording')
      micBtn.textContent = '⏹ 停止'
      preview.textContent = '正在聆听…'
      window.deskDshVoice.toggleListening()
    } else {
      preview.textContent = '⚠️ 麦克风不可用，请检查权限和设备'
    }
  }
})

selfTestBtn.addEventListener('click', async () => {
  preview.textContent = '正在用内置音频测试识别…'
  selfTestBtn.disabled = true
  try {
    const result = await window.deskDshVoice.selfTest()
    preview.textContent = result.ok
      ? `✅ 识别链路正常，测试结果：「${result.text}」`
      : `❌ 识别失败：${result.error}`
  } finally {
    selfTestBtn.disabled = false
  }
})

function renderMeetingTranscript() {
  meetingText.textContent = meetingTranscript
  meetingText.hidden = !meetingTranscript.trim()
  meetingText.scrollTop = meetingText.scrollHeight
  sendToDsh.disabled = !meetingTranscript.trim()
}

meetingBtn.addEventListener('click', async () => {
  if (meetingActive) {
    // Stop loopback capture; final decode arrives via transcript event
    window._voiceCapture.stopCapture()
    meetingActive = false
    meetingBtn.classList.remove('recording')
    meetingBtn.textContent = '📋 开始记录'
    meetingStatus.textContent = '正在识别最后一段…'
    await window.deskDshVoice.stopMeeting()
    await window.deskDshVoice.loopbackStop()
  } else {
    // Create the PipeWire virtual loopback source, give it a moment to appear
    const started = await window.deskDshVoice.loopbackStart()
    if (started) await new Promise(r => setTimeout(r, 900))
    const result = await window._voiceCapture.startLoopbackCapture()
    if (!result.ok) {
      await window.deskDshVoice.loopbackStop()
      meetingStatus.textContent = result.error === 'no-monitor'
        ? '⚠️ 找不到内录设备（Monitor / DeskDSH-Loopback）'
        : `⚠️ 无法开始内录：${result.error}`
      return
    }
    meetingActive = true
    meetingTranscript = ''
    renderMeetingTranscript()
    meetingBtn.classList.add('recording')
    meetingBtn.textContent = '⏹ 结束记录'
    meetingStatus.textContent = '🔴 正在记录电脑声音…'
    window.deskDshVoice.startMeeting()
  }
})

sendToDsh.addEventListener('click', () => {
  if (!meetingTranscript.trim()) return
  window.deskDshVoice.sendToDsh?.(meetingTranscript)
})

window.deskDshVoice.onTranscript(data => {
  if (data.kind === 'meeting') {
    meetingTranscript += (meetingTranscript ? '\n' : '') + data.text
    renderMeetingTranscript()
    if (!meetingActive) meetingStatus.textContent = `已结束 · 共 ${meetingTranscript.length} 字`
  } else {
    preview.textContent = data.text
  }
})
window.deskDshVoice.onState(data => {
  if (data.listening !== undefined) {
    listening = data.listening
    micBtn.classList.toggle('recording', listening)
    micBtn.textContent = listening ? '⏹ 停止' : '🎤 开始说话'
  }
})

for (const btn of closeBtns) btn.addEventListener('click', () => void window.deskDshVoice.close())
openSettingsBtn.addEventListener('click', () => { viewHome.hidden = true; viewSettings.hidden = false })
backBtn.addEventListener('click', () => { viewSettings.hidden = true; viewHome.hidden = false })
init()
