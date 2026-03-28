// src/services/AudioService.js
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

class AudioService extends EventEmitter {
    constructor() {
        super();
        this.currentTrack = null;
        this.isPlaying = false;
        this.volume = 1.0; // 0-1
        this.eqSettings = {
            bass: 0,      // dB (-12 a 12)
            mid: 0,       // dB (-12 a 12)
            treble: 0,    // dB (-12 a 12)
            noiseReduction: false
        };
        this.audioProcess = null;
        this.ffmpegProcess = null;
        
        // Configurar rutas para herramientas
        this.ffmpegPath = path.join(__dirname, '..', '..', 'bin', 'ffmpeg');
        this.ffplayPath = path.join(__dirname, '..', '..', 'bin', 'ffplay');
        
        console.log('🎵 AudioService inicializado');
    }

    /**
     * Aplicar ecualización a un archivo de audio usando ffmpeg
     * @param {string} inputPath - Ruta del archivo original
     * @param {string} outputPath - Ruta del archivo procesado
     * @param {Object} eqSettings - Configuración del ecualizador
     */
    async applyEqualizer(inputPath, outputPath, eqSettings = null) {
        const settings = eqSettings || this.eqSettings;
        
        // Construir filtro de ecualización para ffmpeg
        // Usando el filtro "equalizer" para bandas específicas
        const filters = [];
        
        // Banda de bajos (100 Hz)
        if (settings.bass !== 0) {
            const gain = settings.bass;
            filters.push(`equalizer=f=100:width_type=h:width=100:g=${gain}`);
        }
        
        // Banda de medios (1000 Hz)
        if (settings.mid !== 0) {
            const gain = settings.mid;
            filters.push(`equalizer=f=1000:width_type=h:width=500:g=${gain}`);
        }
        
        // Banda de agudos (8000 Hz)
        if (settings.treble !== 0) {
            const gain = settings.treble;
            filters.push(`equalizer=f=8000:width_type=h:width=2000:g=${gain}`);
        }
        
        // Reducción de ruido (filtro de suavizado)
        if (settings.noiseReduction) {
            filters.push('afftdn=nf=-25:tn=0:nt=0');
        }
        
        const filterComplex = filters.join(',');
        
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(inputPath)) {
                reject(new Error('Archivo de entrada no existe'));
                return;
            }
            
            // Si no hay filtros, solo copiar
            if (!filterComplex) {
                fs.copyFileSync(inputPath, outputPath);
                resolve(outputPath);
                return;
            }
            
            const command = `"${this.ffmpegPath}" -i "${inputPath}" -af "${filterComplex}" -c:a libmp3lame -q:a 2 "${outputPath}"`;
            
            console.log('🎚️ Aplicando ecualización:', filterComplex);
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error aplicando ecualización:', error);
                    reject(error);
                } else {
                    console.log('✅ Ecualización aplicada correctamente');
                    resolve(outputPath);
                }
            });
        });
    }

    /**
     * Reproducir audio con ecualización en tiempo real usando ffplay
     * @param {string} audioPath - Ruta del archivo de audio
     * @param {Object} eqSettings - Configuración del ecualizador
     */
    playWithEqualizer(audioPath, eqSettings = null) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(audioPath)) {
                reject(new Error('Archivo de audio no existe'));
                return;
            }
            
            this.stopPlayback();
            
            const settings = eqSettings || this.eqSettings;
            
            // Construir filtros para reproducción en tiempo real
            const filters = [];
            
            if (settings.bass !== 0) {
                filters.push(`equalizer=f=100:width_type=h:width=100:g=${settings.bass}`);
            }
            if (settings.mid !== 0) {
                filters.push(`equalizer=f=1000:width_type=h:width=500:g=${settings.mid}`);
            }
            if (settings.treble !== 0) {
                filters.push(`equalizer=f=8000:width_type=h:width=2000:g=${settings.treble}`);
            }
            if (settings.noiseReduction) {
                filters.push('afftdn=nf=-25:tn=0:nt=0');
            }
            
            const filterComplex = filters.join(',');
            
            // Comando ffplay con filtros
            let command = `"${this.ffplayPath}" -nodisp -autoexit -volume ${Math.round(this.volume * 100)}`;
            if (filterComplex) {
                command += ` -af "${filterComplex}"`;
            }
            command += ` "${audioPath}"`;
            
            console.log('▶️ Reproduciendo con ffplay:', command);
            
            this.audioProcess = exec(command, (error, stdout, stderr) => {
                if (error && !error.killed) {
                    console.error('Error en reproducción:', error);
                    reject(error);
                }
                this.audioProcess = null;
                this.isPlaying = false;
                this.emit('ended');
                resolve();
            });
            
            this.audioProcess.on('error', (err) => {
                console.error('Error en proceso de audio:', err);
                this.audioProcess = null;
                reject(err);
            });
            
            this.isPlaying = true;
            this.currentTrack = audioPath;
        });
    }

    /**
     * Detener reproducción actual
     */
    stopPlayback() {
        if (this.audioProcess) {
            this.audioProcess.kill();
            this.audioProcess = null;
        }
        if (this.ffmpegProcess) {
            this.ffmpegProcess.kill();
            this.ffmpegProcess = null;
        }
        this.isPlaying = false;
        this.currentTrack = null;
        console.log('⏹️ Reproducción detenida');
    }

    /**
     * Actualizar volumen
     * @param {number} volume - Volumen (0-100)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(100, volume)) / 100;
        console.log(`🔊 Volumen ajustado a: ${Math.round(this.volume * 100)}%`);
        this.emit('volume-change', this.volume);
        
        // Si hay reproducción activa, aplicar cambio de volumen
        if (this.audioProcess) {
            // Nota: ffplay no soporta cambio de volumen en tiempo real fácilmente
            // Se requeriría reiniciar el proceso con nuevo volumen
            // Para mejor experiencia, usar Web Audio API en el frontend
        }
    }

    /**
     * Actualizar ecualizador
     * @param {Object} settings - Configuración del ecualizador
     */
    updateEqualizer(settings) {
        this.eqSettings = { ...this.eqSettings, ...settings };
        console.log('🎛️ Ecualizador actualizado:', this.eqSettings);
        this.emit('eq-change', this.eqSettings);
        
        // Si hay reproducción activa, reiniciar con nuevos filtros
        if (this.isPlaying && this.currentTrack) {
            const wasPlaying = this.isPlaying;
            this.stopPlayback();
            if (wasPlaying) {
                this.playWithEqualizer(this.currentTrack);
            }
        }
    }

    /**
     * Procesar un archivo de audio con ecualización y guardarlo
     * @param {string} inputPath - Ruta del archivo original
     * @param {string} outputPath - Ruta de salida (opcional)
     */
    async processAndSave(inputPath, outputPath = null) {
        if (!outputPath) {
            const parsed = path.parse(inputPath);
            outputPath = path.join(parsed.dir, `${parsed.name}_eq${parsed.ext}`);
        }
        
        return await this.applyEqualizer(inputPath, outputPath);
    }
}

module.exports = { AudioService };