const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const express = require("express");
const fs = require("fs");
const { promisify } = require("util");
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

let mainWindow;

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

// ==================== CREACIÓN DE VENTANA ====================
function createWindow() {
  const expressApp = express();

  const appRoot = app.getAppPath();
  const distPath = path.join(appRoot, "src", "jearcast-view", "dist");
  const preloadPath = path.join(appRoot, "src", "preload.js");

  expressApp.use(express.static(distPath));
  expressApp.use(express.json());

  expressApp.listen(3353, "127.0.0.1", () => {
    console.log(
      "Servidor interno de JearCast corriendo en http://localhost:3353",
    );

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 800,
      resizable: true,
      frame: false,
      title: "JearCast",
      titleBarStyle: "hiddenInset",
      autoHideMenuBar: true,
      transparent: true, // Cambiar a true para bordes redondeados
      backgroundColor: "#00000000", // Fondo transparente
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

    // --- SEGURIDAD Y EVENTOS DE ENTRADA ---
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
      }

      if (input.control && key === "-") {
        currentZoom -= 0.1;
        if (currentZoom < 0.5) currentZoom = 0.5;
        mainWindow.webContents.setZoomFactor(currentZoom);
        event.preventDefault();
      }

      if (input.control && key === "0") {
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
  });
}

// ==================== CICLO DE VIDA DE LA APP ====================

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ==================== HANDLERS IPC ====================

// --- NUEVOS HANDLERS PARA MÚSICA LOCAL ---
ipcMain.handle("select-music-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Selecciona tu carpeta de música",
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

// --- HANDLER LEGADO (mantener para compatibilidad) ---
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

// --- CONTROLES DE VENTANA ---
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-toggle-maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window-close", () => mainWindow?.close());
