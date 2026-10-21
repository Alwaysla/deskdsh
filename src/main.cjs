const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage } = require('electron')
const { join } = require('node:path')
const { readFileSync, writeFileSync } = require('node:fs')
const { execFile, spawn } = require('node:child_process')
const http = require('node:http')
const { createTodoStore } = require('./todos-store.cjs')
const { createAsrEngine, downloadModel, modelReady, modelPath } = require('./asr-engine.cjs')
const { createVoiceSettings } = require('./voice-settings-store.cjs')

function configuredDshUrl() {
  let parsed
  try {
    parsed = new URL(process.env.DSH_URL || 'http://127.0.0.1:3080/')
  } catch {
    throw new Error('DSH_URL 必须是有效 URL')
  }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') {
    throw new Error('为保护本机 DSH，DSH_URL 仅允许 http://127.0.0.1[:port]/')
  }
  parsed.pathname = '/'
  parsed.search = ''
  parsed.hash = ''
  return parsed.href
}

const DSH_URL = configuredDshUrl()
const DSH_ORIGIN = new URL(DSH_URL).origin
const PET_SIZE = { width: 240, height: 240 }
const CHAT_SIZE = { width: 480, height: 700 }
const TODO_SIZE = { width: 360, height: 480 }
const APP_ICON = join(__dirname, '..', 'assets', 'deskdsh.png')
const MODELS_BASE = join(__dirname, '..', 'models')

let petWindow
let chatWindow
let todoWindow
let voiceWindow
let fullWindow
let tray
let todoStore
let asrEngine
let voiceSettings
let voiceListening = false
let meetingActive = false
let meetingTranscript = []
let online = false
let quitting = false
const loadTokens = new WeakMap()
let savePositionTimer
let rebuildTrayMenu = () => {}

function statePath() {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadSavedPetBounds() {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8'))
    if (![parsed.x, parsed.y].every(Number.isFinite)) return undefined
    return { x: parsed.x, y: parsed.y, ...PET_SIZE }
  } catch {
    return undefined
  }
}

function isVisibleBounds(bounds) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapWidth = Math.max(0, Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x))
    const overlapHeight = Math.max(0, Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y))
    return overlapWidth >= 80 && overlapHeight >= 80
  })
}

function savePetBounds() {
  if (!petWindow || petWindow.isDestroyed()) return
  const { x, y } = petWindow.getBounds()
  try { writeFileSync(statePath(), JSON.stringify({ x, y }) + '\n') } catch {}
}

function schedulePetBoundsSave() {
  clearTimeout(savePositionTimer)
  savePositionTimer = setTimeout(savePetBounds, 250)
}

function webPreferences(preload) {
  return {
    preload: join(__dirname, preload),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  }
}

function availablePetBounds() {
  const display = screen.getPrimaryDisplay()
  return {
    x: display.workArea.x + display.workArea.width - PET_SIZE.width - 24,
    y: display.workArea.y + display.workArea.height - PET_SIZE.height - 24,
    ...PET_SIZE,
  }
}

function x11WindowId(window) {
  const handle = window.getNativeWindowHandle()
  const numericId = handle.length >= 8 && process.arch === 'x64'
    ? Number(handle.readBigUInt64LE(0) & 0xffffffffn)
    : handle.readUInt32LE(0)
  return `0x${numericId.toString(16)}`
}

function pinWindowToAllX11Workspaces(window) {
  if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE !== 'x11') return
  const nativeId = x11WindowId(window)
  // Electron asks the WM for all-workspace visibility. On GNOME/Mutter,
  // xdotool's explicit 0xffffffff desktop assignment reliably adds both the
  // EWMH sticky state and the all-desktops marker; wmctrl then reinforces the
  // above state. Both commands require the native XID in hexadecimal form.
  execFile('xdotool', ['set_desktop_for_window', nativeId, '4294967295'], (desktopError) => {
    if (desktopError) console.warn(`[DeskDSH] 无法将窗口移至所有工作区 (${nativeId}):`, desktopError.message)
    execFile('wmctrl', ['-i', '-r', nativeId, '-b', 'add,sticky,above'], (stateError) => {
      if (stateError) console.warn(`[DeskDSH] 无法设置窗口 sticky 状态 (${nativeId}):`, stateError.message)
    })
  })
}

