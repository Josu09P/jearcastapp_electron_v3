# JearCast - Documentación Técnica y Estado del Proyecto

## Misión del Proyecto
JearCast es una aplicación de streaming y reproductor local diseñada para proporcionar una experiencia de música universal y sin censura. En esta Versión General, se han eliminado todas las políticas de restricción de género para permitir el acceso a cualquier tipo de contenido musical.

## Arquitectura Técnica
*   **Frontend**: Vue 3 (Gestiona la UI y el reproductor de YouTube).
*   **Backend**: Electron (Gestiona el sistema de archivos, motor de audio local y provisión neutral de datos).
*   **Scraping/Búsqueda**: `yt-dlp` para YouTube.
*   **Procesamiento de Audio**: `ffmpeg` / `ffprobe`.
*   **Motor de Audio Local**: Ventana oculta de Electron (Web Audio API) para máxima compatibilidad sin dependencias externas.

## Funcionalidades Implementadas

### 1. Motor de Búsqueda Neutral (Backend)
*   **Búsqueda Universal**: No se aplican filtros de palabras clave ni términos de exclusión negativos en las consultas de YouTube.
*   **Post-procesamiento Libre**: Se ha eliminado el escaneo de metadatos contra blacklists, permitiendo que todos los resultados encontrados sean devueltos al usuario.
*   **Acceso Total**: Soporte para visualizar cualquier canal de YouTube y video sin restricciones por género musical.

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
