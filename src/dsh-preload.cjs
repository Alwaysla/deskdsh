const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deskDshShell', {
  close: () => ipcRenderer.invoke('dsh-window:close'),
  minimize: () => ipcRenderer.invoke('dsh-window:minimize'),
  openFull: () => ipcRenderer.invoke('pet:open-full'),
  retry: () => ipcRenderer.invoke('pet:retry'),
})

function installChrome() {
  if (document.getElementById('deskdsh-chrome')) return
  const style = document.createElement('style')
  style.textContent = `
    #deskdsh-chrome { position: fixed; z-index: 2147483647; top: 8px; left: 50%; transform: translateX(-50%); height: 30px; display: flex; align-items: center; gap: 5px; padding: 0 7px 0 12px; border: 1px solid rgba(120,130,160,.26); border-radius: 999px; background: color-mix(in srgb, Canvas 90%, transparent); color: CanvasText; box-shadow: 0 5px 22px rgba(0,0,0,.16); backdrop-filter: blur(14px); font: 600 11px/1 system-ui,sans-serif; -webkit-app-region: drag; }
    #deskdsh-chrome button { -webkit-app-region: no-drag; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; color: inherit; background: color-mix(in srgb, CanvasText 9%, transparent); cursor: pointer; font: 14px/1 system-ui,sans-serif; }
    #deskdsh-chrome button:hover { background: color-mix(in srgb, CanvasText 17%, transparent); }
    #deskdsh-chrome .deskdsh-label { margin-right: 3px; opacity: .7; }
  `
  const chrome = document.createElement('div')
  chrome.id = 'deskdsh-chrome'
  chrome.innerHTML = '<span class="deskdsh-label">DSH</span><button data-action="full" title="打开完整面板">↗</button><button data-action="min" title="最小化">−</button><button data-action="close" title="收起">×</button>'
  chrome.addEventListener('click', (event) => {
    const action = event.target?.dataset?.action
    if (action === 'full') void ipcRenderer.invoke('pet:open-full')
    if (action === 'min') void ipcRenderer.invoke('dsh-window:minimize')
    if (action === 'close') void ipcRenderer.invoke('dsh-window:close')
  })
  document.documentElement.append(style)
  document.body.append(chrome)
}

window.addEventListener('DOMContentLoaded', installChrome)