function createPetWindow() {
  const savedBounds = loadSavedPetBounds()
  const initialBounds = savedBounds && isVisibleBounds(savedBounds) ? savedBounds : availablePetBounds()
  petWindow = new BrowserWindow({
    ...initialBounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: APP_ICON,
    webPreferences: webPreferences('pet-preload.cjs'),
  })
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  petWindow.loadFile(join(__dirname, 'pet.html'))
  petWindow.once('ready-to-show', () => {
    petWindow?.showInactive()
    setTimeout(() => { if (petWindow && !petWindow.isDestroyed()) pinWindowToAllX11Workspaces(petWindow) }, 250)
  })
  petWindow.on('move', () => {
    positionChat()
    positionTodo()
    schedulePetBoundsSave()
  })
  petWindow.on('close', () => {
    if (!quitting) app.quit()
  })
}

function placeNearPet(size) {
  const pet = petWindow?.getBounds() || availablePetBounds()
  const display = screen.getDisplayMatching(pet)
  const area = display.workArea
  const gap = 10
  let x = pet.x - size.width - gap
  if (x < area.x) x = pet.x + pet.width + gap
  x = Math.max(area.x, Math.min(x, area.x + area.width - size.width))
  let y = pet.y + pet.height - size.height
  y = Math.max(area.y, Math.min(y, area.y + area.height - size.height))
  return { x, y, ...size }
}

function positionChat() {
  if (!chatWindow || chatWindow.isDestroyed()) return
  chatWindow.setBounds(placeNearPet(CHAT_SIZE), false)
}

function positionTodo() {
  if (!todoWindow || todoWindow.isDestroyed()) return
  todoWindow.setBounds(placeNearPet(TODO_SIZE), false)
}

function createTodoWindow() {
  if (todoWindow && !todoWindow.isDestroyed()) return todoWindow
  todoWindow = new BrowserWindow({
    ...placeNearPet(TODO_SIZE),
    frame: false,
    transparent: true,
    title: 'DeskDSH 待办',
    show: false,
    resizable: true,
    minWidth: 310,
    minHeight: 360,
    maxWidth: 520,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: APP_ICON,
    webPreferences: webPreferences('todo-preload.cjs'),
  })
  todoWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  todoWindow.loadFile(join(__dirname, 'todo.html'))
  todoWindow.once('ready-to-show', () => pinWindowToAllX11Workspaces(todoWindow))
  todoWindow.on('close', event => {
    if (quitting) return
    event.preventDefault()
    todoWindow.hide()
    publishState()
  })
  return todoWindow
}

function toggleTodo() {
  const window = createTodoWindow()
  if (window.isVisible()) window.hide()
  else {
    positionTodo()
    window.show()
    window.focus()
    pinWindowToAllX11Workspaces(window)
  }
  publishState()
}

function publishTodos(items = todoStore?.list() ?? []) {
  if (todoWindow && !todoWindow.isDestroyed()) todoWindow.webContents.send('todo:changed', items)
  publishState()
  rebuildTrayMenu()
  return items
}

function secureDshWindow(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.origin === DSH_ORIGIN) {
        window.loadURL(url)
      } else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        void shell.openExternal(url)
      }
    } catch {}
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin === DSH_ORIGIN) return
    } catch {}
    event.preventDefault()
  })
}

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) return chatWindow
  chatWindow = new BrowserWindow({
    ...placeNearPet(CHAT_SIZE),
    frame: false,
    title: 'DeskDSH 对话',
    show: false,
    resizable: true,
    minWidth: 380,
    minHeight: 500,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#f7f8fc',
    icon: APP_ICON,
    webPreferences: webPreferences('dsh-preload.cjs'),
  })
  chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  secureDshWindow(chatWindow)
  chatWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    chatWindow.hide()
    publishState()
  })
  return chatWindow
}

