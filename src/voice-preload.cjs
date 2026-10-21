const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deskDshVoice', {
  getSettings: () => ipcRenderer.invoke('voice:get-settings'),
  setSettings: patch => ipcRenderer.invoke('voice:set-settings', patch),
  listDevices: () => ipcRenderer.invoke('voice:list-devices'),
  listTargets: () => ipcRenderer.invoke('voice:list-targets'),
  toggleListening: () => ipcRenderer.invoke('voice:toggle-listening'),
  startMeeting: () => ipcRenderer.invoke('voice:start-meeting'),
  stopMeeting: () => ipcRenderer.invoke('voice:stop-meeting'),
  downloadModel: () => ipcRenderer.invoke('voice:download-model'),
  close: () => ipcRenderer.invoke('voice:close'),
  selfTest: () => ipcRenderer.invoke('voice:self-test'),
  loopbackStart: () => ipcRenderer.invoke('voice:loopback-start'),
  loopbackStop: () => ipcRenderer.invoke('voice:loopback-stop'),
  sendToDsh: text => ipcRenderer.invoke('voice:send-to-dsh', text),
  sendAudioChunk: buffer => ipcRenderer.send('voice:audio-chunk', buffer),
  sendAudioEnd: () => ipcRenderer.send('voice:audio-end'),
  onTranscript: listener => {
    const handler = (_event, data) => listener(data)
    ipcRenderer.on('voice:transcript', handler)
    return () => ipcRenderer.removeListener('voice:transcript', handler)
  },
  onState: listener => {
    const handler = (_event, data) => listener(data)
    ipcRenderer.on('voice:state', handler)
    return () => ipcRenderer.removeListener('voice:state', handler)
  },
  onDownloadProgress: listener => {
    const handler = (_event, pct) => listener(pct)
    ipcRenderer.on('voice:download-progress', handler)
    return () => ipcRenderer.removeListener('voice:download-progress', handler)
  },
})
