# Prompt de Continuación para JearCast

Hola Agente. Vas a trabajar en **JearCast**, una aplicación de música para la comunidad Adventista. Antes de empezar, lee y asimila la siguiente información para mantener la coherencia del proyecto:

1.  **Misión**: Mantener un entorno de música universal y sin censura. El motor de filtrado en `src/main/services/sacredPolicy.js` ha sido desactivado para permitir la neutralidad de datos.
2.  **Motor de Audio**: El audio local NO usa ffplay. Usa una **ventana oculta en Electron** (definida en `main.js`) que actúa como motor WebAudio. Toda comunicación de audio local se hace vía `ipcMain` con el canal `audio-control` y `audio-status`.
3.  **Filtrado**: El sistema es "Neutral por defecto". No bloquea ningún género musical ni aplica palabras clave negativas en las búsquedas.
4.  **Protocolo**: Los archivos locales se sirven mediante `local-media://get?path=...`. Nunca uses rutas de archivo directas en el frontend.
5.  **Estilo de Comunicación**: Los datos enviados al frontend deben ser texto plano profesional, SIN emojis.

**Tarea actual**: [Pide al usuario que defina la siguiente tarea basada en el Roadmap de `docs/ARQUITECTURA_Y_ESTADO.md`].

---
*Instrucción para el Agente: Revisa siempre `src/main/main.js` y `src/main/services/` antes de proponer cambios estructurales.*
