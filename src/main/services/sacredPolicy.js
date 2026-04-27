
/**
 * 🕊️ POLÍTICAS DE FILTRADO DE GÉNEROS (JearCast)
 * Solo bloquea géneros musicales no alineados con la adoración.
 */

const SACRED_BLACKLIST = [
  // Música Popular y Urbana
  "pop", "rock", "metal", "punk", "hip-hop", "rap", "trap", "phonk", "r&b",
  "regueton", "reggaeton", "dembow", "perreo", "urbano",
  // Electrónica
  "house", "techno", "trance", "dubstep", "edm", "lo-fi", "vaporwave", "dj", "remix",
  // Latino / Tropical
  "salsa", "merengue", "bachata", "cumbia", "vallenato", "tango", "samba", "bossa nova",
  // Regional / Folk Secular
  "country", "mariachi", "corridos", "ranchera", "banda", "flamenco",
  // Raíz Negra / Secular
  "jazz", "blues", "soul", "funk", "motown", "gospel secular"
];

/**
 * PALABRAS NEGATIVAS PARA YOUTUBE (Nivel 1)
 * Solo las más importantes para no confundir al algoritmo.
 */
const NEGATIVE_KEYWORDS = "-reggaeton -regueton -rock -pop -trap -rap -urbano";

/**
 * Valida si el contenido NO pertenece a géneros prohibidos.
 */
function isContentSacred(video) {
  if (!video) return false;

  const title = (video.title || video.name || "").toLowerCase();
  const description = (video.description || "").toLowerCase();
  const author = (video.uploader || video.author || video.channel || video.uploader_id || "").toLowerCase();
  const tags = Array.isArray(video.tags) ? video.tags.join(" ").toLowerCase() : "";
  const categories = Array.isArray(video.categories) ? video.categories.join(" ").toLowerCase() : "";

  const fullText = `${title} ${description} ${author} ${tags} ${categories}`;

  for (const term of SACRED_BLACKLIST) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(fullText)) {
      return { sacred: false, reason: `Género prohibido detectado: ${term}` };
    }
  }

  return { sacred: true };
}

module.exports = {
  SACRED_BLACKLIST,
  NEGATIVE_KEYWORDS,
  isContentSacred
};
