// src/services/MPRISService.js
const { EventEmitter } = require('events');
const { app } = require('electron');

class MPRISService extends EventEmitter {
  constructor(mainWindow) {
    super();
    this.mainWindow = mainWindow;
    this.playbackState = 'Stopped';
    this.metadata = {};
    this.currentPosition = 0;
    this.duration = 0;
    
    setTimeout(() => {
      this.setupMPRIS();
    }, 500); // Aumentar delay para asegurar que todo está listo
  }

  setupMPRIS() {
    try {
      const dbus = require('dbus-native');
      const sessionBus = dbus.sessionBus();
      
      const serviceName = 'org.mpris.MediaPlayer2.jearcast';
      const objectPath = '/org/mpris/MediaPlayer2';
      
      // Crear el objeto de servicio
      const serviceObject = {
        'org.mpris.MediaPlayer2': {
          Raise: () => {
            console.log('MPRIS: Raise');
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.show();
              this.mainWindow.focus();
            }
          },
          Quit: () => {
            console.log('MPRIS: Quit');
            app.quit();
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
      
      // Añadir propiedades dinámicas
      const playerProps = serviceObject['org.mpris.MediaPlayer2.Player'];
      
      Object.defineProperty(playerProps, 'PlaybackStatus', {
        get: () => this.playbackState,
        enumerable: true
      });
      
      Object.defineProperty(playerProps, 'Metadata', {
        get: () => this.metadata,
        enumerable: true
      });
      
      Object.defineProperty(playerProps, 'CanGoNext', {
        get: () => true,
        enumerable: true
      });
      
      Object.defineProperty(playerProps, 'CanGoPrevious', {
        get: () => true,
        enumerable: true
      });
      
      Object.defineProperty(playerProps, 'CanPlay', {
        get: () => true,
        enumerable: true
      });
      
      Object.defineProperty(playerProps, 'CanPause', {
        get: () => true,
        enumerable: true
      });
      
      Object.defineProperty(playerProps, 'CanSeek', {
        get: () => true,
        enumerable: true
      });
      
      Object.defineProperty(playerProps, 'Volume', {
        get: () => 1.0,
        set: (vol) => {},
        enumerable: true
      });
      
      // Registrar el nombre en el bus
      sessionBus.requestName(serviceName, 0x4, (err, ret) => {
        if (err) {
          console.error('Error registrando MPRIS:', err);
          return;
        }
        console.log('MPRIS service registrado:', serviceName);
        
        // Exportar interfaces DESPUÉS de registrar el nombre
        sessionBus.exportInterface(serviceObject['org.mpris.MediaPlayer2'], objectPath, 'org.mpris.MediaPlayer2');
        sessionBus.exportInterface(serviceObject['org.mpris.MediaPlayer2.Player'], objectPath, 'org.mpris.MediaPlayer2.Player');
        
        console.log('MPRIS interfaces exportadas correctamente');
      });
      
    } catch (error) {
      console.error('Error configurando MPRIS:', error);
    }
  }
  
  updatePlaybackState(state) {
    const newState = state === 'playing' ? 'Playing' : state === 'paused' ? 'Paused' : 'Stopped';
    if (this.playbackState !== newState) {
      this.playbackState = newState;
      console.log('MPRIS: PlaybackState ->', newState);
      // Emitir cambio de propiedad si es necesario
    }
  }
  
  updateMetadata({ title, artist, thumbnail, duration }) {
    this.duration = duration || 0;
    this.metadata = {
      'xesam:title': title || '',
      'xesam:artist': [artist || 'Unknown'],
      'xesam:album': 'JearCast Player',
      'xesam:trackid': `/com/jearcast/track/${Date.now()}`,
      'mpris:length': (duration || 0) * 1000000,
      'mpris:artUrl': thumbnail || ''
    };
    console.log('MPRIS: Metadata actualizada -', title);
  }
  
  updatePosition(position) {
    this.currentPosition = position || 0;
  }
}

module.exports = { MPRISService };