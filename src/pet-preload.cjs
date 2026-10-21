const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deskDsh', {
  toggleChat: () => ipcRenderer.invoke('pet:toggle-chat'),
  toggleTodo: () => ipcRenderer.invoke('pet:toggle-todo'),
  toggleVoiceSettings: () => ipcRenderer.invoke('pet:toggle-voice-settings'),
  openFull: () => ipcRenderer.invoke('pet:open-full'),
  retry: () => ipcRenderer.invoke('pet:retry'),
  quit: () => ipcRenderer.invoke('pet:quit'),
  getState: () => ipcRenderer.invoke('pet:get-state'),
  onState: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('pet:state', handler)
    return () => ipcRenderer.removeListener('pet:state', handler)
  },
})
