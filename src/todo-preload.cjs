const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deskDshTodo', {
  list: () => ipcRenderer.invoke('todo:list'),
  add: text => ipcRenderer.invoke('todo:add', { text }),
  update: (id, text) => ipcRenderer.invoke('todo:update', { id, text }),
  toggle: id => ipcRenderer.invoke('todo:toggle', { id }),
  remove: id => ipcRenderer.invoke('todo:remove', { id }),
  close: () => ipcRenderer.invoke('todo:close'),
  onChanged: listener => {
    const handler = (_event, items) => listener(items)
    ipcRenderer.on('todo:changed', handler)
    return () => ipcRenderer.removeListener('todo:changed', handler)
  },
})
