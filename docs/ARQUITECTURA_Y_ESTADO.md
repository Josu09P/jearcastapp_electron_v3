# JearCast - Documentación Técnica y Estado del Proyecto

## Misión del Proyecto
JearCast es una aplicación de streaming y reproductor local diseñada exclusivamente para la comunidad Cristiana Adventista. Su objetivo es proporcionar un entorno de adoración puro, filtrando géneros mundanos (Pop, Rock, Reguetón, etc.) y priorizando música sacra, himnos y ministerios adventistas.

## Arquitectura Técnica
*   **Frontend**: Vue 3 (Gestiona la UI y el reproductor de YouTube).
*   **Backend**: Electron (Gestiona el sistema de archivos, motor de audio local y filtrado).
*   **Scraping/Búsqueda**: `yt-dlp` para YouTube.
*   **Procesamiento de Audio**: `ffmpeg` / `ffprobe`.
*   **Motor de Audio Local**: Ventana oculta de Electron (Web Audio API) para máxima compatibilidad sin dependencias externas.

## Funcionalidades Implementadas

### 1. Políticas de Filtrado Sagrado (Backend)
*   **Nivel 1 (Preventivo)**: Inyección de palabras clave negativas en las búsquedas de YouTube para omitir contenido secular.
*   **Nivel 2 (Correctivo)**: Escaneo de metadatos (título, descripción, etiquetas) contra una Blacklist de géneros prohibidos.
*   **Modo Permisivo**: Solo bloquea lo que está en la Blacklist; permite canciones suaves de artistas cristianos aunque el título sea genérico (ej: "Solo Amor" de Karen Cruzado).
*   **Búsqueda de Canales**: Optimizada para encontrar canales oficiales de artistas sin bloqueos por palabras negativas.

### 2. Módulo de Música Local
*   **Protocolo Seguro**: Uso de `local-media://` para acceder a archivos locales sin violar CORS.
*   **Escaneo Robusto**: Soporte para .mp3, .wav, .flac, .ogg, .m4a, .aac.
*   **Metadatos**: Extracción de títulos y artistas reales mediante `ffprobe`.
*   **Caché**: Persistencia durante la sesión (limpieza automática desactivada por requerimiento del usuario).

### 3. Motor de Audio "ElectronAudio"
*   **Independencia**: El backend es el único responsable del audio local.
*   **Sincronización**: Emisión de eventos de progreso (`currentTime`, `duration`) y estado (`isPlaying`) hacia el frontend para mover las barras de progreso y animaciones.
*   **Botón de Pánico**: `audio-stop` libera inmediatamente los recursos y detiene el sonido al cambiar a YouTube.

## Futuro del Proyecto
*   **Gestión de Playlists**: Crear y guardar listas de reproducción locales y mixtas.
*   **Historial de Escucha**: Guardar lo último escuchado localmente.
*   **Mejora de Heurísticas**: Refinar el filtrado para detectar versiones "sacras" de canciones famosas.
*   **Empaquetado**: Optimizar `electron-builder` para distribución en Linux (AppImage, Deb).

## Recordatorios Importantes
*   **Política de Comunicación**: No enviar emojis en datos IPC o logs profesionales hacia el frontend.
*   **Seguridad**: El protocolo `local-media` solo debe servir rutas absolutas verificadas.
*   **Performance**: No procesar metadatos pesados (como carátulas) en el primer escaneo de carpetas grandes.