function createFullWindow() {
  if (fullWindow && !fullWindow.isDestroyed()) return fullWindow
  fullWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    title: 'DeskDSH',
    show: false,
    backgroundColor: '#f7f8fc',
    icon: APP_ICON,
    webPreferences: webPreferences('dsh-preload.cjs'),
  })
  secureDshWindow(fullWindow)
  fullWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    fullWindow.hide()
  })
  return fullWindow
}

function pingDsh(timeout = 1600) {
  return new Promise((resolve) => {
    const request = http.get(DSH_URL, { timeout }, (response) => {
      response.resume()
      resolve(response.statusCode >= 200 && response.statusCode < 500)
    })
    request.once('timeout', () => request.destroy())
    request.once('error', () => resolve(false))
  })
}

async function refreshOnline() {
  online = await pingDsh()
  publishState()
  rebuildTrayMenu()
  return online
}

function publishState() {
  const todos = todoStore?.list() ?? []
  const state = {
    online,
    chatVisible: Boolean(chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()),
    todoVisible: Boolean(todoWindow && !todoWindow.isDestroyed() && todoWindow.isVisible()),
    todoRemaining: todos.filter(item => !item.completed).length,
  }
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:state', state)
  return state
}

async function loadDsh(window) {
  const token = Symbol('load')
  loadTokens.set(window, token)
  const found = await refreshOnline()
  if (window.isDestroyed() || loadTokens.get(window) !== token) return false
  try {
    if (found) await window.loadURL(DSH_URL)
    else await window.loadFile(join(__dirname, 'offline.html'))
    return found
  } catch {
    if (!window.isDestroyed() && loadTokens.get(window) === token) {
      online = false
      publishState()
      await window.loadFile(join(__dirname, 'offline.html')).catch(() => {})
    }
    return false
  }
}

async function toggleChat() {
  const window = createChatWindow()
  if (window.isVisible()) {
    window.hide()
  } else {
    positionChat()
    window.show()
    window.focus()
    void loadDsh(window)
  }
  publishState()
}

async function openFull() {
  const window = createFullWindow()
  window.show()
  window.focus()
  await loadDsh(window)
}

function showPet() {
  if (!petWindow || petWindow.isDestroyed()) createPetWindow()
  petWindow.showInactive()
  pinWindowToAllX11Workspaces(petWindow)
}

function createTray() {
  const icon = nativeImage.createFromPath(APP_ICON).resize({ width: 22, height: 22 })
  tray = new Tray(icon)
  tray.setToolTip('DeskDSH')
  rebuildTrayMenu = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: online ? 'DSH 已连接' : 'DSH 未连接', enabled: false },
    { type: 'separator' },
    { label: '显示桌面宠物', click: showPet },
    { label: `待办便签 (${(todoStore?.list() ?? []).filter(item => !item.completed).length})`, click: () => { showPet(); toggleTodo() } },
    { label: '打开迷你对话', click: () => { showPet(); void toggleChat() } },
    { label: '打开完整 DSH', click: () => { void openFull() } },
    { label: '语音设置', click: () => toggleVoiceSettings() },
    { label: '重新连接', click: () => { void refreshOnline() } },
    { type: 'separator' },
    { label: '退出 DeskDSH', click: () => app.quit() },
  ]))
  rebuildTrayMenu()
  tray.on('click', showPet)
  tray.on('double-click', () => { void toggleChat() })
}

async function runSmokeTest() {
  const chat = createChatWindow()
  const full = createFullWindow()
  const chatOnline = await loadDsh(chat)
  const fullOnline = await loadDsh(full)
  const result = {
    online,
    chatOnline,
    fullOnline,
    petLoaded: petWindow?.webContents.getURL().endsWith('/src/pet.html') || false,
    chatUrl: chat.webContents.getURL(),
    fullUrl: full.webContents.getURL(),
    trayCreated: Boolean(tray),
    todoWindowCreated: Boolean(createTodoWindow()),
    todoStoreReady: Array.isArray(todoStore.list()),
    voiceWindowCreated: Boolean(createVoiceWindow()),
  }
  console.log(`DESKDSH_SMOKE_RESULT=${JSON.stringify(result)}`)
  const passed = result.online && result.chatOnline && result.fullOnline
    && result.petLoaded && result.chatUrl === DSH_URL && result.fullUrl === DSH_URL && result.trayCreated
    && result.todoWindowCreated && result.todoStoreReady
    && result.voiceWindowCreated
  process.exitCode = passed ? 0 : 1
  app.quit()
}

