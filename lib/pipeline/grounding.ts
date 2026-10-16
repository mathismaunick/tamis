/**
 * Ancrage des citations : une citation n'est acceptée que si elle figure mot pour mot dans le retour.
 * Seules différences tolérées : les espaces (sauts de ligne, espaces insécables) et les guillemets
 * ou apostrophes typographiques. Une citation tronquée ou reformulée est rejetée.
 */
const EQUIVALENTS: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "«": '"',
  "»": '"',
};

/** Texte normalisé, avec pour chaque caractère sa position dans le texte d'origine. */
function normalizeWithMap(text: string): { value: string; map: number[] } {
  let value = "";
  const map: number[] = [];
  let previousWasSpace = false;
  for (let index = 0; index < text.length; index++) {
    let char = EQUIVALENTS[text[index]] ?? text[index];
    if (/\s/u.test(char)) {
      if (previousWasSpace) continue;
      char = " ";
      previousWasSpace = true;
    } else {
      previousWasSpace = false;
    }
    value += char;
    map.push(index);
  }
  // Les espaces intérieurs des guillemets français (« dépend de ») ne comptent pas.
  let compact = "";
  const compactMap: number[] = [];
  for (let index = 0; index < value.length; index++) {
    if (value[index] === " " && (value[index - 1] === '"' || value[index + 1] === '"')) continue;
    compact += value[index];
    compactMap.push(map[index]);
  }
  return { value: compact, map: compactMap };
}

/** Position de la citation dans le retour, ou null si elle n'y figure pas. */
export function locateQuote(source: string, quote: string): { start: number; end: number } | null {
  const needle = normalizeWithMap(quote.trim().replace(/^["'«»“”\s]+|["'«»“”\s]+$/gu, "")).value;
  if (needle.length < 3) return null;
  const haystack = normalizeWithMap(source);
  const index = haystack.value.indexOf(needle);
  if (index === -1) return null;
  return { start: haystack.map[index], end: haystack.map[index + needle.length - 1] + 1 };
}

export function isGrounded(source: string, quote: string): boolean {
  return locateQuote(source, quote) !== null;
}

/** Découpe un texte en segments, en marquant les passages cités (pour le surlignage). */
export function highlightSegments(source: string, quotes: string[]): Array<{ text: string; quoteIndex: number | null }> {
  const ranges = quotes
    .map((quote, quoteIndex) => ({ ...locateQuote(source, quote), quoteIndex }))
    .filter((range): range is { start: number; end: number; quoteIndex: number } => range.start !== undefined)
    .sort((a, b) => a.start - b.start);

  const segments: Array<{ text: string; quoteIndex: number | null }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue; // deux citations qui se chevauchent : on garde la première
    if (range.start > cursor) segments.push({ text: source.slice(cursor, range.start), quoteIndex: null });
    segments.push({ text: source.slice(range.start, range.end), quoteIndex: range.quoteIndex });
    cursor = range.end;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), quoteIndex: null });
  return segments;
}
