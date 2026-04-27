
/**
 * 🕊️ POLÍTICAS DE CONTENIDO (Versión General)
 * JearCast General: Sin restricciones de género o contenido.
 * El backend actúa como un proveedor de datos neutral.
 */

const SACRED_BLACKLIST = [];

/**
 * PALABRAS NEGATIVAS PARA YOUTUBE
 * En la versión general, no se añaden exclusiones para respetar la búsqueda del usuario.
 */
const NEGATIVE_KEYWORDS = "";

/**
 * Valida si el contenido es apto.
 * En la versión general, todo el contenido es aceptado (Neutralidad).
 */
function isContentSacred(video) {
  return { sacred: true };
}

module.exports = {
  SACRED_BLACKLIST,
  NEGATIVE_KEYWORDS,
  isContentSacred
};