// ---- Voice: window ----

function createVoiceWindow() {
  if (voiceWindow && !voiceWindow.isDestroyed()) return voiceWindow
  voiceWindow = new BrowserWindow({
    width: 420,
    height: 540,
    frame: false,
    transparent: true,
    title: 'DeskDSH 语音设置',
    show: false,
    resizable: true,
    minWidth: 380,
    minHeight: 480,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: APP_ICON,
    webPreferences: webPreferences('voice-preload.cjs'),
  })
  voiceWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  voiceWindow.loadFile(join(__dirname, 'voice.html'))
  voiceWindow.on('close', event => {
    if (quitting) return
    event.preventDefault()
    voiceWindow.hide()
    publishState()
  })
  return voiceWindow
}

function toggleVoiceSettings() {
  const window = createVoiceWindow()
  if (window.isVisible()) window.hide()
  else {
    window.show()
    window.focus()
  }
  publishState()
}

// ---- Voice: ASR pipeline ----

function publishVoiceTranscript(text, kind) {
  if (voiceWindow && !voiceWindow.isDestroyed()) {
    voiceWindow.webContents.send('voice:transcript', { text, kind, time: Date.now() })
  }
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:voice-status', { listening: voiceListening, text })
  }
}

function publishVoiceState(patch) {
  if (voiceWindow && !voiceWindow.isDestroyed()) {
    voiceWindow.webContents.send('voice:state', patch)
  }
}

function processVoiceCommand(text) {
  const cmd = text.trim()
  if (!cmd) return

  // Meeting mode: append to transcript instead of treating as command
  if (meetingActive) {
    meetingTranscript.push(cmd)
    publishVoiceTranscript(cmd, 'meeting')
    return
  }

  // Wake word: if enabled, only process utterances containing the wake word
  const settings = voiceSettings?.get() ?? {}
  if (settings.wakeWordEnabled && settings.wakeWord) {
    const idx = cmd.indexOf(settings.wakeWord)
    if (idx === -1) {
      publishVoiceTranscript(cmd, 'ignored')
      return
    }
    const rest = cmd.slice(idx + settings.wakeWord.length).trim().replace(/^[，。,.\s]+/, '')
    if (!rest) {
      publishVoiceTranscript(`🎤 ${settings.wakeWord}，请说命令`, 'wake')
      return
    }
    publishVoiceTranscript(rest, 'final')
    routeCommand(rest)
    return
  }

  publishVoiceTranscript(cmd, 'final')
  routeCommand(cmd)
}

function routeCommand(cmd) {
  const lower = cmd.toLowerCase()

  if (/^(打开|开)(迷你)?对话|打开聊天/.test(lower)) {
    showPet(); toggleChat(); return
  }
  if (/^(关闭|关掉)(迷你)?对话|关闭聊天/.test(lower)) {
    if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) chatWindow.hide(); return
  }
  if (/^(打开|开)完整|打开.*面板/.test(lower)) {
    void openFull(); return
  }
  if (/^(打开|开)待办|待办/.test(lower) && !/^添加/.test(lower)) {
    toggleTodo(); return
  }
  if (/^(关闭|关掉)待办/.test(lower)) {
    if (todoWindow && !todoWindow.isDestroyed() && todoWindow.isVisible()) todoWindow.hide(); return
  }
  const todoAddMatch = cmd.match(/^(?:添加|新增|加|记)(?:一个|个)?待办[：:]\s*(.+)$/) || cmd.match(/^(?:添加|新增|加|记)(?:一个|个)?待办\s+(.+)$/)
  if (todoAddMatch) {
    const text = todoAddMatch[1].trim()
    if (text) {
      const items = todoStore.add(text)
      publishTodos(items)
      publishVoiceTranscript(`✅ 已添加待办: ${text}`, 'info')
    }
    return
  }
  if (/^(重新|重)(连接|连)|检查.*连接/.test(lower)) {
    void refreshOnline(); return
  }
  if (/^(退出|关闭)(应用|程序|deskdsh|dsh)/.test(lower) || lower === '退出') {
    app.quit(); return
  }

  // Fallback: forward to DSH chat as a user message
  sendToDshChat(cmd)
}

