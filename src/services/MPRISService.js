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
    this.sessionBus = null;
    this.isOnlinePlayback = false; // Nuevo: para saber si es online o local
    
    setTimeout(() => {
      this.setupMPRIS();
    }, 1000);
  }

  setupMPRIS() {
    try {
      const dbus = require('dbus-native');
      this.sessionBus = dbus.sessionBus();
      
      const serviceName = 'org.mpris.MediaPlayer2.jearcast';
      const objectPath = '/org/mpris/MediaPlayer2';
      
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
          SupportedUriSchemes: ['file', 'http', 'https'],
          SupportedMimeTypes: ['audio/mpeg', 'audio/x-mp3', 'audio/flac']
        },
        'org.mpris.MediaPlayer2.Player': {
          Next: () => {
            console.log('MPRIS: Next');
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              // Enviar evento para next - funciona para online y local
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
      
      const playerProps = serviceObject['org.mpris.MediaPlayer2.Player'];
      
      Object.defineProperties(playerProps, {
        'PlaybackStatus': { get: () => this.playbackState, enumerable: true },
        'Metadata': { get: () => this.metadata, enumerable: true },
        'CanGoNext': { get: () => true, enumerable: true },
        'CanGoPrevious': { get: () => true, enumerable: true },
        'CanPlay': { get: () => true, enumerable: true },
        'CanPause': { get: () => true, enumerable: true },
        'CanSeek': { get: () => true, enumerable: true },
        'Volume': { get: () => 1.0, set: (vol) => {}, enumerable: true }
      });
      
      this.sessionBus.requestName(serviceName, 0x4, (err, ret) => {
        if (err) {
          console.error('Error registrando MPRIS:', err);
          return;
        }
        
        this.sessionBus.exportInterface(serviceObject['org.mpris.MediaPlayer2'], objectPath, 'org.mpris.MediaPlayer2');
        this.sessionBus.exportInterface(serviceObject['org.mpris.MediaPlayer2.Player'], objectPath, 'org.mpris.MediaPlayer2.Player');
        
        this.updatePlaybackState('Stopped');
        console.log('MPRIS: Servicio registrado correctamente');
      });
      
    } catch (error) {
      console.error('Error configurando MPRIS:', error);
    }
  }
  
  updatePlaybackState(state) {
    const newState = state === 'playing' ? 'Playing' : state === 'paused' ? 'Paused' : 'Stopped';
    
    if (this.playbackState !== newState) {
      this.playbackState = newState;
      console.log('MPRIS: PlaybackStatus ->', newState);
    }
  }
 
  updateMetadata({ title, artist, thumbnail, duration }) {
    this.duration = duration || 0;
    this.metadata = {
      'xesam:title': title || 'Desconocido',
      'xesam:artist': [artist || 'Artista Desconocido'],
      'xesam:album': 'JearCast Player',
      'xesam:trackid': `/com/jearcast/track/${Date.now()}`,
      'mpris:length': (duration || 0) * 1000000,
      'mpris:artUrl': thumbnail || ''
    };
    
    console.log('MPRIS: Metadata actualizada:', title);
  }

  updatePosition(position) {
    this.currentPosition = position || 0;
  }
  
  // Método para indicar si es reproducción online
  setPlaybackType(isOnline) {
    this.isOnlinePlayback = isOnline;
  }
}

module.exports = { MPRISService };