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
    this._busName = "org.mpris.MediaPlayer2.com.jearcast.JearCast";
    this._serial = 1;

    setTimeout(() => {
      this.setupMPRIS();
    }, 1000);
  }

  setupMPRIS() {
    try {
      const dbus = require("dbus-native");
      this.sessionBus = dbus.sessionBus();

      const serviceName = this._busName;
      const objectPath = this.objectPath;

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
            return Math.floor(this.currentPosition * 1000000);
          },
          Seek: (offset) => {
            const newPosition = Math.max(
              0,
              Math.min(this.duration, this.currentPosition + offset / 1000000),
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

        console.log("MPRIS: Servicio registrado correctamente bajo " + serviceName);

        // Emitir estado inicial para que GNOME Shell registre el player
        this._emitPropertiesChanged({
          PlaybackStatus: ["s", "Stopped"],
          CanPlay:        ["b", true],
          CanPause:       ["b", true],
          CanGoNext:      ["b", true],
          CanGoPrevious:  ["b", true],
          CanSeek:        ["b", true],
        });
      });
    } catch (error) {
      console.error("Error configurando MPRIS:", error);
    }
  }

  // ✅ CORRECCIÓN: dbus-native NO tiene sessionBus.emit()
  // La señal se construye como mensaje raw y se envía por la conexión interna.
  // dbus-native expone la conexión TCP/Unix como sessionBus.connection
  _emitPropertiesChanged(changedProps) {
    if (!this.sessionBus) return;

    try {
      // dbus-native almacena la conexión real en .connection
      const conn = this.sessionBus.connection;

      if (!conn || typeof conn.message !== "function") {
        console.warn("MPRIS: Conexión D-Bus no disponible aún");
        return;
      }

      // Mensaje de señal D-Bus tipo 4 (SIGNAL)
      // Firma: sa{sv}as
      //   s      → nombre de la interfaz que cambió
      //   a{sv}  → dict con las propiedades nuevas
      //   as     → array de propiedades invalidadas (vacío)
      conn.message({
        type: 4,
        serial: this._serial++,
        path: this.objectPath,
        interface: "org.freedesktop.DBus.Properties",
        member: "PropertiesChanged",
        signature: "sa{sv}as",
        body: [
          this.interfaceName,
          changedProps,
          [],
        ],
      });

      console.log("MPRIS: PropertiesChanged →", Object.keys(changedProps).join(", "));
    } catch (e) {
      console.error("MPRIS: Error emitiendo PropertiesChanged:", e.message);
    }
  }

  // ✅ Notifica a D-Bus tras cada cambio de estado
  updatePlaybackState(state) {
    const map = { playing: "Playing", paused: "Paused", stopped: "Stopped" };
    const newState = map[state] ?? "Stopped";
    if (this.playbackState === newState) return;
    this.playbackState = newState;

    this._emitPropertiesChanged({
      PlaybackStatus: ["s", newState],
    });
  }

  // ✅ Tipos D-Bus explícitos + notificación al bus
  updateMetadata({ title, artist, thumbnail, duration }) {
    this.duration = duration || 0;

    const artUrl =
      thumbnail && thumbnail.trim() !== ""
        ? thumbnail
        : "file:///app/share/icons/hicolor/256x256/apps/com.jearcast.JearCast.png";

    this.metadata = {
      "mpris:trackid": ["o", `/com/jearcast/track/${Date.now()}`],
      "mpris:length":  ["x", Math.floor((duration || 0) * 1000000)],
      "mpris:artUrl":  ["s", artUrl],
      "xesam:title":   ["s", title  || "Desconocido"],
      "xesam:album":   ["s", "JearCast Player"],
      "xesam:artist":  ["as", [artist || "Artista desconocido"]],
    };

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