// Enumerate sessions in a DSH window sidebar (role=treeitem rows with titles)
async function dshWindowSessions(window) {
  try {
    return await window.webContents.executeJavaScript(`(function(){
      const tree = document.querySelector('div[role="tree"][aria-label]');
      if (!tree) return [];
      return [...tree.querySelectorAll('div[role="treeitem"]')]
        .map(el => ({
          title: [...el.querySelectorAll('span')]
            .map(s => s.textContent.trim())
            .find(t => t.length > 0) || '',
          current: el.getAttribute('aria-selected') === 'true',
        }))
        .filter(x => x.title);
    })()`)
  } catch { return [] }
}

async function waitForSessions(window, timeoutMs = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const sessions = await dshWindowSessions(window)
    if (sessions.length) return sessions
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  return []
}

ipcMain.handle('voice:list-targets', async event => {
  if (!fromVoiceWindow(event)) return []
  const full = createFullWindow()
  full.show()
  full.focus()
  await loadDsh(full)
  if (!online) return []
  return waitForSessions(full)
})

// Inject text into a DSH window composer and auto-submit
const COMPOSER_FILL_JS = `
  (function(text) {
    const candidates = [
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="发消息"]',
      'textarea[placeholder*="send" i]',
      'textarea[placeholder*="输入" i]',
      'textarea[placeholder*="input" i]',
      'textarea[placeholder*="消息" i]',
      'textarea[placeholder*="message" i]',
      '[contenteditable="true"][role="textbox"]',
      'textarea',
    ];
    let input = null;
    for (const sel of candidates) {
      input = document.querySelector(sel);
      if (input) break;
    }
    if (!input) return 'no-input-found';

    input.focus();

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      // React controlled input: bypass its value tracker via the native setter
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, text);
    }

    // Confirm the value actually stuck
    const current = input.value !== undefined ? input.value : input.textContent;
    if (!current || !current.includes(text.slice(0, 10))) return 'fill-failed';

    // Click a send button if one is identifiable
    const form = input.closest('form');
    const scope = form || input.parentElement || document;
    let sendBtn = scope.querySelector('button[type="submit"]');
    if (!sendBtn) {
      sendBtn = [...document.querySelectorAll('button[aria-label*="send" i], button[aria-label*="发送"]')]
        .find(b => !b.disabled && b.offsetParent !== null);
    }
    if (!sendBtn) {
      // Heuristic: the last visible icon-only button inside the composer area
      const nearby = [...scope.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null && b.textContent.trim() === '');
      sendBtn = nearby[nearby.length - 1];
    }
    if (sendBtn) { sendBtn.click(); return 'sent'; }

    // Fallback: Enter key
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    return 'sent-enter';
  })
`

async function submitToWindow(window, text) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await window.webContents.executeJavaScript(`(${COMPOSER_FILL_JS})(${JSON.stringify(text)})`)
      if (result === 'sent' || result === 'sent-enter') return true
      if (result === 'no-input-found' || result === 'fill-failed') {
        await new Promise(resolve => setTimeout(resolve, 600))
        continue
      }
      return false
    } catch { return false }
  }
  return false
}

