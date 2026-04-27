const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  globalShortcut,
  Tray,
  nativeImage,
  protocol,
  net,
} = require("electron");
const path = require("path");
const express = require("express");
const fs = require("fs");

app.commandLine.appendSwitch("disable-features", "Accessibility");

// Registrar protocolo para archivos locales antes de que la app esté lista
protocol.registerSchemesAsPrivileged([
  { scheme: "local-media", privileges: { bypassCSP: true, stream: true } },
]);

const servicesPath = path.join(__dirname, "services");
const { DownloadService } = require(path.join(servicesPath, "downloadService"));
const { AudioService } = require(path.join(servicesPath, "AudioService"));
const { MPRISService } = require(path.join(servicesPath, "MPRISService"));
const { YouTubeSearchService } = require(
  path.join(servicesPath, "youtubeSearchService"),
);
const { LocalMusicService } = require(path.join(servicesPath, "LocalMusicService"));

// ... resto de variables ...
let localMusicService = null;
// ... (dentro de createWindow o setupIpcHandlers)


// Establecer el ID de la aplicación para que el Dock la reconozca
if (process.platform === "linux") {
  app.setName("jearcast");
  app.setAppUserModelId("jearcast");
}

let mainWindow = null;
let audioWindow = null; // Ventana oculta para el motor de audio
let downloadService = null;
// ...
function createAudioWindow() {
  audioWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  // Cargar un HTML simple que maneje el audio
  audioWindow.loadURL(`data:text/html,
    <html>
      <body>
        <script>
          const { ipcRenderer } = require('electron');
          let audio = new Audio();
          
          ipcRenderer.on('audio-control', (e, { action, data }) => {
            if (action === 'play') {
              audio.src = data.url;
              audio.volume = data.volume / 100;
              audio.play();
            } else if (action === 'stop') {
              audio.pause();
              audio.src = '';
            } else if (action === 'volume') {
              audio.volume = data.volume / 100;
            }
          });

          audio.ontimeupdate = () => {
            ipcRenderer.send('audio-status', {
              currentTime: audio.currentTime,
              duration: audio.duration,
              isPlaying: !audio.paused
            });
          };

          audio.onended = () => {
            ipcRenderer.send('audio-status', { isPlaying: false, ended: true });
          };
        </script>
      </body>
    </html>
  `);
}

let audioService = null;
let mprisService = null;
let youtubeSearchService = null;
let server = null;
let tray = null;
app.isQuiting = false;

// --- SEGURIDAD: Bloqueo de instancia única ---
const additionalData = { myKey: "jearcast-unique-lock" };
const gotTheLock = app.requestSingleInstanceLock(additionalData);

