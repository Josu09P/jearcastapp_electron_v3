const { EventEmitter } = require('events');

class AudioService extends EventEmitter {
    constructor() {
        super();
        this.currentTrack = null;
        this.isPlaying = false;
        this.volume = 100;
        this.audioWindow = null; // Se asignará desde main.js
        console.log('🎵 AudioService: Motor WebAudio (Hidden Window) listo');
    }

    setWindow(win) {
        this.audioWindow = win;
    }

    stopPlayback() {
        if (this.audioWindow) {
            this.audioWindow.webContents.send('audio-control', { action: 'stop' });
        }
        this.isPlaying = false;
        this.emit('state-changed', { isPlaying: false, currentTime: 0 });
        console.log('⏹️ Audio local detenido');
    }

    async play(audioPath) {
        if (!this.audioWindow) {
            console.error("Motor de audio no inicializado");
            return;
        }

        this.currentTrack = audioPath;
        // Convertir ruta local a URL del protocolo que creamos
        const audioUrl = `local-media://get?path=${encodeURIComponent(audioPath)}`;
        
        this.audioWindow.webContents.send('audio-control', { 
            action: 'play', 
            data: { url: audioUrl, volume: this.volume } 
        });
        
        this.isPlaying = true;
        this.emit('state-changed', { isPlaying: true, path: audioPath });
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(100, vol));
        if (this.audioWindow) {
            this.audioWindow.webContents.send('audio-control', { 
                action: 'volume', 
                data: { volume: this.volume } 
            });
        }
    }

    // El ecualizador se puede implementar luego con WebAudio si lo necesitas,
    // por ahora nos enfocamos en que suene.
    updateEqualizer(settings) {
        console.log("Ecualizador local: Pendiente de implementación en WebAudio");
    }
}

module.exports = { AudioService };