// Send voice text to the configured DSH target
async function sendToDshChat(text) {
  const settings = voiceSettings?.get() ?? {}
  const target = settings.voiceTarget || 'chat:current'
  const useFull = target.startsWith('full')
  const window = useFull ? createFullWindow() : createChatWindow()
  if (!window.isVisible()) { if (useFull) { window.show(); window.focus() } else { positionChat(); window.show(); window.focus() } }
  else window.focus()

  await loadDsh(window)
  if (!online) {
    publishVoiceTranscript('⚠️ DSH 未连接，无法发送', 'info')
    return
  }

  // Specific session: switch the window to that conversation first
  const wantedTitle = target === 'full:session' ? (settings.voiceTargetSession || '').trim() : ''
  if (wantedTitle) {
    const sessions = await waitForSessions(window, 4000)
    const match = sessions.find(s => s.title === wantedTitle) || sessions.find(s => s.title.includes(wantedTitle))
    if (!match) {
      publishVoiceTranscript(`⚠️ 找不到会话「${wantedTitle}」，已发送到当前对话`, 'info')
    } else if (!match.current) {
      try {
        await window.webContents.executeJavaScript(`(function(){
          const tree = document.querySelector('div[role="tree"][aria-label]');
          if (!tree) return;
          const rows = [...tree.querySelectorAll('div[role="treeitem"]')];
          const row = rows.find(el =>
            [...el.querySelectorAll('span')]
              .map(s => s.textContent.trim())
              .some(t => t === ${JSON.stringify(match.title)}));
          if (row) row.click();
        })()`)
        // Wait until the sidebar marks that session selected (composer remounts)
        const deadline = Date.now() + 4000
        while (Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 300))
          const sessions = await dshWindowSessions(window)
          const now = sessions.find(s => s.title === match.title)
          if (now?.current) break
        }
      } catch {}
    }
  }

  if (window.webContents && !window.webContents.isDestroyed()) {
    const ok = await submitToWindow(window, text)
    publishVoiceTranscript(ok ? `✅ 已发送给 DSH: ${text}` : `⚠️ 无法自动发送，请手动输入: ${text}`, 'info')
  }
}

// Voice: device enumeration via renderer (uses getUserMedia to get labels)
ipcMain.handle('voice:list-devices', async () => {
  if (!voiceWindow || voiceWindow.isDestroyed()) createVoiceWindow()
  try {
    const devices = await voiceWindow.webContents.executeJavaScript(`
      (async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        return all.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label }));
      })()
    `)
    return devices
  } catch {
    return []
  }
})

// Voice: settings IPC
ipcMain.handle('voice:get-settings', () => ({
  ...voiceSettings.get(),
  modelReady: modelReady(MODELS_BASE),
  listening: voiceListening,
  meetingActive,
}))

ipcMain.handle('voice:set-settings', (event, patch) => {
  const updated = voiceSettings.set(patch)
  publishVoiceState({ ...updated, listening: voiceListening })
  return updated
})

// Voice: model download
ipcMain.handle('voice:download-model', (event) => {
  if (!fromVoiceWindow(event)) return
  downloadModel(
    MODELS_BASE,
    pct => {
      if (voiceWindow && !voiceWindow.isDestroyed()) {
        voiceWindow.webContents.send('voice:download-progress', pct)
      }
    },
    error => {
      if (error) {
        if (voiceWindow && !voiceWindow.isDestroyed()) {
          voiceWindow.webContents.send('voice:download-progress', -2) // error signal
        }
        console.error('[DeskDSH] 模型下载失败:', error.message)
      } else {
        console.log('[DeskDSH] 模型下载完成')
        publishVoiceState({ modelReady: true })
      }
    }
  )
})

// Voice: toggle listening
ipcMain.handle('voice:toggle-listening', () => {
  voiceListening = !voiceListening
  publishVoiceState({ listening: voiceListening })
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:voice-status', { listening: voiceListening })
  }
  return voiceListening
})

// Voice: meeting mode (loopback recording; independent of the mic button)
ipcMain.handle('voice:start-meeting', () => {
  meetingActive = true
  meetingTranscript = []
  publishVoiceState({ meetingActive: true })
  return true
})

ipcMain.handle('voice:stop-meeting', () => {
  meetingActive = false
  publishVoiceState({ meetingActive: false })
  return meetingTranscript.join('\n')
})

