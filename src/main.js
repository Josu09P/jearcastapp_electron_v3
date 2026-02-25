const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const express = require("express");
const fs = require("fs");

let mainWindow;

function createWindow() {
  const expressApp = express();
  
  /**
   * CORRECCIÓN DE RUTAS PARA FLATPAK
   * app.getAppPath() nos devuelve la ubicación de la raíz de la app 
   * (donde está tu package.json). Desde ahí construimos rutas absolutas.
   */
  const appRoot = app.getAppPath();
  const distPath = path.join(appRoot, "src", "jearcast-view", "dist");
  const preloadPath = path.join(appRoot, "src", "preload.js");

  // Servidor interno para servir los archivos de Vue (Evita bloqueos de YouTube)
  expressApp.use(express.static(distPath));

  // Escuchamos en el puerto 3353 localmente
  expressApp.listen(3353, '127.0.0.1', () => {
    console.log("Servidor interno de JearCast corriendo en http://localhost:3353");

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 800,
      resizable: true,
      frame: false,
      title: "JearCast",
      titleBarStyle: "hidden",
      autoHideMenuBar: true,
      
      // Configuración para bordes redondeados y transparencia
      transparent: true,
      backgroundColor: "#00000000",

      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath, // Ruta absoluta corregida
        zoomFactor: 1.0,
      },
    });

    // Cargamos la app a través del servidor Express local
    mainWindow.loadURL("http://localhost:3353");

    // Configuración de límites de zoom
    mainWindow.webContents.setVisualZoomLevelLimits(1, 3);
    mainWindow.webContents.setZoomFactor(1);

    // Abrir DevTools solo si no está empaquetado
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }

    // --- SEGURIDAD Y EVENTOS DE ENTRADA ---

    // Bloquear F12 y CTRL+SHIFT+I
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();
      const isShortcut =
        ((input.control || input.meta) && input.shift && key === "i") ||
        input.key === "F12";

      if (isShortcut) {
        event.preventDefault();
      }
    });

    // Bloquear menú contextual (clic derecho)
    mainWindow.webContents.on("context-menu", (event) => {
      event.preventDefault();
    });

    // Control de zoom con teclado (Ctrl + / Ctrl -)
    let currentZoom = 1;
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();

      if (input.control && (key === "=" || key === "+")) {
        currentZoom += 0.1;
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

    // Control de zoom con rueda del ratón + Ctrl
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

// --- CICLO DE VIDA DE LA APP ---

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // Quitar menú superior predeterminado
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- COMUNICACIÓN IPC (Handlers) ---

// Selector de directorios para música local
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
        (f) => f.endsWith(".mp3") || f.endsWith(".wav") || f.endsWith(".ogg")
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

// Controles de la ventana personalizada
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-toggle-maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window-close", () => mainWindow?.close());