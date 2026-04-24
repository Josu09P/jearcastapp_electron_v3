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
    
    setTimeout(() => this.setupMPRIS(), 1000);
  }

  setupMPRIS() {
    try {
      const dbus = require('dbus-native');
      const sessionBus = dbus.sessionBus();
      if (!sessionBus) return;

      const serviceName = 'org.mpris.MediaPlayer2.JearCast';
      const objectPath = '/org/mpris/MediaPlayer2';
      
      const serviceObject = {
        'org.mpris.MediaPlayer2': {
          Raise: () => {
            const win = global.mainWindow;
            if (win) {
              win.show();
              win.focus();
            }
          },
          Quit: () => app.quit(),
          CanQuit: true,
          CanRaise: true,
          HasTrackList: false,
          Identity: 'JearCast Player',
          DesktopEntry: 'jearcast',
          SupportedUriSchemes: ['file', 'http', 'https'],
          SupportedMimeTypes: ['audio/mpeg', 'audio/x-mp3', 'audio/flac']
        },
        'org.mpris.MediaPlayer2.Player': {
          Next: () => this.sendToUI('next'),
          Previous: () => this.sendToUI('prev'),
          PlayPause: () => this.sendToUI('playpause'),
          Play: () => this.sendToUI('play'),
          Pause: () => this.sendToUI('pause'),
          Stop: () => this.sendToUI('stop'),
          GetPosition: () => this.currentPosition * 1000000,
          Seek: (offset) => {
            const newPos = Math.max(0, Math.min(this.duration, this.currentPosition + offset / 1000000));
            const win = global.mainWindow;
            win?.webContents.send('seek-to', newPos);
          },
          SetPosition: (id, pos) => {
            const win = global.mainWindow;
            win?.webContents.send('seek-to', pos / 1000000);
          },
          OpenUri: (uri) => {}
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
        'Volume': { get: () => 1.0, set: () => {}, enumerable: true }
      });
      
      sessionBus.requestName(serviceName, 0x4, (err) => {
        if (err) {
          console.error('❌ MPRIS: No se pudo registrar el nombre:', err);
          return;
        }
        sessionBus.exportInterface(serviceObject['org.mpris.MediaPlayer2'], objectPath, 'org.mpris.MediaPlayer2');
        sessionBus.exportInterface(serviceObject['org.mpris.MediaPlayer2.Player'], objectPath, 'org.mpris.MediaPlayer2.Player');
        console.log('✅ MPRIS: Registrado como', serviceName);
      });
      
    } catch (error) {
      console.error('Error MPRIS:', error);
    }
  }

  sendToUI(action) {
    const win = global.mainWindow;
    if (win && !win.isDestroyed()) {
      console.log(`📡 MPRIS -> UI: ${action}`);
      win.webContents.send('media-key-pressed', action);
    } else {
      console.warn('⚠️ MPRIS: Intento de enviar acción pero la ventana no existe');
    }
  }
  
  updatePlaybackState(state) {
    this.playbackState = state === 'playing' ? 'Playing' : state === 'paused' ? 'Paused' : 'Stopped';
  }
 
  updateMetadata({ title, artist, thumbnail, duration }) {
    this.duration = duration || 0;
    this.metadata = {
      'xesam:title': title || 'JearCast',
      'xesam:artist': [artist || 'Artista'],
      'xesam:album': 'JearCast Player',
      'xesam:trackid': `/com/jearcast/track/${Date.now()}`,
      'mpris:length': (duration || 0) * 1000000,
      'mpris:artUrl': thumbnail || ''
    };
  }

  updatePosition(position) {
    this.currentPosition = position || 0;
  }
}

module.exports = { MPRISService };
