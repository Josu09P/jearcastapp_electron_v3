const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const ffmpeg = require("fluent-ffmpeg");

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

class LocalMusicService {
  constructor() {
    this.supportedExtensions = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"];
  }

  /**
   * Escanea una carpeta y devuelve la lista de canciones con metadatos básicos.
   */
  async scanFolder(folderPath) {
    try {
      if (!fs.existsSync(folderPath)) {
        console.log("Directorio no encontrado: " + folderPath);
        return [];
      }

      const files = await readdir(folderPath);
      const musicFiles = [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (this.supportedExtensions.includes(ext)) {
          const filePath = path.join(folderPath, file);
          try {
            const stats = await stat(filePath);
            const title = path.parse(file).name;
            
            musicFiles.push({
              id: Buffer.from(filePath).toString('base64'),
              title: title,
              artist: "Artista desconocido",
              path: filePath,
              size: stats.size,
              duration: 0,
              album: "Album desconocido"
            });
          } catch (e) {
            console.log("Error procesando archivo: " + file);
          }
        }
      }

      console.log("Escaneo completado: " + musicFiles.length + " archivos encontrados");
      return musicFiles;
    } catch (error) {
      console.log("Error en el escaneo de carpeta: " + error.message);
      return [];
    }
  }

  /**
   * Extrae metadatos reales del archivo (Titulo, Artista, Duracion).
   */
  async getMetadata(filePath) {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.log("Error leyendo metadatos de: " + filePath);
          const fileName = path.parse(filePath).name;
          return resolve({
            title: fileName,
            artist: "Artista desconocido",
            duration: 0
          });
        }

        const format = metadata.format || {};
        const tags = format.tags || {};
        const fileName = path.parse(filePath).name;
        
        resolve({
          title: tags.title || fileName,
          artist: tags.artist || "Artista desconocido",
          album: tags.album || "Album desconocido",
          duration: Math.round(format.duration) || 0
        });
      });
    });
  }
}

module.exports = { LocalMusicService };
