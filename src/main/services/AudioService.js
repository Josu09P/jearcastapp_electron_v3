const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { app } = require('electron');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

class AudioService extends EventEmitter {
    constructor() {
        super();
        this.currentTrack = null;
        this.isPlaying = false;
        this.volume = 1.0; 
        this.eqSettings = {
            bass: 0,      
            mid: 0,       
            treble: 0,    
            noiseReduction: false
        };
        this.audioProcess = null;
        
        // Configurar ruta de FFmpeg
        this.ffmpegPath = app.isPackaged 
            ? ffmpegInstaller.path.replace('app.asar', 'app.asar.unpacked')
            : ffmpegInstaller.path;

        // ffplay suele estar en la misma carpeta que ffmpeg en instalaciones completas
        // Si no, se asume que está en el PATH
        const ffmpegDir = path.dirname(this.ffmpegPath);
        this.ffplayPath = path.join(ffmpegDir, process.platform === 'win32' ? 'ffplay.exe' : 'ffplay');
        
        if (!fs.existsSync(this.ffplayPath)) {
            this.ffplayPath = 'ffplay'; // Intentar usar el del sistema
        }
        
        console.log('🎵 AudioService: ffplay path ->', this.ffplayPath);
    }

    stopPlayback() {
        if (this.audioProcess) {
            try {
                if (process.platform === 'linux') {
                    exec(`kill -9 -${this.audioProcess.pid}`, () => {});
                } else {
                    this.audioProcess.kill('SIGKILL');
                }
            } catch (e) {
                this.audioProcess.kill();
            }
            this.audioProcess = null;
        }
        this.isPlaying = false;
        console.log('⏹️ Audio detenido');
    }

    async playWithEqualizer(audioPath, eqSettings = null) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(audioPath)) {
                return reject(new Error('Archivo no encontrado'));
            }
            
            this.stopPlayback();
            const settings = eqSettings || this.eqSettings;
            const filters = [];
            
            if (settings.bass !== 0) filters.push(`equalizer=f=100:width_type=h:width=100:g=${settings.bass}`);
            if (settings.mid !== 0) filters.push(`equalizer=f=1000:width_type=h:width=500:g=${settings.mid}`);
            if (settings.treble !== 0) filters.push(`equalizer=f=8000:width_type=h:width=2000:g=${settings.treble}`);
            if (settings.noiseReduction) filters.push('afftdn=nf=-25:tn=0:nt=0');
            
            const filterComplex = filters.join(',');
            const vol = Math.round(this.volume * 100);
            
            let command = `"${this.ffplayPath}" -nodisp -autoexit -volume ${vol}`;
            if (filterComplex) command += ` -af "${filterComplex}"`;
            command += ` "${audioPath}"`;
            
            this.audioProcess = exec(command, (error) => {
                if (error && !error.killed) {
                    console.error('Error ffplay:', error);
                }
                this.isPlaying = false;
                this.emit('ended');
                resolve();
            });

            this.isPlaying = true;
            this.currentTrack = audioPath;
        });
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(100, volume)) / 100;
        // Reiniciar si está reproduciendo para aplicar volumen (ffplay limitation)
        if (this.isPlaying && this.currentTrack) {
            this.playWithEqualizer(this.currentTrack);
        }
    }

    updateEqualizer(settings) {
        this.eqSettings = { ...this.eqSettings, ...settings };
        if (this.isPlaying && this.currentTrack) {
            this.playWithEqualizer(this.currentTrack);
        }
    }
}

module.exports = { AudioService };