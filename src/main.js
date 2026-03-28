const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  globalShortcut,
} = require("electron");
const path = require("path");
const express = require("express");
const fs = require("fs");
const { promisify } = require("util");
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// ✅ CORREGIDO: Usar path.join con __dirname para rutas absolutas dentro del ASAR
const servicesPath = path.join(__dirname, 'services');
const { DownloadService } = require(path.join(servicesPath, 'downloadService'));
const { AudioService } = require(path.join(servicesPath, 'AudioService'));
const { MPRISService } = require(path.join(servicesPath, 'MPRISService'));

let mainWindow;
let downloadService;
let audioService = null;
let mprisService = null;

// ==================== FUNCIONES DE MÚSICA LOCAL ====================
const supportedFormats = [
  ".mp3",
  ".flac",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".opus",
];

async function scanMusicFolder(folderPath) {
  const musicFiles = [];

  try {
    const files = await readdir(folderPath);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (supportedFormats.includes(ext)) {
        const fullPath = path.join(folderPath, file);
        const stats = await stat(fullPath);

        musicFiles.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          path: fullPath,
          title: path.basename(file, ext),
          artist: null,
          album: null,
          duration: null,
          cover: null,
          format: ext,
          size: stats.size,
          added_at: new Date().toISOString(),
        });
      }
    }

    return musicFiles;
  } catch (error) {
    console.error("Error escaneando carpeta:", error);
    return [];
  }
}

// ==================== CONFIGURACION DE TECLAS MULTIMEDIA ====================
function setupMediaKeys() {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {}

  const registeredKeys = [];

  const playPauseRegistered = globalShortcut.register("MediaPlayPause", () => {
    console.log("MediaPlayPause presionada");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("media-key-pressed", "playpause");
    }
  });
  if (playPauseRegistered) registeredKeys.push("MediaPlayPause");

  const nextRegistered = globalShortcut.register("MediaNextTrack", () => {
    console.log("MediaNextTrack presionada");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("media-key-pressed", "next");
    }
  });
  if (nextRegistered) registeredKeys.push("MediaNextTrack");

  const prevRegistered = globalShortcut.register("MediaPreviousTrack", () => {
    console.log("MediaPreviousTrack presionada");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("media-key-pressed", "prev");
    }
  });
  if (prevRegistered) registeredKeys.push("MediaPreviousTrack");

  const f7Registered = globalShortcut.register("F7", () => {
    console.log("F7 presionada (prev)");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("media-key-pressed", "prev");
    }
  });
  if (f7Registered) registeredKeys.push("F7");

  const f8Registered = globalShortcut.register("F8", () => {
    console.log("F8 presionada (play/pause)");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("media-key-pressed", "playpause");
    }
  });
  if (f8Registered) registeredKeys.push("F8");

  const f9Registered = globalShortcut.register("F9", () => {
    console.log("F9 presionada (next)");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("media-key-pressed", "next");
    }
  });
  if (f9Registered) registeredKeys.push("F9");

  console.log("Teclas registradas:", registeredKeys);
}

// ==================== CREACION DE VENTANA ====================
function createWindow() {
  const expressApp = express();

  const appRoot = app.getAppPath();
  const distPath = path.join(appRoot, "src", "jearcast-view", "dist");
  const preloadPath = path.join(appRoot, "src", "preload.js");

  expressApp.use(express.static(distPath));
  expressApp.use(express.json());

  const server = expressApp.listen(3353, "127.0.0.1", () => {
    console.log("Servidor interno de JearCast corriendo en http://localhost:3353");

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 800,
      resizable: true,
      frame: false,
      title: "JearCast",
      titleBarStyle: "hiddenInset",
      autoHideMenuBar: true,
      transparent: true,
      backgroundColor: "#00000000",
      roundedCorners: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        zoomFactor: 1.0,
        webSecurity: false,
        allowRunningInsecureContent: true,
      },
    });

    mainWindow.loadURL("http://localhost:3353");

    mainWindow.webContents.setVisualZoomLevelLimits(1, 3);
    mainWindow.webContents.setZoomFactor(1);

    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }

    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();
      const isShortcut =
        ((input.control || input.meta) && input.shift && key === "i") ||
        input.key === "F12";

      if (isShortcut) {
        event.preventDefault();
      }
    });

    mainWindow.webContents.on("context-menu", (event) => {
      event.preventDefault();
    });

    let currentZoom = 1;
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();

      if (input.control && (key === "=" || key === "+")) {
        currentZoom += 0.1;
        if (currentZoom > 3) currentZoom = 3;
        mainWindow.webContents.setZoomFactor(currentZoom);
        event.preventDefault();
      } else if (input.control && key === "-") {
        currentZoom -= 0.1;
        if (currentZoom < 0.5) currentZoom = 0.5;
        mainWindow.webContents.setZoomFactor(currentZoom);
        event.preventDefault();
      } else if (input.control && key === "0") {
        currentZoom = 1;
        mainWindow.webContents.setZoomFactor(1);
        event.preventDefault();
      }
    });

    mainWindow.webContents.on("wheel", (event, delta) => {
      if (event.ctrlKey) {
        if (delta.deltaY < 0) currentZoom += 0.1;
        else currentZoom -= 0.1;

        if (currentZoom < 0.5) currentZoom = 0.5;
        if (currentZoom > 3) currentZoom = 3;

        mainWindow.webContents.setZoomFactor(currentZoom);
      }
    });

    downloadService = new DownloadService();
    audioService = new AudioService();
    
    // ✅ Inicializar MPRISService DESPUÉS de crear mainWindow
    mprisService = new MPRISService(mainWindow);
    
    // ✅ Configurar listener de cambios de estado
    ipcMain.on('player-state-change', (event, { state, title, artist, thumbnail, duration, position }) => {
      if (mprisService) {
        mprisService.updateMetadata({ title, artist, thumbnail, duration });
        mprisService.updatePlaybackState(state);
        mprisService.updatePosition(position);
      }
    });

    if (audioService) {
      audioService.on("ended", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("audio-ended");
        }
      });

      audioService.on("eq-change", (settings) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("audio-eq-changed", settings);
        }
      });
    }

    global.mainWindow = mainWindow;

    console.log("Servicio de descargas inicializado");
    console.log("Servicio de audio inicializado");
    console.log("Servicio MPRIS inicializado");
  });
}

