const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const express = require("express");
const fs = require("fs");

let mainWindow;

function createWindow() {
  const expressApp = express();
  const distPath = path.join(__dirname, "jearcast-view", "dist");

  expressApp.use(express.static(distPath));

  // Servidor interno
  expressApp.listen(3353, () => {
    console.log("Servidor interno corriendo en http://localhost:3353");

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 800,
      resizable: true,
      frame: false,
      title: "JearCast",
      titleBarStyle: "hidden",
      autoHideMenuBar: true,

      // 🔥 Necesario para bordes redondeados
      transparent: true,
      backgroundColor: "#00000000",

      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
        zoomFactor: 1.0,
      },
    });

    mainWindow.loadURL("http://localhost:3353");

    mainWindow.webContents.setVisualZoomLevelLimits(1, 3);
    mainWindow.webContents.setZoomFactor(1);

    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }

    // 🔐 Bloquear F12 y CTRL+SHIFT+I
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();
      const isShortcut =
        (input.control || input.meta) && input.shift && key === "i" ||
        input.key === "F12";

      if (isShortcut) {
        event.preventDefault();
        return;
      }
    });

    // ❌ Bloquear menú contextual
    mainWindow.webContents.on("context-menu", (event) => {
      event.preventDefault();
    });

    // 🔍 Control de zoom
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

    // 🖱️ Zoom con scroll
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

// 📁 Selector de música
ipcMain.handle("dialog:selectMusicDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) return [];

  const folder = result.filePaths[0];

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
});

// 🪟 Control de ventana
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-toggle-maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window-close", () => mainWindow?.close());