// Voice: send transcript to DSH
ipcMain.handle('voice:close', event => {
  if (fromVoiceWindow(event)) { voiceWindow.hide(); publishState() }
})
ipcMain.handle('voice:send-to-dsh', (event, text) => {
  if (!fromVoiceWindow(event) || !text?.trim()) return false
  void sendToDshChat(`请整理以下会议纪要：\n\n${text.trim()}`)
  return true
})

// Voice: audio data from renderer, segmented by VAD then transcribed per segment
const { createSegmenter } = require('./voice-segmenter.cjs')
let segmenter = null
let voiceChunkCount = 0
let voiceSampleTotal = 0

function ensureSegmenter() {
  if (segmenter) return segmenter
  segmenter = createSegmenter({
    onSegment: (samples, seconds) => {
      try {
        console.log(`[DeskDSH voice] segment ${seconds.toFixed(1)}s → decode`)
        const text = asrEngine.transcribeSamples(samples).trim()
        console.log('[DeskDSH voice] segment recognized:', JSON.stringify(text))
        if (text) processVoiceCommand(text)
      } catch (e) {
        console.error('[DeskDSH voice] segment decode error:', e.message)
      }
    },
  })
  return segmenter
}

ipcMain.on('voice:audio-chunk', (event, payload) => {
  if ((!voiceListening && !meetingActive) || !asrEngine) return
  try {
    let float32
    if (Array.isArray(payload)) {
      float32 = new Float32Array(payload)
    } else if (payload instanceof ArrayBuffer) {
      float32 = new Float32Array(payload)
    } else if (payload && payload.buffer instanceof ArrayBuffer) {
      const view = new DataView(payload.buffer, payload.byteOffset || 0, payload.byteLength)
      float32 = new Float32Array(payload.byteLength / 4)
      for (let i = 0; i < float32.length; i++) float32[i] = view.getFloat32(i * 4, true)
    } else {
      console.warn('[DeskDSH voice] unexpected chunk payload:', typeof payload)
      return
    }
    ensureSegmenter().feed(float32)
    voiceChunkCount++
    voiceSampleTotal += float32.length
    if (voiceChunkCount % 40 === 0) {
      console.log(`[DeskDSH voice] chunks=${voiceChunkCount} total=${(voiceSampleTotal / 16000).toFixed(1)}s`)
    }
  } catch (e) {
    console.error('[DeskDSH voice] chunk error:', e.message)
  }
})

ipcMain.on('voice:audio-end', () => {
  if (!segmenter) {
    console.log('[DeskDSH voice] audio-end: no segmenter (no audio received)')
    return
  }
  try {
    segmenter.flush() // decodes any in-progress segment via onSegment
  } catch (e) {
    console.error('[DeskDSH voice] flush error:', e.message)
  }
  segmenter = null
  voiceChunkCount = 0
  voiceSampleTotal = 0
})

// Voice: PipeWire virtual loopback source (turns system output into a mic)
let loopbackProcess = null

ipcMain.handle('voice:loopback-start', event => {
  if (!fromVoiceWindow(event)) return false
  if (loopbackProcess) return true
  try {
    loopbackProcess = spawn('pw-loopback', [
      '--capture-props={stream.capture.sink=true node.description="DeskDSH Capture"}',
      '--playback-props={media.class=Audio/Source node.description="DeskDSH-Loopback"}',
    ], { stdio: 'ignore' })
    loopbackProcess.once('error', () => { loopbackProcess = null })
    loopbackProcess.once('exit', () => { loopbackProcess = null })
    return true
  } catch { return false }
})

ipcMain.handle('voice:loopback-stop', event => {
  if (!fromVoiceWindow(event)) return false
  if (loopbackProcess) { loopbackProcess.kill(); loopbackProcess = null }
  return true
})

// Voice: self-test with bundled sample (verifies ASR pipeline without a mic)
ipcMain.handle('voice:self-test', event => {
  if (!fromVoiceWindow(event)) return { ok: false, error: 'unauthorized' }
  try {
    const { modelPath } = require('./asr-engine.cjs')
    const wav = join(modelPath(MODELS_BASE), 'test_wavs', 'zh.wav')
    const text = asrEngine.transcribeFile(wav)
    console.log('[DeskDSH voice] self-test recognized:', JSON.stringify(text))
    return { ok: true, text }
  } catch (e) {
    console.error('[DeskDSH voice] self-test failed:', e.message)
    return { ok: false, error: e.message }
  }
})

