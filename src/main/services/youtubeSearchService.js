const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

class YouTubeSearchService {
  constructor() {
    // Detectar la ruta de yt-dlp
    this.ytdlpPath = this.findYtDlp();

    // 🔥 CACHÉ PARA EVITAR LLAMADAS REPETIDAS
    this.cache = {
      channels: new Map(),    // Cache de canales (30 min)
      thumbnails: new Map(),  // Cache de thumbnails (1 hora)
      searches: new Map(),    // Cache de búsquedas (5 min)
      videos: new Map(),      // Cache de videos (30 min)
      related: new Map(),     // Cache de relacionados (10 min)
    };
    
    // 🔥 CONTROL DE CONCURRENCIA
    this.pendingRequests = new Map(); // Evitar duplicados en vuelo
    this.maxConcurrent = 2;           // Máximo 2 consultas simultáneas
    this.activeRequests = 0;
    this.queue = [];
    
    console.log("🔍 YouTubeSearchService inicializado con caché y control de concurrencia");
    console.log("   yt-dlp:", this.ytdlpPath);
    console.log("   🔓 Versión General: Búsqueda universal sin filtros de género");
  }

  /**
   * Limpieza de Query (Sin inyección de palabras negativas)
   */
  applySacredPolicyToQuery(query) {
    if (!query) return "";
    // Retornamos la query original limpia, sin añadir nada
    return query.split(" -")[0].trim();
  }

  /**
   * Validación de contenido (Neutralidad total)
   */
  isContentSacred(video) {
    return true;
  }

  /**
   * Encontrar yt-dlp en el sistema
   */
  findYtDlp() {
    if (app.isPackaged) {
      const possiblePaths = [
        path.join(process.resourcesPath, "bin", "yt-dlp"),
        path.join(process.resourcesPath, "app.asar.unpacked", "bin", "yt-dlp"),
        path.join(app.getAppPath(), "..", "bin", "yt-dlp"),
        path.join(app.getAppPath() + ".unpacked", "bin", "yt-dlp"),
        path.join(path.dirname(app.getPath("exe")), "resources", "bin", "yt-dlp"),
      ];
      const found = possiblePaths.find((p) => fs.existsSync(p));
      return found || "yt-dlp";
    } else {
      const devPaths = [
        path.join(__dirname, "..", "..", "resources", "bin", "yt-dlp"),
        path.join(app.getAppPath(), "src", "resources", "bin", "yt-dlp"),
        path.join(process.cwd(), "src", "resources", "bin", "yt-dlp"),
      ];
      const found = devPaths.find((p) => fs.existsSync(p));
      return found || "yt-dlp";
    }
  }

  // 🔥 SISTEMA DE COLA PARA LIMITAR CONCURRENCIA
  async enqueue(fn, key) {
    // Si ya hay una solicitud pendiente con la misma key, esperar
    if (this.pendingRequests.has(key)) {
      console.log('⏳ [COLA] Esperando resultado existente:', key);
      return this.pendingRequests.get(key);
    }

    const promise = new Promise((resolve, reject) => {
      this.queue.push({ fn, key, resolve, reject });
      this.processQueue();
    });

    this.pendingRequests.set(key, promise);
    
    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  async processQueue() {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.activeRequests++;
    const { fn, key, resolve, reject } = this.queue.shift();

    console.log(`🔄 [COLA] Procesando (${this.activeRequests}/${this.maxConcurrent}):`, key);

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      console.error('❌ [COLA] Error:', key, error.message);
      reject(error);
    } finally {
      this.activeRequests--;
      this.processQueue(); // Procesar siguiente en cola
    }
  }

  /**
   * Buscar videos en YouTube (CON CACHÉ Y FILTRO SAGRADO)
   */
  async search(query, limit = 20) {
    const filteredQuery = this.applySacredPolicyToQuery(query);
    const cacheKey = `search:${filteredQuery}:${limit}`;
    
    // Verificar caché
    const cached = this.cache.searches.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 min
      console.log('📦 [CACHÉ] Búsqueda:', query);
      return cached.data;
    }

