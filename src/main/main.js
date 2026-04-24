const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  globalShortcut,
  Tray,
  nativeImage
} = require("electron");
const path = require("path");
const express = require("express");
const fs = require("fs");

app.commandLine.appendSwitch("disable-features", "Accessibility");

const servicesPath = path.join(__dirname, "services");
const { DownloadService } = require(path.join(servicesPath, "downloadService"));
const { AudioService } = require(path.join(servicesPath, "AudioService"));
const { MPRISService } = require(path.join(servicesPath, "MPRISService"));

// Establecer el ID de la aplicación para que el Dock la reconozca
if (process.platform === 'linux') {
  app.setName("jearcast");
  app.setAppUserModelId("jearcast");
}

let mainWindow = null;
let downloadService = null;
let audioService = null;
let mprisService = null;
let server = null;
let tray = null;
app.isQuiting = false;

// --- SEGURIDAD: Bloqueo de instancia única ---
const additionalData = { myKey: 'jearcast-unique-lock' };
const gotTheLock = app.requestSingleInstanceLock(additionalData);

if (!gotTheLock) {
  // Si no obtenemos el bloqueo, es que ya hay una instancia ejecutándose.
  // Cerramos esta instancia inmediatamente.
  console.log("Ya hay una instancia de JearCast ejecutándose. Cerrando esta...");
  app.quit();
} else {
  // Si tenemos el bloqueo, escuchamos cuando se intente abrir una segunda instancia
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    // Alguien intentó ejecutar una segunda instancia, enfocamos nuestra ventana.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  // Continuar con la carga normal de la aplicación
  function startInternalServer() {
  if (server) return;
  const expressApp = express();
  const musicPath = path.join(process.env.HOME || process.env.USERPROFILE, "Descargas", "JearCast");
  if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
  expressApp.use(express.static(path.join(app.getAppPath(), "src", "jearcast-view", "dist")));
  
  // Servir carpeta build para iconos de la interfaz
  expressApp.use("/build", express.static(path.join(app.getAppPath(), "build")));
  
  expressApp.use("/audio", express.static(musicPath));
  expressApp.use(express.json());
  server = expressApp.listen(3353, "127.0.0.1");
}

function createTray() {
  const iconPath = path.join(app.getAppPath(), "build", "icons-top", "32x32.png");
  
  console.log("Intentando crear icono de bandeja en:", iconPath);
  
  if (!fs.existsSync(iconPath)) {
    console.error("❌ No se encontró el icono del tray en:", iconPath);
    return;
  }

  try {
    const trayIcon = nativeImage.createFromPath(iconPath);
    // En Linux GNOME, 22px o 24px suele ser el estándar, pero 32px con resize funciona bien.
    const finalIcon = process.platform === 'linux' ? trayIcon.resize({ width: 22, height: 22 }) : trayIcon;
    
    tray = new Tray(finalIcon);
    
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: "Mostrar JearCast", 
        click: () => {
          const win = global.mainWindow;
          win?.show();
          win?.focus();
        } 
      },
      { type: "separator" },
      { label: "Reproducir / Pausa", click: () => {
          console.log("Tray: Play/Pause clicked");
          global.mainWindow?.webContents.send("media-key-pressed", "playpause");
        } 
      },
      { label: "Siguiente", click: () => {
          console.log("Tray: Next clicked");
          global.mainWindow?.webContents.send("media-key-pressed", "next");
        } 
      },
      { label: "Anterior", click: () => {
          console.log("Tray: Prev clicked");
          global.mainWindow?.webContents.send("media-key-pressed", "prev");
        } 
      },
      { type: "separator" },
      { 
        label: "Salir", 
        click: () => {
          app.isQuiting = true;
          app.quit();
        } 
      }
    ]);

    tray.setToolTip("JearCast Player");
    tray.setContextMenu(contextMenu);
    
    // Doble click o click simple para mostrar/ocultar (según el DE)
    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });

    console.log("✅ Icono de bandeja creado exitosamente.");
  } catch (error) {
    console.error("❌ Error al crear el icono de la bandeja:", error);
  }
}

function setupMediaKeys() {
  globalShortcut.unregisterAll();
  const keys = [
    { key: "MediaPlayPause", action: "playpause" },
    { key: "MediaNextTrack", action: "next" },
    { key: "MediaPreviousTrack", action: "prev" },
    { key: "F7", action: "prev" },
    { key: "F8", action: "playpause" },
    { key: "F9", action: "next" }
  ];

  keys.forEach(({ key, action }) => {
    globalShortcut.register(key, () => {
      mainWindow?.webContents.send("media-key-pressed", action);
    });
  });
}

function createWindow() {
  if (mainWindow) return mainWindow.show();

  const baseDir = app.getAppPath();
  const preloadPath = path.join(baseDir, "src", "preload.js");
  const iconPath = path.join(baseDir, "build", "icons-dash", "256x256.png");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    frame: false,
    transparent: true, // Habilitar transparencia para bordes redondeados
    hasShadow: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      webSecurity: false,
      zoomFactor: 1.0, // Zoom inicial
    },
  });

  // Evitar que GNOME fuerce la barra de título en algunas versiones
  mainWindow.setMenuBarVisibility(false);

  global.mainWindow = mainWindow;
  mainWindow.loadURL("http://localhost:3353");

  // Reactivar Zoom Shortcuts (Ctrl+Plus, Ctrl+Minus, Ctrl+0)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === '+') {
      mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5);
      event.preventDefault();
    }
    if (input.control && input.key === '-') {
      mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5);
      event.preventDefault();
    }
    if (input.control && input.key === '0') {
      mainWindow.webContents.setZoomLevel(0);
      event.preventDefault();
    }
  });

  // Manejar el cierre de ventana para ocultar al tray
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  if (!mprisService) mprisService = new MPRISService(mainWindow);
  if (!downloadService) downloadService = new DownloadService();
  if (!audioService) {
    audioService = new AudioService();
    audioService.on("ended", () => mainWindow?.webContents.send("audio-ended"));
  }
}

function setupIpcHandlers() {
  ipcMain.handle("get-video-info", (e, id) => downloadService.getVideoInfo(id));
  ipcMain.handle("download-audio", (e, a) => downloadService.downloadAudio(a.videoId, a.title, a.quality, a.downloadId));
  ipcMain.handle("cancel-download", (e, id) => downloadService.cancelDownload(id));
  ipcMain.handle("audio-play", (e, { path: p, eqSettings }) => {
    if (eqSettings) audioService.updateEqualizer(eqSettings);
    return audioService.playWithEqualizer(p);
  });
  ipcMain.handle("audio-stop", () => audioService.stopPlayback());
  ipcMain.handle("audio-volume", (e, v) => audioService.setVolume(v));

  ipcMain.on("player-state-change", (e, data) => {
    if (mprisService) {
      mprisService.updateMetadata(data);
      mprisService.updatePlaybackState(data.state);
      mprisService.updatePosition(data.position);
    }
  });

  ipcMain.on("window-minimize", () => mainWindow?.minimize());
  ipcMain.on("window-toggle-maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on("window-close", () => mainWindow?.close());
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startInternalServer();
  setupIpcHandlers();
  createWindow();
  createTray();
  setupMediaKeys();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (audioService) audioService.stopPlayback();
  if (server) server.close();
});
}