if (!gotTheLock) {
  console.log(
    "Ya hay una instancia de JearCast ejecutándose. Cerrando esta...",
  );
  app.quit();
} else {
  app.on(
    "second-instance",
    (event, commandLine, workingDirectory, additionalData) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    },
  );

  function startInternalServer() {
    if (server) return;
    const expressApp = express();
    const musicPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      "Descargas",
      "JearCast",
    );
    if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
    expressApp.use(
      express.static(
        path.join(app.getAppPath(), "src", "jearcast-view", "dist"),
      ),
    );

    expressApp.use(
      "/build",
      express.static(path.join(app.getAppPath(), "build")),
    );

    expressApp.use("/audio", express.static(musicPath));
    expressApp.use(express.json());
    server = expressApp.listen(3353, "127.0.0.1");
  }

  function createTray() {
    const iconPath = path.join(
      app.getAppPath(),
      "build",
      "icons-top",
      "32x32.png",
    );

    console.log("Intentando crear icono de bandeja en:", iconPath);

    if (!fs.existsSync(iconPath)) {
      console.error("❌ No se encontró el icono del tray en:", iconPath);
      return;
    }

    try {
      const trayIcon = nativeImage.createFromPath(iconPath);
      const finalIcon =
        process.platform === "linux"
          ? trayIcon.resize({ width: 22, height: 22 })
          : trayIcon;

      tray = new Tray(finalIcon);

      const contextMenu = Menu.buildFromTemplate([
        {
          label: "Mostrar JearCast",
          click: () => {
            const win = global.mainWindow;
            win?.show();
            win?.focus();
          },
        },
        { type: "separator" },
        {
          label: "Reproducir / Pausa",
          click: () => {
            console.log("Tray: Play/Pause clicked");
            global.mainWindow?.webContents.send(
              "media-key-pressed",
              "playpause",
            );
          },
        },
        {
          label: "Siguiente",
          click: () => {
            console.log("Tray: Next clicked");
            global.mainWindow?.webContents.send("media-key-pressed", "next");
          },
        },
        {
          label: "Anterior",
          click: () => {
            console.log("Tray: Prev clicked");
            global.mainWindow?.webContents.send("media-key-pressed", "prev");
          },
        },
        { type: "separator" },
        {
          label: "Salir",
          click: () => {
            app.isQuiting = true;
            app.quit();
          },
        },
      ]);

      tray.setToolTip("JearCast Player");
      tray.setContextMenu(contextMenu);

      tray.on("click", () => {
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
      { key: "F9", action: "next" },
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
      transparent: true,
      hasShadow: true,
      icon: iconPath,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        webSecurity: false,
        zoomFactor: 1.0,
      },
    });

    mainWindow.setMenuBarVisibility(false);

    global.mainWindow = mainWindow;
    mainWindow.loadURL("http://localhost:3353");

    // Vincular servicios que dependen de la ventana
    if (mprisService) mprisService.mainWindow = mainWindow;
    
    if (audioService) {
      audioService.removeAllListeners("ended"); // Evitar duplicados
      audioService.on("ended", () =>
        mainWindow?.webContents.send("audio-ended"),
      );
    }

    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.control && input.key === "+") {
        mainWindow.webContents.setZoomLevel(
          mainWindow.webContents.getZoomLevel() + 0.5,
        );
        event.preventDefault();
      }
      if (input.control && input.key === "-") {
        mainWindow.webContents.setZoomLevel(
          mainWindow.webContents.getZoomLevel() - 0.5,
        );
        event.preventDefault();
      }
      if (input.control && input.key === "0") {
        mainWindow.webContents.setZoomLevel(0);
        event.preventDefault();
      }
    });

    mainWindow.on("close", (event) => {
      if (!app.isQuiting) {
        event.preventDefault();
        mainWindow.hide();
      }
      return false;
    });
  }

  function setupIpcHandlers() {
    // ===== HANDLERS DE DESCARGA =====
    ipcMain.handle("get-video-info", (e, id) =>
      downloadService.getVideoInfo(id),
    );
    ipcMain.handle("download-audio", (e, a) =>
      downloadService.downloadAudio(
        a.videoId,
        a.title,
        a.quality,
        a.downloadId,
      ),
    );
    ipcMain.handle("cancel-download", (e, id) =>
      downloadService.cancelDownload(id),
    );

    // ===== HANDLERS DE AUDIO =====
    ipcMain.handle("audio-play", (e, data) => {
      if (!data || !data.path) return;
      if (data.eqSettings) audioService.updateEqualizer(data.eqSettings);
      return audioService.play(data.path);
    });
    ipcMain.handle("audio-stop", () => audioService.stopPlayback());
    ipcMain.handle("audio-volume", (e, v) => audioService.setVolume(v));
    ipcMain.handle("audio-eq", (e, s) => audioService.updateEqualizer(s));

    // Vincular eventos del servicio de audio con el frontend
    audioService.on("progress", (data) => {
      mainWindow?.webContents.send("audio-progress", data);
    });
    audioService.on("state-changed", (data) => {
      mainWindow?.webContents.send("audio-state-changed", data);
    });
    audioService.on("ended", () => {
      mainWindow?.webContents.send("audio-ended");
    });

    // ===== HANDLERS DE REPRODUCTOR =====
    ipcMain.on("player-state-change", (e, data) => {
      if (mprisService) {
        mprisService.updateMetadata(data);
        mprisService.updatePlaybackState(data.state);
        mprisService.updatePosition(data.position);
      }
    });

    ipcMain.handle("get-stream-url", async (event, source) => {
      try {
        if (!source) return null;

        // 1. Si es una ruta absoluta directa
        if (path.isAbsolute(source)) {
          return `local-media://get?path=${encodeURIComponent(source)}`;
        }

        // 2. Si es un ID local en base64 (generado por LocalMusicService)
        if (source.length > 20 && !source.includes("/") && !source.includes("\\")) {
          try {
            const decodedPath = Buffer.from(source, "base64").toString("utf8");
            if (path.isAbsolute(decodedPath) && fs.existsSync(decodedPath)) {
              return `local-media://get?path=${encodeURIComponent(decodedPath)}`;
            }
          } catch (e) {
            // No es base64 o no es ruta válida
          }
        }

        // 3. Si es un videoId de YouTube (11 caracteres normalmente)
        const { exec } = require("child_process");
        const ytdlpPath = downloadService?.ytdlpPath || "yt-dlp";
        return new Promise((resolve) => {
          const command = `"${ytdlpPath}" -f bestaudio -g "https://www.youtube.com/watch?v=${source}" --no-playlist`;
          exec(command, { timeout: 10000 }, (error, stdout) => {
            if (error) {
              resolve(null);
              return;
            }
            const url = stdout.trim();
            resolve(url || null);
          });
        });
      } catch (error) {
        console.error("Error:", error);
        return null;
      }
    });

    // ===== HANDLERS DE MÚSICA LOCAL =====
    ipcMain.handle("select-music-folder", async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
      });

      if (result.canceled || result.filePaths.length === 0) return null;

      const folderPath = result.filePaths[0];
      const musicFiles = await localMusicService.scanFolder(folderPath);
      return { folderPath, musicFiles };
    });

    ipcMain.handle("scan-music-folder", async (event, folderPath) => {
      return await localMusicService.scanFolder(folderPath);
    });

    ipcMain.handle("get-audio-metadata", async (event, filePath) => {
      return await localMusicService.getMetadata(filePath);
    });

    // ===== HANDLERS DE VENTANA =====
    ipcMain.on("window-minimize", () => mainWindow?.minimize());
    ipcMain.on("window-toggle-maximize", () => {
      if (mainWindow?.isMaximized()) mainWindow.unmaximize();
      else mainWindow?.maximize();
    });
    ipcMain.on("window-close", () => mainWindow?.close());

    // ===== HANDLERS DE YOUTUBE SEARCH =====
    ipcMain.handle("youtube-search", async (event, query) => {
      try {
        return await youtubeSearchService.search(query, 20);
      } catch (error) {
        console.error("Error en búsqueda:", error);
        return [];
      }
    });

    ipcMain.handle("youtube-search-more", async (event, query, limit) => {
      try {
        return await youtubeSearchService.search(query, limit || 50);
      } catch (error) {
        console.error("Error en búsqueda extendida:", error);
        return [];
      }
    });

    ipcMain.handle("youtube-video-info", async (event, videoId) => {
      try {
        return await youtubeSearchService.getVideoInfo(videoId);
      } catch (error) {
        console.error("Error obteniendo info:", error);
        return null;
      }
    });

    ipcMain.handle("youtube-related", async (event, videoId) => {
      try {
        return await youtubeSearchService.getRelatedVideos(videoId);
      } catch (error) {
        console.error("Error obteniendo relacionados:", error);
        return [];
      }
    });

    // ✅ BUSCAR CANALES
    ipcMain.handle("youtube-search-channels", async (event, artistName) => {
      try {
        return await youtubeSearchService.searchChannels(artistName);
      } catch (error) {
        console.error("Error buscando canales:", error);
        return [];
      }
    });

    // ✅ THUMBNAIL DE CANAL
    ipcMain.handle("youtube-channel-thumbnail", async (event, channelId) => {
      try {
        return await youtubeSearchService.getChannelThumbnail(channelId);
      } catch (error) {
        console.error("Error obteniendo thumbnail:", error);
        return null;
      }
    });

    // ✅ INFO DE CANAL (SOLO UNA VEZ)
    ipcMain.handle("youtube-channel-info", async (event, channelId) => {
      try {
        return await youtubeSearchService.getChannelInfo(channelId);
      } catch (error) {
        console.error("Error obteniendo info del canal:", error);
        return null;
      }
    });

    // ✅ MÚLTIPLES CANALES EN LOTE
    ipcMain.handle("youtube-channels-info", async (event, channelIds) => {
      try {
        return await youtubeSearchService.getChannelsInfo(channelIds);
      } catch (error) {
        console.error("Error obteniendo canales en lote:", error);
        return [];
      }
    });
  }

  app.whenReady().then(() => {
    // Inicializar servicios globales
    if (!mprisService) mprisService = new MPRISService(null);
    if (!downloadService) downloadService = new DownloadService();
    if (!youtubeSearchService) youtubeSearchService = new YouTubeSearchService();
    if (!localMusicService) localMusicService = new LocalMusicService();
    if (!audioService) audioService = new AudioService();

    createAudioWindow(); // Crear motor de audio oculto
    audioService.setWindow(audioWindow);

    // Reenviar estados del motor de audio hacia el frontend
    ipcMain.on('audio-status', (e, data) => {
      if (data.ended) {
        audioService.emit('ended');
      } else {
        audioService.emit('progress', data);
      }
    });

    // Registrar el manejador del protocolo local-media
    protocol.handle("local-media", (request) => {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.searchParams.get("path"));
      
      // Seguridad: Verificar que el archivo existe y es una ruta absoluta
      if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
        return net.fetch(`file://${filePath}`);
      }
      
      return new Response("Archivo no encontrado", { status: 404 });
    });

    Menu.setApplicationMenu(null);
    startInternalServer();
    setupIpcHandlers();
    createWindow();
    createTray();
    setupMediaKeys();

    // El caché ahora es persistente durante toda la sesión.
    // Solo se limpia si el usuario reinicia la app o si implementamos un botón de 'Refrescar'.
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (audioService) audioService.stopPlayback();
    if (server) server.close();
  });
}