// ==================== CICLO DE VIDA DE LA APP ====================
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  setupMediaKeys();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("will-quit", () => {
  if (globalShortcut) {
    globalShortcut.unregisterAll();
  }
});

// ==================== HANDLERS IPC ====================

ipcMain.handle("select-music-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Selecciona tu carpeta de musica",
  });

  if (!result.canceled && result.filePaths[0]) {
    const folderPath = result.filePaths[0];
    const musicFiles = await scanMusicFolder(folderPath);
    return { folderPath, musicFiles };
  }
  return null;
});

ipcMain.handle("scan-music-folder", async (event, folderPath) => {
  return await scanMusicFolder(folderPath);
});

ipcMain.handle("get-audio-metadata", async (event, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    return {
      format: ext,
      title: path.basename(filePath, ext),
      duration: null,
      artist: null,
      album: null,
    };
  } catch (error) {
    console.error("Error obteniendo metadatos:", error);
    return null;
  }
});

ipcMain.handle("dialog:selectMusicDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) return [];

  const folder = result.filePaths[0];

  try {
    const musicFiles = fs
      .readdirSync(folder)
      .filter(
        (f) => f.endsWith(".mp3") || f.endsWith(".wav") || f.endsWith(".ogg"),
      )
      .map((f) => ({
        name: f,
        path: path.join(folder, f),
      }));

    return musicFiles;
  } catch (error) {
    console.error("Error leyendo el directorio:", error);
    return [];
  }
});

ipcMain.handle("get-video-info", async (event, videoId) => {
  if (!downloadService)
    return { success: false, error: "Servicio no inicializado" };
  try {
    const info = await downloadService.getVideoInfo(videoId);
    return { success: true, data: info };
  } catch (error) {
    console.error("Error obteniendo info:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  "download-audio",
  async (event, { videoId, title, quality, downloadId }) => {
    if (!downloadService)
      return { success: false, error: "Servicio no inicializado" };
    try {
      const result = await downloadService.downloadAudio(
        videoId,
        title,
        quality,
        downloadId,
      );
      return result;
    } catch (error) {
      console.error("Error en descarga:", error);
      return { success: false, error: error.message };
    }
  },
);

ipcMain.handle("cancel-download", async (event, downloadId) => {
  if (!downloadService) return false;
  return downloadService.cancelDownload(downloadId);
});

ipcMain.handle("get-downloaded-files", async () => {
  if (!downloadService)
    return { success: false, error: "Servicio no inicializado" };
  try {
    const files = fs
      .readdirSync(downloadService.downloadsPath)
      .filter((f) => f.endsWith(".mp3"))
      .map((f) => ({
        name: f,
        path: path.join(downloadService.downloadsPath, f),
        size: fs.statSync(path.join(downloadService.downloadsPath, f)).size,
        modified: fs.statSync(path.join(downloadService.downloadsPath, f))
          .mtime,
      }))
      .sort((a, b) => b.modified - a.modified);
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("audio-play", async (event, { path: audioPath, eqSettings }) => {
  if (!audioService)
    return { success: false, error: "Servicio de audio no inicializado" };
  try {
    if (eqSettings) {
      audioService.updateEqualizer(eqSettings);
    }
    await audioService.playWithEqualizer(audioPath);
    return { success: true };
  } catch (error) {
    console.error("Error reproduciendo:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("audio-stop", async () => {
  if (!audioService) return { success: false };
  audioService.stopPlayback();
  return { success: true };
});

ipcMain.handle("audio-volume", async (event, volume) => {
  if (!audioService) return { success: false };
  audioService.setVolume(volume);
  return { success: true, volume: audioService.volume };
});

ipcMain.handle("audio-eq", async (event, settings) => {
  if (!audioService) return { success: false };
  audioService.updateEqualizer(settings);
  return { success: true, settings: audioService.eqSettings };
});

ipcMain.handle("audio-process", async (event, { inputPath, outputPath }) => {
  if (!audioService)
    return { success: false, error: "Servicio no inicializado" };
  try {
    const result = await audioService.processAndSave(inputPath, outputPath);
    return { success: true, path: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.on("window-minimize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on("window-toggle-maximize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on("window-close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});