const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const axios = require("axios");

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
    // EN DESARROLLO this.ytDlpPath = path.join(__dirname, "..", "..", "bin", "yt-dlp");
    // EN FLATHUB
    this.ytDlpPath = path.join(__dirname, "..", "bin", "yt-dlp");

    if (!fs.existsSync(this.downloadsPath)) {
      fs.mkdirSync(this.downloadsPath, { recursive: true });
    }

    if (!fs.existsSync(this.ytDlpPath)) {
      console.error("yt-dlp no encontrado en:", this.ytDlpPath);
    } else {
      fs.chmodSync(this.ytDlpPath, "755");
      console.log("yt-dlp encontrado");
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
      if (
        !videoId ||
        videoId.length !== 11 ||
        !/^[a-zA-Z0-9_-]+$/.test(videoId)
      ) {
        throw new Error(`ID de video inválido: ${videoId}`);
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
      throw new Error(
        `No se pudo obtener información del video: ${error.message}`,
      );
    }
  }

  async downloadThumbnail(thumbnailUrl, outputPath) {
    try {
      const response = await axios({
        method: "GET",
        url: thumbnailUrl,
        responseType: "stream",
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () => {
          console.log(`humbnail descargado`);
          resolve(true);
        });
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

      const metadataFile = path.join(
        this.downloadsPath,
        `metadata_${Date.now()}.txt`,
      );

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
        const ffmpegStatic = require("@ffmpeg-installer/ffmpeg");
        ffmpeg.setFfmpegPath(ffmpegStatic.path);

        console.log("Incrustando portada y metadatos...");

        ffmpeg()
          .input(mp3Path)
          .input(thumbnailPath)
          .input(metadataFile)
          .outputOptions([
            "-map",
            "0:a",
            "-map",
            "1:v",
            "-map_metadata",
            "2",
            "-c",
            "copy",
            "-id3v2_version",
            "3",
            "-disposition:v:0",
            "attached_pic",
          ])
          .output(tempOutput)
          .on("end", () => {
            if (fs.existsSync(tempOutput)) {
              fs.renameSync(tempOutput, mp3Path);
              console.log("Portada y metadatos incrustados correctamente");
            }
            try {
              fs.unlinkSync(metadataFile);
            } catch (e) {}
            resolve();
          })
          .on("error", (err) => {
            console.error("Error en ffmpeg:", err.message);
            try {
              fs.unlinkSync(metadataFile);
            } catch (e) {}
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

  async downloadAudio(
    videoId,
    title,
    quality = 320,
    providedDownloadId = null,
  ) {
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
        finalPath = path.join(
          this.downloadsPath,
          `${sanitizedTitle}_${quality}kbps.mp3`,
        );
        thumbnailPath = path.join(
          this.downloadsPath,
          `${sanitizedTitle}_cover.jpg`,
        );

        console.log(`\nDescargando: ${videoInfo.title}`);
        console.log(`ID: ${downloadId}\n`);

        this.emitProgress(downloadId, 5, "downloading_thumbnail");
        await this.downloadThumbnail(videoInfo.thumbnail, thumbnailPath);
        this.emitProgress(downloadId, 10, "downloading_audio");

        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const command = `"${this.ytDlpPath}" -f bestaudio --extract-audio --audio-format mp3 --audio-quality ${quality}k -o "${finalPath}" "${url}"`;

        console.log("Descargando audio...");

        let lastPercent = 0;

        childProcess = exec(command);

        this.activeDownloads.set(downloadId, {
          process: childProcess,
          startTime: Date.now(),
          videoId,
          title: videoInfo.title,
          cancelled: false,
        });

        console.log(
          `Proceso guardado en activeDownloads. Total activos: ${this.activeDownloads.size}`,
        );

        childProcess.on("exit", (code, signal) => {
          console.log(
            `Proceso ${downloadId} terminó con código: ${code}, señal: ${signal}`,
          );
        });

        childProcess.on("error", (error) => {
          console.error(`Error en proceso ${downloadId}:`, error.message);
        });

        childProcess.stderr?.on("data", (data) => {
          const output = data.toString();

          let percent = null;
          const match = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
          if (match) {
            percent = parseFloat(match[1]);
          }

          if (percent !== null && percent !== lastPercent) {
            const mappedPercent = Math.min(
              99,
              Math.max(10, 10 + percent * 0.75),
            );
            lastPercent = mappedPercent;
            this.emitProgress(
              downloadId,
              Math.round(mappedPercent),
              "downloading",
            );
            process.stdout.write(
              `\rProgreso: ${Math.round(percent)}% → ${Math.round(mappedPercent)}% total`,
            );
          }
        });

        childProcess.on("close", async (code) => {
          console.log(`Proceso ${downloadId} cerrado con código: ${code}`);

          const download = this.activeDownloads.get(downloadId);
          const wasCancelled = download?.cancelled === true;

          if (wasCancelled) {
            console.log(`Descarga ${downloadId} cancelada por el usuario`);
            this.emitProgress(downloadId, 0, "cancelled");
            this.activeDownloads.delete(downloadId);
            resolve({
              success: false,
              cancelled: true,
              message: "Descarga cancelada por el usuario",
            });
            return;
          }

          if (code !== 0 && code !== null) {
            console.error(`Error en descarga ${downloadId}, código: ${code}`);
            this.emitProgress(downloadId, 0, "error");
            this.activeDownloads.delete(downloadId);
            reject(new Error(`Descarga cancelada, terminó con código ${code}`));
            return;
          }

          if (fs.existsSync(finalPath)) {
            console.log("Audio descargado correctamente");

            this.emitProgress(downloadId, 90, "processing");

            if (fs.existsSync(thumbnailPath)) {
              await this.embedThumbnailToMp3(
                finalPath,
                thumbnailPath,
                videoInfo,
              );
              try {
                fs.unlinkSync(thumbnailPath);
              } catch (e) {}
            }

            this.emitProgress(downloadId, 100, "completed");

            console.log("\n Descarga completada exitosamente!");
            console.log(`Ubicación: ${finalPath}`);
            console.log(`Título: ${videoInfo.title}`);
            console.log(`Artista: ${videoInfo.author}\n`);

            this.activeDownloads.delete(downloadId);
            resolve({
              success: true,
              path: finalPath,
              info: {
                title: videoInfo.title,
                artist: videoInfo.author,
                duration: videoInfo.duration,
                size: fs.statSync(finalPath).size,
                quality: quality,
              },
            });
          } else {
            this.emitProgress(downloadId, 0, "error");
            this.activeDownloads.delete(downloadId);
            reject(new Error("No se encontró el archivo descargado"));
          }
        });
      } catch (error) {
        console.error("Error en descarga:", error.message);
        this.emitProgress(downloadId, 0, "error");
        if (childProcess) {
          childProcess.kill();
        }
        this.activeDownloads.delete(downloadId);
        reject(new Error(`Error en descarga: ${error.message}`));
      }
    });
  }

  cancelDownload(downloadId) {
    console.log(`Intentando cancelar descarga: ${downloadId}`);
    console.log(
      `Descargas activas:`,
      Array.from(this.activeDownloads.keys()),
    );

    const download = this.activeDownloads.get(downloadId);

    if (download && download.process) {
      console.log(`Proceso encontrado, terminando...`);

      download.cancelled = true;

      try {
        download.process.kill("SIGTERM");

        setTimeout(() => {
          try {
            if (download.process && !download.process.killed) {
              download.process.kill("SIGKILL");
              console.log(`Proceso ${downloadId} forzado con SIGKILL`);
            }
          } catch (e) {
            console.error("Error forzando kill:", e);
          }
        }, 2000);
      } catch (error) {
        console.error(`Error matando proceso ${downloadId}:`, error.message);
        try {
          download.process.kill("SIGKILL");
        } catch (e) {}
      }

      setTimeout(() => {
        this.activeDownloads.delete(downloadId);
        console.log(`Descarga ${downloadId} eliminada del registro`);
      }, 500);

      this.emitProgress(downloadId, 0, "cancelled");

      return true;
    } else {
      console.log(`No se encontró proceso para downloadId: ${downloadId}`);
      return false;
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { DownloadService };