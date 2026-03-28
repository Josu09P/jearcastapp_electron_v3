// src/services/MPRISService.js
const { EventEmitter } = require('events');
const { app } = require('electron');  // ← IMPORTANTE: Importar app

class MPRISService extends EventEmitter {
  constructor(mainWindow) {
    super();
    this.mainWindow = mainWindow;
    this.playbackState = 'Stopped';
    this.metadata = {};
    this.currentPosition = 0;
    this.duration = 0;
    
    // Pequeño delay para asegurar que D-Bus está listo
    setTimeout(() => {
      this.setupMPRIS();
    }, 100);
  }

  setupMPRIS() {
    try {
      // Registrar el servicio MPRIS
      const dbus = require('dbus-native');
      const sessionBus = dbus.sessionBus();
      
      const serviceName = 'org.mpris.MediaPlayer2.jearcast';
      const objectPath = '/org/mpris/MediaPlayer2';
      const interfaceName = 'org.mpris.MediaPlayer2';
      const playerInterface = 'org.mpris.MediaPlayer2.Player';
      
      sessionBus.requestName(serviceName, 0x4, (err, ret) => {
        if (err) {
          console.error('Error registrando MPRIS:', err);
          return;
        }
        console.log('MPRIS service registrado:', serviceName);
      });
      
      // Exponer interfaces
      const serviceObject = {
        'org.mpris.MediaPlayer2': {
          Raise: () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.show();
              this.mainWindow.focus();
            }
          },
          Quit: () => {
            app.quit();  // ← Ahora app está definida
          },
          CanQuit: true,
          CanRaise: true,
          HasTrackList: false,
          Identity: 'JearCast Music Player',
          DesktopEntry: 'com.jearcast.JearCast',
          SupportedUriSchemes: ['file'],
          SupportedMimeTypes: ['audio/mpeg', 'audio/x-mp3', 'audio/flac']
        },
        'org.mpris.MediaPlayer2.Player': {
          Next: () => {
            console.log('MPRIS: Next');
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('media-key-pressed', 'next');
            }
          },
          Previous: () => {
            console.log('MPRIS: Previous');
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('media-key-pressed', 'prev');
            }
          },
          PlayPause: () => {
            console.log('MPRIS: PlayPause');
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('media-key-pressed', 'playpause');
            }
          },
          Play: () => {
            console.log('MPRIS: Play');
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('media-key-pressed', 'play');
            }
          },
          Pause: () => {
            console.log('MPRIS: Pause');
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('media-key-pressed', 'pause');
            }
          },
          Stop: () => {
            console.log('MPRIS: Stop');
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('media-key-pressed', 'stop');
            }
          },
          GetPosition: () => {
            return this.currentPosition * 1000000;
          },
          Position: () => {
            return this.currentPosition * 1000000;
          },
          Seek: (offset) => {
            const newPosition = Math.max(0, Math.min(this.duration, this.currentPosition + offset / 1000000));
            console.log('MPRIS: Seek to', newPosition);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('seek-to', newPosition);
            }
          },
          SetPosition: (trackId, position) => {
            const newPosition = Math.min(this.duration, position / 1000000);
            console.log('MPRIS: SetPosition to', newPosition);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('seek-to', newPosition);
            }
          },
          OpenUri: (uri) => {
            console.log('MPRIS: OpenUri:', uri);
          }
        }
      };
      
      // Propiedades con getters
      Object.defineProperty(serviceObject['org.mpris.MediaPlayer2.Player'], 'PlaybackStatus', {
        get: () => this.playbackState
      });
      
      Object.defineProperty(serviceObject['org.mpris.MediaPlayer2.Player'], 'Metadata', {
        get: () => this.metadata
      });
      
      Object.defineProperty(serviceObject['org.mpris.MediaPlayer2.Player'], 'CanGoNext', {
        get: () => true
      });
      
      Object.defineProperty(serviceObject['org.mpris.MediaPlayer2.Player'], 'CanGoPrevious', {
        get: () => true
      });
      
      Object.defineProperty(serviceObject['org.mpris.MediaPlayer2.Player'], 'CanPlay', {
        get: () => true
      });
      
      Object.defineProperty(serviceObject['org.mpris.MediaPlayer2.Player'], 'CanPause', {
        get: () => true
      });
      
      Object.defineProperty(serviceObject['org.mpris.MediaPlayer2.Player'], 'CanSeek', {
        get: () => true
      });
      
      // Exportar el objeto al bus D-Bus
      sessionBus.exportInterface(serviceObject['org.mpris.MediaPlayer2'], objectPath, interfaceName);
      sessionBus.exportInterface(serviceObject['org.mpris.MediaPlayer2.Player'], objectPath, playerInterface);
      
      console.log('MPRIS interfaces exportadas correctamente');
    } catch (error) {
      console.error('Error configurando MPRIS:', error);
    }
  }
  
  updatePlaybackState(state) {
    const newState = state === 'playing' ? 'Playing' : state === 'paused' ? 'Paused' : 'Stopped';
    if (this.playbackState !== newState) {
      this.playbackState = newState;
      console.log('MPRIS: PlaybackState cambiado a', newState);
      this.emit('property-changed', 'PlaybackStatus', newState);
    }
  }
  
  updateMetadata({ title, artist, thumbnail, duration }) {
    this.duration = duration || 0;
    const newMetadata = {
      'xesam:title': title || '',
      'xesam:artist': [artist || 'Unknown'],
      'xesam:album': 'JearCast Player',
      'xesam:trackid': `/com/jearcast/track/${Date.now()}`,
      'mpris:length': (duration || 0) * 1000000,
      'mpris:artUrl': thumbnail || ''
    };
    
    this.metadata = newMetadata;
    console.log('MPRIS: Metadata actualizada:', title);
    this.emit('property-changed', 'Metadata', newMetadata);
  }
  
  updatePosition(position) {
    this.currentPosition = position || 0;
    // No emitir cada posición para no saturar
    // this.emit('property-changed', 'Position', position * 1000000);
  }
}

module.exports = { MPRISService };