    return this.enqueue(async () => {
      console.log('🔍 [FETCH] Buscando:', query, `(límite: ${limit})`);
      console.log('🛡️ [SAGRADO] Query procesada:', filteredQuery);
      
      return new Promise((resolve) => {
        const command = `"${this.ytdlpPath}" "ytsearch${limit}:${this.escapeQuery(filteredQuery)}" --dump-json --no-playlist --flat-playlist --skip-download --no-warnings --no-check-certificate`;

        exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
          if (error) {
            console.error("❌ Error en búsqueda, intentando fallback...");
            this.fallbackSearch(query, limit).then(resolve).catch(() => resolve([]));
            return;
          }

          try {
            const results = stdout
              .trim()
              .split("\n")
              .filter((line) => line.trim().startsWith("{"))
              .map((line) => {
                try { return JSON.parse(line); } catch { return null; }
              })
              .filter(Boolean)
              .map((video) => this.formatVideoResult(video));

            // Guardar en caché
            this.cache.searches.set(cacheKey, { data: results, timestamp: Date.now() });
            console.log(`✅ Resultados encontrados: ${results.length} videos`);
            resolve(results);
          } catch {
            resolve([]);
          }
        });
      });
    }, cacheKey);
  }

  /**
   * Búsqueda de fallback (CON FILTRO SAGRADO)
   */
  async fallbackSearch(query, limit = 20) {
    const filteredQuery = this.applySacredPolicyToQuery(query);
    return new Promise((resolve) => {
      const command = `"${this.ytdlpPath}" "ytsearch${limit}:${this.escapeQuery(filteredQuery)}" --dump-json --no-playlist --skip-download --no-warnings --no-check-certificate`;

      exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
        if (error) { resolve([]); return; }
        try {
          const results = stdout
            .trim()
            .split("\n")
            .filter((line) => line.trim().startsWith("{"))
            .map((line) => {
              try { return JSON.parse(line); } catch { return null; }
            })
            .filter(Boolean)
            .map((video) => this.formatVideoResult(video));
          resolve(results);
        } catch {
          resolve([]);
        }
      });
    });
  }

  /**
   * Obtener información detallada de un video (CON CACHÉ Y VALIDACIÓN)
   */
  async getVideoInfo(videoId) {
    // 🛡️ SEGURIDAD: Si el ID es una ruta local (base64 o path), no buscar en YouTube
    if (!videoId || videoId.length > 20 || videoId.includes("/") || videoId.includes("\\")) {
      console.log('🏠 [LOCAL] Ignorando búsqueda de info en YouTube para ID local');
      return null;
    }

    const cacheKey = `video:${videoId}`;
    
    const cached = this.cache.videos.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 1800000) {
      console.log('📦 [CACHÉ] Video:', videoId);
      return cached.data;
    }

    return this.enqueue(async () => {
      console.log('🎬 [FETCH] Video:', videoId);
      
      return new Promise((resolve, reject) => {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const command = `"${this.ytdlpPath}" "${url}" --dump-json --no-playlist --skip-download --no-warnings`;

        exec(command, { timeout: 10000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
          if (error) { reject(error); return; }
          try {
            const info = JSON.parse(stdout.trim());
            const result = this.formatVideoResult(info);
            this.cache.videos.set(cacheKey, { data: result, timestamp: Date.now() });
            resolve(result);
          } catch {
            reject(new Error("Error parseando info del video"));
          }
        });
      });
    }, cacheKey);
  }

  /**
   * Obtener videos relacionados (CON FILTRO SAGRADO)
   */
  async getRelatedVideos(videoId, limit = 12) {
    // 🛡️ SEGURIDAD: Si el ID es una ruta local, no hay "relacionados" en la nube
    if (!videoId || videoId.length > 20 || videoId.includes("/") || videoId.includes("\\")) {
      return [];
    }

    const cacheKey = `related:${videoId}:${limit}`;
    
    const cached = this.cache.related.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 600000) { // 10 min
      console.log('📦 [CACHÉ] Relacionados:', videoId);
      return cached.data;
    }

    return this.enqueue(async () => {
      console.log('🔗 [FETCH] Relacionados:', videoId);
      
      return new Promise((resolve) => {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        // Para relacionados no inyectamos query negativa porque yt-dlp saca los "related" directamente, 
        // pero sí aplicamos el filtro de metadatos (Nivel 2)
        const command = `"${this.ytdlpPath}" "${url}" --dump-json --no-playlist --flat-playlist --skip-download --no-warnings --playlist-end ${limit * 2}`; // Pedimos más para que al filtrar nos queden suficientes

        exec(command, { timeout: 10000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
          if (error) { resolve([]); return; }
          try {
            const results = stdout
              .trim()
              .split("\n")
              .filter((line) => line.trim().startsWith("{"))
              .slice(1)
              .map((line) => {
                try { return JSON.parse(line); } catch { return null; }
              })
              .filter(Boolean)
              .map((video) => this.formatVideoResult(video))
              .slice(0, limit);
            
            this.cache.related.set(cacheKey, { data: results, timestamp: Date.now() });
            resolve(results);
          } catch {
            resolve([]);
          }
        });
      });
    }, cacheKey);
  }

  /**
   * Obtener thumbnail de un canal (CON CACHÉ)
   */
  async getChannelThumbnail(channelId) {
    const cacheKey = `thumbnail:${channelId}`;
    
    const cached = this.cache.thumbnails.get(cacheKey);
    if (cached) {
      console.log('📦 [CACHÉ] Thumbnail:', channelId);
      return cached;
    }

    return this.enqueue(async () => {
      console.log('🖼️ [FETCH] Thumbnail:', channelId);
      
      return new Promise((resolve) => {
        const url = `https://www.youtube.com/channel/${channelId}`;
        const command = `"${this.ytdlpPath}" "${url}" --dump-json --skip-download --no-playlist --no-warnings --no-check-certificate --playlist-end 1`;

        exec(command, { timeout: 8000, maxBuffer: 1024 * 1024 * 2 }, (error, stdout) => {
          if (error) {
            const fallback = `https://ui-avatars.com/api/?name=YT&background=1a1a2e&color=fff&size=120`;
            resolve(fallback);
            return;
          }
          try {
            const data = JSON.parse(stdout.trim());
            const thumbnail = data.thumbnail || data.thumbnails?.[0]?.url || data.uploader_thumbnail || 
              `https://ui-avatars.com/api/?name=${channelId.substring(0,2)}&background=1db954&color=fff&size=120`;
            this.cache.thumbnails.set(cacheKey, thumbnail);
            resolve(thumbnail);
          } catch {
            resolve(`https://ui-avatars.com/api/?name=YT&background=1a1a2e&color=fff&size=120`);
          }
        });
      });
    }, cacheKey);
  }

  /**
   * Buscar canales de YouTube (CON FILTRO SAGRADO)
   */
  async searchChannels(artistName, limit = 10) {
    // IMPORTANTE: Para canales NO inyectamos query negativa en el Nivel 1.
    // Esto permite que YouTube encuentre el nombre exacto del canal (ej. Daniel Castro).
    // El filtrado se hace en el Nivel 2 (Post-procesamiento).
    const cacheKey = `channels:v2:${artistName}:${limit}`;
    
    const cached = this.cache.searches.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 600000) { // 10 min
      console.log('📦 [CACHÉ] Canales:', artistName);
      return cached.data;
    }

    return this.enqueue(async () => {
      console.log('📺 [FETCH] Buscando canales oficiales para:', artistName);
      
      return new Promise((resolve) => {
        // Buscamos directamente el canal oficial
        const command = `"${this.ytdlpPath}" "ytsearch${limit}:${this.escapeQuery(artistName)} official channel" --dump-json --no-playlist --flat-playlist --skip-download --no-warnings --no-check-certificate`;

        exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
          if (error) { resolve([]); return; }
          try {
            const results = stdout
              .trim()
              .split("\n")
              .filter((line) => line.trim().startsWith("{"))
              .map((line) => {
                try { return JSON.parse(line); } catch { return null; }
              })
              .filter(Boolean)
              .filter((item) => item.channel_id || item.uploader_id)
              .map((item) => ({
                channelId: item.channel_id || item.uploader_id || "",
                name: item.uploader || item.channel || artistName,
                thumbnail: item.thumbnail || item.thumbnails?.[0]?.url || "",
                description: item.description?.substring(0, 200) || "",
                subscriberCount: item.subscriber_count ? this.formatViews(item.subscriber_count) : "",
                videoCount: item.view_count ? this.formatViews(item.view_count) : "",
                url: item.uploader_url || item.channel_url || "",
                verified: item.verified || false,
                topics: item.categories || item.tags || [],
              }));

            // Eliminar duplicados de canales
            const uniqueChannels = [];
            const seenIds = new Set();
            for (const ch of results) {
              if (!seenIds.has(ch.channelId)) {
                seenIds.add(ch.channelId);
                uniqueChannels.push(ch);
              }
            }

            this.cache.searches.set(cacheKey, { data: uniqueChannels, timestamp: Date.now() });
            console.log(`✅ Canales encontrados: ${uniqueChannels.length}`);
            resolve(uniqueChannels);
          } catch (e) {
            console.error("Error parseando canales:", e);
            resolve([]);
          }
        });
      });
    }, cacheKey);
  }

  /**
   * Obtener información detallada de un canal (CON CACHÉ - ¡CRÍTICO!)
   */
  async getChannelInfo(channelId) {
    // 1. VERIFICAR CACHÉ PRIMERO
    const cached = this.cache.channels.get(channelId);
    if (cached && (Date.now() - cached.timestamp) < 1800000) { // 30 min
      console.log('📦 [CACHÉ] Canal:', channelId);
      return cached.data;
    }

    // 2. ENCOLAR (máximo 2 concurrentes)
    return this.enqueue(async () => {
      console.log('📺 [FETCH] Canal:', channelId);
      
      return new Promise((resolve) => {
        const url = `https://www.youtube.com/channel/${channelId}`;
        const command = `"${this.ytdlpPath}" "${url}" --dump-json --skip-download --no-playlist --no-warnings --no-check-certificate --playlist-end 1`;

        exec(command, { timeout: 8000, maxBuffer: 1024 * 1024 * 2 }, (error, stdout) => {
          if (error) {
            // NO hacer fallback que genere más llamadas
            const fallback = {
              channelId: channelId,
              name: "Canal no disponible",
              thumbnail: "",
              exists: false
            };
            // Guardar en caché incluso el fallback
            this.cache.channels.set(channelId, { data: fallback, timestamp: Date.now() });
            resolve(fallback);
            return;
          }

          try {
            const data = JSON.parse(stdout.trim());
            const result = {
              channelId: data.channel_id || data.uploader_id || channelId,
              name: data.uploader || data.channel || "Desconocido",
              description: data.description?.substring(0, 200) || "",
              thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || "",
              subscriberCount: data.subscriber_count ? this.formatViews(data.subscriber_count) : "",
              videoCount: data.view_count ? this.formatViews(data.view_count) : "",
              url: data.uploader_url || data.channel_url || url,
              verified: data.verified || false,
              topics: data.categories || data.tags || [],
              exists: true
            };

            // Guardar en caché
            this.cache.channels.set(channelId, { data: result, timestamp: Date.now() });
            resolve(result);
          } catch {
            const fallback = {
              channelId: channelId,
              name: "Error al cargar",
              thumbnail: "",
              exists: false
            };
            this.cache.channels.set(channelId, { data: fallback, timestamp: Date.now() });
            resolve(fallback);
          }
        });
      });
    }, `channel:${channelId}`);
  }

  /**
   * Obtener MÚLTIPLES canales en lote (NUEVO)
   */
  async getChannelsInfo(channelIds) {
    const uniqueIds = [...new Set(channelIds)];
    console.log(`📺 Obteniendo ${uniqueIds.length} canales (lote)`);
    
    const results = [];
    for (let i = 0; i < uniqueIds.length; i += 3) {
      const batch = uniqueIds.slice(i, i + 3);
      const batchResults = await Promise.allSettled(
        batch.map(id => this.getChannelInfo(id))
      );
      results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean));
    }
    
    return results;
  }

  /**
   * Formatear resultado para el frontend
   */
  formatVideoResult(video) {
    return {
      videoId: video.id || video.video_id || "",
      title: video.title || "Sin título",
      thumbnail: video.thumbnail || video.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${video.id || video.video_id}/hqdefault.jpg`,
      author: video.uploader || video.channel || video.creator || video.uploader_id || "Desconocido",
      duration: this.formatDuration(video.duration || video.duration_string || video.length_seconds),
      views: this.formatViews(video.view_count),
      url: video.webpage_url || video.url || `https://youtube.com/watch?v=${video.id || video.video_id}`,
      description: video.description?.substring(0, 200) || "",
      uploadDate: video.upload_date || "",
      likeCount: video.like_count || 0,
    };
  }

  formatDuration(duration) {
    if (!duration) return "";
    if (typeof duration === "string" && duration.includes(":")) return duration;
    const seconds = typeof duration === "string" ? parseInt(duration) : duration;
    if (!seconds || isNaN(seconds)) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  formatViews(views) {
    if (!views) return "";
    const num = typeof views === "string" ? parseInt(views) : views;
    if (!num || isNaN(num)) return "";
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M vistas`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K vistas`;
    return `${num} vistas`;
  }

  escapeQuery(query) {
    return query
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/`/g, "\\`")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]")
      .trim();
  }

  // 🔥 LIMPIAR CACHÉ ANTIGUO
  cleanCache() {
    const now = Date.now();
    
    // Canales: 1 hora
    for (const [key, value] of this.cache.channels.entries()) {
      if (now - value.timestamp > 3600000) this.cache.channels.delete(key);
    }
    // Búsquedas: 30 min (antes 5 min, muy poco)
    for (const [key, value] of this.cache.searches.entries()) {
      if (now - value.timestamp > 1800000) this.cache.searches.delete(key);
    }
    // Videos: 1 hora
    for (const [key, value] of this.cache.videos.entries()) {
      if (now - value.timestamp > 3600000) this.cache.videos.delete(key);
    }
    // Relacionados: 30 min
    for (const [key, value] of this.cache.related.entries()) {
      if (now - value.timestamp > 1800000) this.cache.related.delete(key);
    }
    // Thumbnails: NO BORRAR (o durar 24 horas)
    for (const [key, value] of this.cache.thumbnails.entries()) {
      // Las URLs de thumbnails son ligeras y es mejor mantenerlas
      if (now - (value.timestamp || 0) > 86400000) this.cache.thumbnails.delete(key);
    }
    
    console.log('🧹 Caché limpiado. Estado actual:', 
                'Canales:', this.cache.channels.size, 
                'Thumbnails:', this.cache.thumbnails.size);
  }
}

module.exports = { YouTubeSearchService };