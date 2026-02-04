// preload.js
const { contextBridge, ipcRenderer, shell } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
  }
})

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => shell.openExternal(url),
  selectMusicDirectory: () => ipcRenderer.invoke('dialog:selectMusicDirectory'),
})
