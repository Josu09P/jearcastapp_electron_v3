# Guía de Adaptación para Windows - JearCast v1.2.1

Este documento detalla los cambios técnicos realizados para permitir la compatibilidad, estabilidad y compilación de JearCast en entornos Windows, manteniendo la paridad con la versión original de Linux.

## 1. Gestión de Binarios (yt-dlp y FFmpeg)
El cambio más crítico fue adaptar el motor de YouTube, ya que los binarios de Linux no son compatibles con Windows.

- **Detección Dinámica**: Se modificó `DownloadService.js` y `YouTubeSearchService.js` para detectar la plataforma (`process.platform`).
- **Soporte de Extensiones**: Ahora el código busca tanto `yt-dlp.exe` como `yt-dlp` (sin extensión) para evitar errores si el archivo se renombra.
- **Rutas de Producción**: Se ajustaron las rutas de búsqueda para incluir `app.asar.unpacked`, que es donde `electron-builder` coloca los archivos pesados que no pueden ejecutarse dentro del ASAR comprimido.
- **FFmpeg**: Se mantuvo la integración con `@ffmpeg-installer/ffmpeg`, asegurando que en Windows apunte al `.exe` correspondiente en `node_modules`.

## 2. Correcciones de Estabilidad y Errores
- **Error "Object has been destroyed"**: Se detectó que al cerrar la app en Windows, el servicio de audio intentaba enviar comandos a una ventana ya destruida. Se añadieron verificaciones `!this.audioWindow.isDestroyed()` en `AudioService.js`.
- **Desactivación de MPRIS**: El servicio MPRIS (Media Player Remote Interfacing Specification) depende de D-Bus, un sistema exclusivo de Linux. Se modificó `main.js` para que **no se inicie en Windows**, evitando el error de bus.
- **AppUserModelId**: Se configuró `app.setAppUserModelId("com.jearcast.JearCast")` para que Windows agrupe correctamente los iconos en la barra de tareas y gestione las notificaciones.

## 3. Configuración de Compilación (Build)
Se actualizó el `package.json` con la sección `build`:
- **Target**: Configurado para generar un instalador `nsis` y una versión `portable`.
- **Iconos**: Se requiere un formato `.ico` para Windows.
- **Unpack**: Se configuró `asarUnpack` para que los binarios de `bin/` y FFmpeg se extraigan correctamente al instalar la app.

## 4. Generación de Recursos Visuales
- **Script generate-ico.js**: Se creó un script que utiliza la librería `sharp` para convertir los logos PNG originales en un archivo `icon.ico` multi-resolución (desde 16x16 hasta 256x256), compatible con el explorador de archivos de Windows.
- **Carpeta build/icons-ico**: Se generaron versiones individuales de iconos en formato `.ico` por si se requieren para accesos directos específicos.

## 5. Optimización de Memoria (Prevención de Fugas)
- **Spawn vs Exec**: Se reemplazó el uso de `exec` por `spawn` en las búsquedas de YouTube de larga duración. `spawn` maneja mejor los buffers grandes, evitando picos de memoria.
- **Cache Cleanup**: Se implementó un intervalo de limpieza automática cada 15 minutos en `YouTubeSearchService.js` para liberar Mapas de memoria de búsquedas antiguas.
- **Destructor**: Se añadió un método `destroy()` al servicio de búsqueda para limpiar intervalos y suscripciones al cerrar la aplicación.

## 6. Rutas del Sistema
- **Descargas**: Se reemplazó la ruta hardcodeada `"Descargas"` por `app.getPath("downloads")`, lo que garantiza que funcione en Windows sin importar si el sistema está en inglés ("Downloads"), español u otro idioma.

---
**Instrucciones para compilar:**
1. Ejecutar `npm run build`.
2. El resultado estará en la carpeta `dist_electron/`.
