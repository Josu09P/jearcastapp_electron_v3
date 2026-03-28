const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const axios = require("axios");
const { app } = require("electron");

const execPromise = promisify(exec);

class DownloadService {
  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    let downloadsDir = path.join(homeDir, "Downloads");

    const descargasDir = path.join(homeDir, "Descargas");
    if (fs.existsSync(descargasDir)) {
      downloadsDir = descargasDir;
    } else if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    this.downloadsPath = path.join(downloadsDir, "JearCast");
    this.activeDownloads = new Map();
    
    const isFlatpak = !!process.env.FLATPAK_ID;
    
    if (isFlatpak) {
      this.ytDlpPath = path.join(__dirname, "..", "..", "..", "bin", "yt-dlp");
    } else {
      this.ytDlpPath = path.join(__dirname, "..", "..", "bin", "yt-dlp");
    }
    
    if (!fs.existsSync(this.ytDlpPath) && process.resourcesPath) {
      const fallbackPath = path.join(process.resourcesPath, "..", "bin", "yt-dlp");
      if (fs.existsSync(fallbackPath)) {
        this.ytDlpPath = fallbackPath;
      }
    }

    if (!fs.existsSync(this.downloadsPath)) {
      fs.mkdirSync(this.downloadsPath, { recursive: true });
    }

    if (!fs.existsSync(this.ytDlpPath)) {
      console.error("yt-dlp no encontrado en:", this.ytDlpPath);
      const altPaths = [
        "/app/lib/jearcast/bin/yt-dlp",
        "/app/lib/jearcast/resources/bin/yt-dlp",
        path.join(__dirname, "..", "..", "bin", "yt-dlp"),
        path.join(__dirname, "..", "..", "..", "bin", "yt-dlp"),
      ];
      
      for (const altPath of altPaths) {
        if (fs.existsSync(altPath)) {
          this.ytDlpPath = altPath;
          console.log("yt-dlp encontrado en ruta alternativa:", altPath);
          break;
        }
      }
    }
    
    if (fs.existsSync(this.ytDlpPath)) {
      console.log("yt-dlp disponible en:", this.ytDlpPath);
      if (!isFlatpak) {
        try {
          fs.chmodSync(this.ytDlpPath, "755");
          console.log("Permisos de yt-dlp actualizados");
        } catch (err) {
          console.error("Error cambiando permisos (no critico):", err.message);
        }
      }
    } else {
      console.error("ERROR: yt-dlp NO ENCONTRADO. Las descargas no funcionaran.");
    }

