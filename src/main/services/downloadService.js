const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { spawn } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

class DownloadService {
  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    this.downloadsPath = path.join(homeDir, "Descargas", "JearCast");
    
    if (!fs.existsSync(this.downloadsPath)) {
      fs.mkdirSync(this.downloadsPath, { recursive: true });
    }

    this.activeDownloads = new Map();
    
    // Configurar ruta de ffmpeg
    this.setupFFmpeg();
    
    // Configurar ruta de yt-dlp
    this.setupYtDlp();
    
    // Verificar que los binarios funcionan
    this.verifyBinaries();
  }

  setupFFmpeg() {
    try {
      let ffmpegPath = ffmpegInstaller.path;
      
      if (app.isPackaged) {
        // En producción, ffmpeg está en app.asar.unpacked
        ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
        
        // Verificación adicional por si la ruta es diferente
        if (!fs.existsSync(ffmpegPath)) {
          const alternativePaths = [
            path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"),
            path.join(path.dirname(app.getPath('exe')), "resources", "app.asar.unpacked", "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"),
            path.join(app.getAppPath(), "..", "app.asar.unpacked", "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg")
          ];
          
          ffmpegPath = alternativePaths.find(p => fs.existsSync(p)) || ffmpegPath;
        }
      }
      
      if (fs.existsSync(ffmpegPath)) {
        ffmpeg.setFfmpegPath(ffmpegPath); this.ffmpegPath = ffmpegPath;
        console.log("✅ DownloadService: Usando FFmpeg en", ffmpegPath);
      } else {
        console.error("❌ DownloadService: FFmpeg no encontrado en", ffmpegPath);
        throw new Error("FFmpeg binary not found");
      }
    } catch (error) {
      console.error("❌ Error configurando FFmpeg:", error);
      throw error;
    }
  }

  setupYtDlp() {
    try {
      if (app.isPackaged) {
        // En producción, buscar en múltiples ubicaciones posibles
        const possiblePaths = [
          path.join(process.resourcesPath, "bin", "yt-dlp"),
          path.join(process.resourcesPath, "app.asar.unpacked", "bin", "yt-dlp"),
          path.join(app.getAppPath(), "..", "bin", "yt-dlp"),
          path.join(app.getAppPath() + ".unpacked", "bin", "yt-dlp"),
          path.join(path.dirname(app.getPath('exe')), "resources", "bin", "yt-dlp"),
          path.join(path.dirname(app.getPath('exe')), "resources", "app.asar.unpacked", "bin", "yt-dlp")
        ];
        
        this.ytdlpPath = possiblePaths.find(p => {
          const exists = fs.existsSync(p);
          console.log(`   Buscando yt-dlp en: ${p} -> ${exists ? '✅' : '❌'}`);
          return exists;
        });
        
        if (!this.ytdlpPath) {
          console.error('❌ DownloadService: No se encontró yt-dlp en ninguna ubicación');
          console.error('   Ubicaciones buscadas:', possiblePaths);
          throw new Error('yt-dlp binary not found in any expected location');
        }
      } else {
        // En desarrollo
        const devPaths = [
          path.join(__dirname, "..", "resources", "bin", "yt-dlp"),
          path.join(app.getAppPath(), "src", "resources", "bin", "yt-dlp"),
          path.join(process.cwd(), "src", "resources", "bin", "yt-dlp")
        ];
        
        this.ytdlpPath = devPaths.find(p => fs.existsSync(p));
        
        if (!this.ytdlpPath) {
          console.error('❌ DownloadService: No se encontró yt-dlp en desarrollo');
          throw new Error('yt-dlp binary not found in development');
        }
      }
      
      console.log("✅ DownloadService: Usando yt-dlp en", this.ytdlpPath);
      
      // Verificar y establecer permisos de ejecución (solo en Linux)
      if (process.platform === "linux") {
        this.ensureExecutablePermissions(this.ytdlpPath);
      }
      
    } catch (error) {
      console.error("❌ Error configurando yt-dlp:", error);
      throw error;
    }
  }

  ensureExecutablePermissions(filePath) {
    try {
      const stats = fs.statSync(filePath);
      
      // Verificar si ya tiene permisos de ejecución
      const hasExecPermission = (stats.mode & 0o111) !== 0;
      
      if (!hasExecPermission) {
        console.log('🔧 Intentando establecer permisos de ejecución para:', filePath);
        
        try {
          fs.chmodSync(filePath, 0o755);
          console.log('✅ Permisos de ejecución establecidos correctamente');
        } catch (chmodError) {
          if (chmodError.code === 'EPERM') {
            console.warn('⚠️ No se pueden cambiar permisos (app empaquetada en sistema de solo lectura)');
            
            // Verificar si al menos podemos acceder al archivo
            try {
              fs.accessSync(filePath, fs.constants.X_OK);
              console.log('✅ El binario ya tiene permisos de ejecución (verificado con access)');
            } catch (accessError) {
              console.error('❌ El binario no tiene permisos de ejecución y no se pueden cambiar');
              
              // Intentar usar el binario del sistema como fallback
              console.log('🔍 Buscando yt-dlp en el sistema...');
              const systemYtDlp = this.findSystemBinary('yt-dlp');
              if (systemYtDlp) {
                console.log('✅ Usando yt-dlp del sistema:', systemYtDlp);
                this.ytdlpPath = systemYtDlp;
              }
            }
          } else {
            throw chmodError;
          }
        }
      } else {
        console.log('✅ El binario ya tiene permisos de ejecución');
      }
    } catch (error) {
      console.error('❌ Error verificando permisos:', error);
      throw error;
    }
  }

  findSystemBinary(binaryName) {
    try {
      const result = require('child_process').execSync(`which ${binaryName}`, { encoding: 'utf8' });
      const binaryPath = result.trim();
      return binaryPath && fs.existsSync(binaryPath) ? binaryPath : null;
    } catch (error) {
      return null;
    }
  }

  verifyBinaries() {
    console.log('🔍 Verificando binarios...');
    
    // Verificar FFmpeg
    try {
      const ffmpegTest = spawn(this.ffmpegPath, ['-version']);
      ffmpegTest.on('error', (err) => {
        console.error('❌ FFmpeg no funciona:', err.message);
      });
      ffmpegTest.on('close', (code) => {
        if (code === 0) {
          console.log('✅ FFmpeg funciona correctamente');
        } else {
          console.error('❌ FFmpeg retornó código:', code);
        }
      });
    } catch (error) {
      console.error('❌ Error verificando FFmpeg:', error);
    }

    // Verificar yt-dlp
    try {
      const ytdlpTest = spawn(this.ytdlpPath, ['--version']);
      let version = '';
      
      ytdlpTest.stdout.on('data', (data) => {
        version += data.toString();
      });
      
      ytdlpTest.on('error', (err) => {
        console.error('❌ yt-dlp no funciona:', err.message);
      });
      
      ytdlpTest.on('close', (code) => {
        if (code === 0) {
          console.log('✅ yt-dlp funciona correctamente - Versión:', version.trim());
        } else {
          console.error('❌ yt-dlp retornó código:', code);
        }
      });
    } catch (error) {
      console.error('❌ Error verificando yt-dlp:', error);
    }
  }

  sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^\x00-\x7F]/g, "") // Eliminar caracteres no ASCII
      .trim()
      .substring(0, 200); // Limitar longitud
  }

  async getVideoInfo(videoId) {
    return new Promise((resolve, reject) => {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      
      console.log('🔍 Obteniendo información del video:', videoId);
      
      const child = spawn(this.ytdlpPath, [
        "-j",                    // JSON output
        "--no-playlist",         // No procesar playlists
        "--no-warnings",         // Reducir output
        "--format", "bestaudio", // Mejor formato de audio
        url
      ]);
      
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (error) => {
        console.error("❌ Error ejecutando yt-dlp:", error);
        reject(new Error(`Error ejecutando yt-dlp: ${error.message}`));
      });

      child.on("close", (code) => {
        if (code !== 0) {
          console.error("❌ yt-dlp error:", stderr);
          
          // Intentar obtener información con opciones alternativas
          if (stderr.includes("Video unavailable") || stderr.includes("Private video")) {
            reject(new Error("Video no disponible o privado"));
          } else {
            reject(new Error(`No se pudo obtener información de YouTube (código ${code})`));
          }
          return;
        }
        
        try {
          const info = JSON.parse(stdout);
          
          const videoInfo = {
            videoId: info.id || videoId,
            title: info.title || "Título desconocido",
            duration: info.duration || 0,
            author: info.uploader || info.channel || "Desconocido",
            thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            formats: info.formats?.length || 0,
            filesize: info.filesize || 0
          };
          
          console.log('✅ Información obtenida:', videoInfo.title);
          resolve(videoInfo);
        } catch (e) {
          console.error("❌ Error parseando información:", e);
          console.error("   stdout:", stdout.substring(0, 200));
          reject(new Error("Error al procesar información de YouTube"));
        }
      });
    });
  }

  async downloadAudio(videoId, title, quality = "192", providedDownloadId = null) {
    const downloadId = providedDownloadId || `${videoId}_${Date.now()}`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    return new Promise(async (resolve, reject) => {
      try {
        console.log('📥 Iniciando descarga:', { videoId, quality, downloadId });
        
        // Obtener información del video primero
        const videoInfo = await this.getVideoInfo(videoId);
        const sanitizedTitle = this.sanitizeFilename(videoInfo.title || title || videoId);
        const finalPath = path.join(this.downloadsPath, `${sanitizedTitle}.mp3`);

        // yt-dlp optimizado para descargar con Metadata y Portada incrustada
        const ytdlpArgs = [
          "--extract-audio",
          "--audio-format", "mp3",
          "--audio-quality", quality + "k",
          "--embed-thumbnail", "--convert-thumbnails", "jpg",    // Incrustar portada
          "--add-metadata", "--ffmpeg-location", this.ffmpegPath,       // Incrustar etiquetas ID3
          "--no-playlist",
          "--no-warnings",
          "-o", finalPath,
          url
        ];

        console.log("📥 Descargando con metadata:", ytdlpArgs.join(" "));
        
        const ytdlpProcess = spawn(this.ytdlpPath, ytdlpArgs);

        ytdlpProcess.stdout.on("data", (data) => {
          const text = data.toString();
          // Capturar el progreso directamente de yt-dlp
          const match = text.match(/\[download\]\s+(\d+\.\d+)%/);
          if (match) {
            this.emitProgress(downloadId, Math.round(parseFloat(match[1])), "downloading");
          }
        });

        ytdlpProcess.on("error", (error) => {
          console.error("❌ Error en yt-dlp:", error);
          this.emitProgress(downloadId, 0, "error");
          reject(error);
        });

        ytdlpProcess.on("close", (code) => {
          if (code === 0 && fs.existsSync(finalPath)) {
            console.log("✅ Descarga completada con metadata:", finalPath);
            this.emitProgress(downloadId, 100, "completed");
            this.activeDownloads.delete(downloadId);
            resolve({ success: true, path: finalPath, title: videoInfo.title });
          } else {
            this.emitProgress(downloadId, 0, "error");
            reject(new Error(`Error en descarga (código ${code})`));
          }
        });

        this.activeDownloads.set(downloadId, { 
          ytdlpProcess, 
          finalPath,
          startTime: Date.now(), cancelled: false
        });

      } catch (error) {
        console.error('❌ Error en descarga:', error);
        this.activeDownloads.delete(downloadId);
        this.emitProgress(downloadId, 0, "error");
        reject(error);
      }
    });
  }

  cancelDownload(downloadId) {
    console.log('🛑 Cancelando descarga:', downloadId);
    
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      console.warn('⚠️ Descarga no encontrada:', downloadId);
      return false;
    }
    
    download.cancelled = true;
    
    // Matar procesos en orden
    try {
      if (download.command) {
        download.command.kill("SIGKILL");
        console.log('   ✅ Proceso FFmpeg terminado');
      }
    } catch (error) {
      console.error('   ❌ Error matando FFmpeg:', error.message);
    }
    
    try {
      if (download.ytdlpProcess) {
        download.ytdlpProcess.kill("SIGKILL");
        console.log('   ✅ Proceso yt-dlp terminado');
      }
    } catch (error) {
      console.error('   ❌ Error matando yt-dlp:', error.message);
    }
    
    // Limpiar archivo parcial
    if (download.finalPath && fs.existsSync(download.finalPath)) {
      try {
        fs.unlinkSync(download.finalPath);
        console.log('   ✅ Archivo parcial eliminado');
      } catch (error) {
        console.error('   ❌ Error eliminando archivo parcial:', error.message);
      }
    }
    
    this.activeDownloads.delete(downloadId);
    this.emitProgress(downloadId, 0, "cancelled");
    
    console.log('✅ Descarga cancelada exitosamente');
    return true;
  }

  emitProgress(downloadId, percent, status) {
    const progressData = {
      downloadId,
      percent,
      status,
      timestamp: Date.now()
    };
    
    // Intentar enviar a la ventana principal
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      try {
        global.mainWindow.webContents.send("download-progress", progressData);
      } catch (error) {
        console.error('❌ Error enviando progreso:', error.message);
      }
    } else {
      console.warn('⚠️ Ventana principal no disponible para enviar progreso');
    }
    
    // Log del progreso
    const emoji = status === 'completed' ? '✅' : 
                  status === 'error' ? '❌' : 
                  status === 'cancelled' ? '🛑' : '📥';
    console.log(`${emoji} Progreso [${downloadId}]: ${percent}% - ${status}`);
  }

  // Método para obtener el estado de todas las descargas
  getActiveDownloads() {
    const downloads = [];
    this.activeDownloads.forEach((download, id) => {
      downloads.push({
        id,
        cancelled: download.cancelled,
        startTime: download.startTime,
        duration: Date.now() - download.startTime,
        hasCommand: !!download.command,
        hasYtdlpProcess: !!download.ytdlpProcess
      });
    });
    return downloads;
  }

  // Método para limpiar descargas antiguas
  cleanOldDownloads(maxAge = 24 * 60 * 60 * 1000) { // 24 horas por defecto
    const now = Date.now();
    this.activeDownloads.forEach((download, id) => {
      if (now - download.startTime > maxAge) {
        this.activeDownloads.delete(id);
      }
    });
  }
}

module.exports = { DownloadService };