// src/services/MPRISService.js
const { EventEmitter } = require("events");
const { app } = require("electron");

class MPRISService extends EventEmitter {
  constructor(mainWindow) {
    super();
    this.mainWindow = mainWindow;
    this.playbackState = "Stopped";
    this.metadata = {};
    this.currentPosition = 0;
    this.duration = 0;
    this.sessionBus = null;
    this.interfaceName = "org.mpris.MediaPlayer2.Player";
    this.objectPath = "/org/mpris/MediaPlayer2";
    this.isOnlinePlayback = false;
    // Referencia al interface exportado, necesaria para emitir señales
    this.playerInterface = null;

    setTimeout(() => {
      this.setupMPRIS();
    }, 1000);
  }

  setupMPRIS() {
    try {
      const dbus = require("dbus-native");
      this.sessionBus = dbus.sessionBus();

      const serviceName = "org.mpris.MediaPlayer2.com.jearcast.JearCast";
      const objectPath = "/org/mpris/MediaPlayer2";

      const serviceObject = {
        "org.mpris.MediaPlayer2": {
          Raise: () => {
            console.log("MPRIS: Raise");
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.show();
              this.mainWindow.focus();
            }
          },
          Quit: () => {
            console.log("MPRIS: Quit");
            app.quit();
          },
          CanQuit: true,
          CanRaise: true,
          HasTrackList: false,
          Identity: "JearCast Player",
          // CRÍTICO: debe coincidir exactamente con el nombre del .desktop sin extensión
          DesktopEntry: "com.jearcast.JearCast",
          SupportedUriSchemes: ["file", "http", "https"],
          SupportedMimeTypes: ["audio/mpeg", "audio/x-mp3", "audio/flac"],
        },
        "org.mpris.MediaPlayer2.Player": {
          Next: () => {
            console.log("MPRIS: Next");
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("media-key-pressed", "next");
            }
          },
          Previous: () => {
            console.log("MPRIS: Previous");
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("media-key-pressed", "prev");
            }
          },
          PlayPause: () => {
            console.log("MPRIS: PlayPause");
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("media-key-pressed", "playpause");
            }
          },
          Play: () => {
            console.log("MPRIS: Play");
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("media-key-pressed", "play");
            }
          },
          Pause: () => {
            console.log("MPRIS: Pause");
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("media-key-pressed", "pause");
            }
          },
          Stop: () => {
            console.log("MPRIS: Stop");
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("media-key-pressed", "stop");
            }
          },
          GetPosition: () => {
            // Retorna microsegundos como Int64
            return Math.floor(this.currentPosition * 1000000);
          },
          Seek: (offset) => {
            const newPosition = Math.max(
              0,
              Math.min(
                this.duration,
                this.currentPosition + offset / 1000000,
              ),
            );
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("seek-to", newPosition);
            }
          },
          SetPosition: (trackId, position) => {
            const newPosition = Math.min(this.duration, position / 1000000);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("seek-to", newPosition);
            }
          },
          OpenUri: (uri) => {
            console.log("MPRIS: OpenUri:", uri);
          },
        },
      };

      const playerProps = serviceObject["org.mpris.MediaPlayer2.Player"];

      Object.defineProperties(playerProps, {
        PlaybackStatus: { get: () => this.playbackState, enumerable: true },
        Metadata:       { get: () => this.metadata,      enumerable: true },
        CanGoNext:      { get: () => true,               enumerable: true },
        CanGoPrevious:  { get: () => true,               enumerable: true },
        CanPlay:        { get: () => true,               enumerable: true },
        CanPause:       { get: () => true,               enumerable: true },
        CanSeek:        { get: () => true,               enumerable: true },
        Volume:         { get: () => 1.0, set: () => {}, enumerable: true },
      });

      this.sessionBus.requestName(serviceName, 0x4, (err, ret) => {
        if (err) {
          console.error("Error registrando MPRIS:", err);
          return;
        }

        this.sessionBus.exportInterface(
          serviceObject["org.mpris.MediaPlayer2"],
          objectPath,
          "org.mpris.MediaPlayer2",
        );

        this.sessionBus.exportInterface(
          serviceObject["org.mpris.MediaPlayer2.Player"],
          objectPath,
          "org.mpris.MediaPlayer2.Player",
        );

        // ✅ Guardar referencia al interface del player para emitir señales
        this.playerInterface = serviceObject["org.mpris.MediaPlayer2.Player"];

        // Emitir estado inicial para que GNOME Shell registre el player
        this._emitPropertiesChanged({
          PlaybackStatus: ["s", "Stopped"],
          CanPlay:        ["b", true],
          CanPause:       ["b", true],
          CanGoNext:      ["b", true],
          CanGoPrevious:  ["b", true],
          CanSeek:        ["b", true],
        });

        console.log("MPRIS: Servicio registrado correctamente bajo " + serviceName);
      });
    } catch (error) {
      console.error("Error configurando MPRIS:", error);
    }
  }

  // ✅ CORRECCIÓN PRINCIPAL: emite PropertiesChanged al bus D-Bus
  // Sin esto, GNOME Shell nunca sabe que cambió el estado → icono roto
  _emitPropertiesChanged(changedProps) {
    if (!this.sessionBus || !this.playerInterface) return;
    try {
      this.sessionBus.emit(
        this.objectPath,                          // ruta del objeto
        "org.freedesktop.DBus.Properties",        // interfaz de la señal
        "PropertiesChanged",                      // nombre de la señal
        "sa{sv}as",                               // firma D-Bus
        [this.interfaceName, changedProps, []],   // [interfaz, props, invalidadas]
      );
    } catch (e) {
      console.error("MPRIS: Error emitiendo PropertiesChanged:", e);
    }
  }

  // ✅ CORREGIDO: ahora notifica al bus después de cada cambio de estado
  updatePlaybackState(state) {
    const map = { playing: "Playing", paused: "Paused", stopped: "Stopped" };
    const newState = map[state] ?? "Stopped";
    if (this.playbackState === newState) return;
    this.playbackState = newState;

    this._emitPropertiesChanged({
      PlaybackStatus: ["s", newState],
    });
  }

  // ✅ CORREGIDO: tipos D-Bus explícitos para cada campo
  // dbus-native necesita tuplas ['tipo', valor] para tipos no-string
  updateMetadata({ title, artist, thumbnail, duration }) {
    this.duration = duration || 0;

    // Fallback al icono instalado si no hay miniatura
    const artUrl =
      thumbnail && thumbnail.trim() !== ""
        ? thumbnail
        : "file:///app/share/icons/hicolor/256x256/apps/com.jearcast.JearCast.png";

    this.metadata = {
      // 'o' = ObjectPath  (REQUERIDO por la especificación MPRIS)
      "mpris:trackid": ["o", `/com/jearcast/track/${Date.now()}`],
      // 'x' = Int64 en microsegundos  (número JS puede truncarse sin esto)
      "mpris:length":  ["x", Math.floor((duration || 0) * 1000000)],
      // 's' = string
      "mpris:artUrl":  ["s", artUrl],
      "xesam:title":   ["s", title  || "Desconocido"],
      "xesam:album":   ["s", "JearCast Player"],
      // 'as' = array de strings
      "xesam:artist":  ["as", [artist || "Artista desconocido"]],
    };

    // ✅ Notifica al bus — GNOME Shell actualiza título, artista y miniatura
    this._emitPropertiesChanged({
      Metadata: ["a{sv}", this.metadata],
    });
  }

  updatePosition(position) {
    this.currentPosition = position || 0;
  }

  setPlaybackType(isOnline) {
    this.isOnlinePlayback = isOnline;
  }
}

module.exports = { MPRISService };