    console.log("Directorio de descargas:", this.downloadsPath);
  }

  sanitizeFilename(filename) {
    return filename
      .normalize("NFKD")
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\s+/g, "_")
      .trim();
  }

  async getVideoInfo(videoId) {
    try {
      if (!videoId || videoId.length !== 11 || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
        throw new Error(`ID de video invalido: ${videoId}`);
      }
      console.log(`Obteniendo info para videoId: ${videoId}`);
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const command = `"${this.ytDlpPath}" --dump-json "${url}"`;
      const { stdout } = await execPromise(command, { timeout: 30000 });
      const info = JSON.parse(stdout);
      return {
        videoId: info.id,
        title: info.title,
        duration: info.duration,
        author: info.uploader,
        authorId: info.channel_id,
        channelUrl: info.channel_url,
        thumbnail: info.thumbnail,
        publishDate: info.upload_date,
        viewCount: info.view_count,
        likeCount: info.like_count || 0,
        availableQualities: [128, 192, 256, 320],
      };
    } catch (error) {
      console.error("Error obteniendo info:", error.message);
      throw new Error(`No se pudo obtener informacion del video: ${error.message}`);
    }
  }

  async downloadThumbnail(thumbnailUrl, outputPath) {
    try {
      const response = await axios({
        method: "GET",
        url: thumbnailUrl,
        responseType: "stream",
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
        writer.on("finish", () => { console.log(`Thumbnail descargado`); resolve(true); });
        writer.on("error", reject);
      });
    } catch (error) {
      console.error("Error descargando thumbnail:", error.message);
      return false;
    }
  }

  async embedThumbnailToMp3(mp3Path, thumbnailPath, videoInfo) {
    return new Promise(async (resolve) => {
      if (!fs.existsSync(thumbnailPath)) {
        console.log("No hay thumbnail");
        resolve();
        return;
      }

      const metadataFile = path.join(this.downloadsPath, `metadata_${Date.now()}.txt`);
      const metadataContent = `;FFMETADATA1
title=${videoInfo.title}
artist=${videoInfo.author}
album=JearCast Downloads
date=${videoInfo.publishDate ? videoInfo.publishDate.substring(0, 4) : new Date().getFullYear()}
comment=Descargado con JearCast Music Player
`;

      try {
        fs.writeFileSync(metadataFile, metadataContent, "utf8");
        const tempOutput = mp3Path.replace(".mp3", "_temp.mp3");

        const ffmpeg = require("fluent-ffmpeg");
        const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
        
        // CORRECCIÓN RUTA FFmpeg para ASAR / FLATPAK
        let ffmpegPath = ffmpegInstaller.path;
        if (app.isPackaged) {
            // Cambiamos la ruta para que busque en la carpeta descomprimida (unpacked)
            ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
        }
        
        ffmpeg.setFfmpegPath(ffmpegPath);
        console.log("Incrustando portada usando FFmpeg en:", ffmpegPath);

        ffmpeg()
          .input(mp3Path)
          .input(thumbnailPath)
          .input(metadataFile)
          .outputOptions([
            "-map", "0:a", "-map", "1:v", "-map_metadata", "2",
            "-c", "copy", "-id3v2_version", "3",
            "-disposition:v:0", "attached_pic",
          ])
          .output(tempOutput)
          .on("end", () => {
            if (fs.existsSync(tempOutput)) {
              fs.renameSync(tempOutput, mp3Path);
              console.log("Portada y metadatos incrustados correctamente");
            }
            try { fs.unlinkSync(metadataFile); } catch (e) {}
            resolve();
          })
          .on("error", (err) => {
            console.error("Error en ffmpeg:", err.message);
            try { fs.unlinkSync(metadataFile); } catch (e) {}
            resolve();
          })
          .run();
      } catch (err) {
        console.error("Error creando archivo de metadatos:", err.message);
        resolve();
      }
    });
  }

  emitProgress(downloadId, percent, status = "downloading") {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      try {
        global.mainWindow.webContents.send("download-progress", {
          downloadId,
          percent: Math.min(100, Math.max(0, percent)),
          status,
          timestamp: Date.now(),
        });
        console.log(`Progreso ${downloadId}: ${percent}% (${status})`);
      } catch (error) {
        console.error("Error enviando progreso:", error.message);
      }
    }
  }

  async downloadAudio(videoId, title, quality = 320, providedDownloadId = null) {
    const downloadId = providedDownloadId || `${videoId}_${Date.now()}`;

    return new Promise(async (resolve, reject) => {
      let childProcess = null;
      let finalPath = null;
      let thumbnailPath = null;
      let videoInfo = null;

      try {
        this.emitProgress(downloadId, 0, "starting");
        videoInfo = await this.getVideoInfo(videoId);
        const sanitizedTitle = this.sanitizeFilename(videoInfo.title);
        finalPath = path.join(this.downloadsPath, `${sanitizedTitle}_${quality}kbps.mp3`);
        thumbnailPath = path.join(this.downloadsPath, `${sanitizedTitle}_cover.jpg`);

        this.emitProgress(downloadId, 5, "downloading_thumbnail");
        await this.downloadThumbnail(videoInfo.thumbnail, thumbnailPath);
        this.emitProgress(downloadId, 10, "downloading_audio");

        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const command = `"${this.ytDlpPath}" -f bestaudio --extract-audio --audio-format mp3 --audio-quality ${quality}k -o "${finalPath}" "${url}"`;

        let lastPercent = 0;
        childProcess = exec(command);

        this.activeDownloads.set(downloadId, {
          process: childProcess,
          startTime: Date.now(),
          videoId,
          title: videoInfo.title,
          cancelled: false,
        });

        childProcess.stderr?.on("data", (data) => {
          const output = data.toString();
          let percent = null;
          const match = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
          if (match) percent = parseFloat(match[1]);

          if (percent !== null && percent !== lastPercent) {
            const mappedPercent = Math.min(99, Math.max(10, 10 + percent * 0.85));
            lastPercent = mappedPercent;
            this.emitProgress(downloadId, Math.round(mappedPercent), "downloading");
          }
        });

        childProcess.on("close", async (code) => {
          const download = this.activeDownloads.get(downloadId);
          if (download?.cancelled) {
            this.emitProgress(downloadId, 0, "cancelled");
            this.activeDownloads.delete(downloadId);
            resolve({ success: false, cancelled: true });
            return;
          }

          if (code !== 0 && code !== null) {
            this.emitProgress(downloadId, 0, "error");
            this.activeDownloads.delete(downloadId);
            reject(new Error(`Error codigo ${code}`));
            return;
          }

          if (fs.existsSync(finalPath)) {
            this.emitProgress(downloadId, 90, "processing");
            if (fs.existsSync(thumbnailPath)) {
              await this.embedThumbnailToMp3(finalPath, thumbnailPath, videoInfo);
              try { fs.unlinkSync(thumbnailPath); } catch (e) {}
            }
            this.emitProgress(downloadId, 100, "completed");
            this.activeDownloads.delete(downloadId);
            resolve({ success: true, path: finalPath, info: videoInfo });
          } else {
            reject(new Error("Archivo no encontrado"));
          }
        });
      } catch (error) {
        this.emitProgress(downloadId, 0, "error");
        if (childProcess) childProcess.kill();
        this.activeDownloads.delete(downloadId);
        reject(error);
      }
    });
  }

  cancelDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (download && download.process) {
      download.cancelled = true;
      download.process.kill("SIGTERM");
      this.activeDownloads.delete(downloadId);
      this.emitProgress(downloadId, 0, "cancelled");
      return true;
    }
    return false;
  }
}

module.exports = { DownloadService };