const { contextBridge, ipcRenderer, shell } = require("electron");

// Exponer API segura al frontend
contextBridge.exposeInMainWorld("electron", {
  // Descargas
  getVideoInfo: (videoId) => ipcRenderer.invoke("get-video-info", videoId),
  downloadAudio: (options) => ipcRenderer.invoke("download-audio", options),
  cancelDownload: (downloadId) => ipcRenderer.invoke("cancel-download", downloadId),
  getDownloadedFiles: () => ipcRenderer.invoke("get-downloaded-files"),

  // Escuchar progreso - CORREGIDO
  onDownloadProgress: (callback) => {
    ipcRenderer.on("download-progress", (event, data) => callback(data));
  },
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners("download-progress");
  },

  // Controles de ventana
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-toggle-maximize"),
  close: () => ipcRenderer.send("window-close"),

  // EXPONER ipcRenderer COMPLETO con todos los métodos
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel), // ← AGREGADO
    once: (channel, callback) => ipcRenderer.once(channel, (event, ...args) => callback(...args)),
    removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback),
  },

  // Teclas multimedia
  onMediaKey: (callback) => {
    ipcRenderer.on("media-key-pressed", (event, key) => callback(key));
  },
  removeMediaKeyListener: () => {
    ipcRenderer.removeAllListeners("media-key-pressed");
  },
});

// API para música local y utilidades
contextBridge.exposeInMainWorld("electronAPI", {
  openExternal: (url) => shell.openExternal(url),
  selectMusicDirectory: () => ipcRenderer.invoke("dialog:selectMusicDirectory"),
  selectMusicFolder: () => ipcRenderer.invoke("select-music-folder"),
  scanMusicFolder: (folderPath) => ipcRenderer.invoke("scan-music-folder", folderPath),
  getAudioMetadata: (filePath) => ipcRenderer.invoke("get-audio-metadata", filePath),
});

// API PARA EL AUDIO
contextBridge.exposeInMainWorld("electronAudio", {
  play: (options) => ipcRenderer.invoke("audio-play", options),
  stop: () => ipcRenderer.invoke("audio-stop"),
  setVolume: (volume) => ipcRenderer.invoke("audio-volume", volume),
  setEqualizer: (settings) => ipcRenderer.invoke("audio-eq", settings),
  processFile: (options) => ipcRenderer.invoke("audio-process", options),
  onEnded: (callback) => {
    ipcRenderer.on("audio-ended", () => callback());
  },
  onEqChanged: (callback) => {
    ipcRenderer.on("audio-eq-changed", (event, settings) => callback(settings));
  },
  removeListeners: () => {
    ipcRenderer.removeAllListeners("audio-ended");
    ipcRenderer.removeAllListeners("audio-eq-changed");
  },
});

console.log("Preload cargado, APIs de Electron disponibles");