function fromVoiceWindow(event) {
  return voiceWindow && !voiceWindow.isDestroyed() && event.sender === voiceWindow.webContents
}

// ---- Original handlers ----

function fromPet(event) {
  return petWindow && !petWindow.isDestroyed() && event.sender === petWindow.webContents
}

function fromDshWindow(event) {
  return [chatWindow, fullWindow].some(window => window && !window.isDestroyed() && event.sender === window.webContents)
}

function fromTodo(event) {
  return todoWindow && !todoWindow.isDestroyed() && event.sender === todoWindow.webContents
}

app.setName('DeskDSH')
if (process.platform === 'linux') app.setDesktopName('deskdsh.desktop')

// Only one instance; a second launch focuses the existing pet.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => showPet())

app.whenReady().then(async () => {
  // Grant microphone capture to our own windows only
  const { session } = require('electron')
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') callback(true)
    else callback(false)
  })

  todoStore = createTodoStore(join(app.getPath('userData'), 'todos.json'))
  voiceSettings = createVoiceSettings(app.getPath('userData'))
  asrEngine = createAsrEngine(MODELS_BASE)
  if (modelReady(MODELS_BASE)) {
    try { asrEngine.init() } catch (e) { console.warn('[DeskDSH] ASR init failed:', e.message) }
  }
  ipcMain.handle('pet:get-state', (event) => fromPet(event) ? publishState() : undefined)
  ipcMain.handle('pet:toggle-chat', (event) => fromPet(event) ? toggleChat() : undefined)
  ipcMain.handle('pet:toggle-todo', (event) => fromPet(event) ? toggleTodo() : undefined)
  ipcMain.handle('pet:toggle-voice-settings', (event) => fromPet(event) ? toggleVoiceSettings() : undefined)
  ipcMain.handle('pet:open-full', (event) => (fromPet(event) || fromDshWindow(event)) ? openFull() : undefined)
  ipcMain.handle('pet:retry', async (event) => {
    if (!fromPet(event) && !fromDshWindow(event)) return false
    const found = await refreshOnline()
    for (const window of [chatWindow, fullWindow]) {
      if (window && !window.isDestroyed() && window.isVisible()) void loadDsh(window)
    }
    return found
  })
  ipcMain.handle('pet:quit', (event) => { if (fromPet(event)) app.quit() })
  ipcMain.handle('todo:list', event => fromTodo(event) ? todoStore.list() : [])
  ipcMain.handle('todo:add', (event, input) => fromTodo(event) ? publishTodos(todoStore.add(input?.text)) : [])
  ipcMain.handle('todo:update', (event, input) => fromTodo(event) ? publishTodos(todoStore.update(input?.id, input?.text)) : [])
  ipcMain.handle('todo:toggle', (event, input) => fromTodo(event) ? publishTodos(todoStore.toggle(input?.id)) : [])
  ipcMain.handle('todo:remove', (event, input) => fromTodo(event) ? publishTodos(todoStore.remove(input?.id)) : [])
  ipcMain.handle('todo:close', event => { if (fromTodo(event)) { todoWindow.hide(); publishState() } })
  ipcMain.handle('dsh-window:close', (event) => {
    if (fromDshWindow(event)) BrowserWindow.fromWebContents(event.sender)?.hide()
  })
  ipcMain.handle('dsh-window:minimize', (event) => {
    if (fromDshWindow(event)) BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  createPetWindow()
  createTray()
  await refreshOnline()
  if (process.env.DESKDSH_SMOKE_TEST === '1') await runSmokeTest()
})

app.on('activate', showPet)

app.on('before-quit', () => {
  quitting = true
  clearTimeout(savePositionTimer)
  savePetBounds()
})

app.on('window-all-closed', () => {
  // The pet intentionally keeps the application resident.
})
