import { createHash } from "node:crypto";

/** Texte ramené à l'essentiel : sans casse, sans ponctuation, espaces réduits. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Empreinte d'un retour : même client et même texte, au formatage près.
 * Le même message envoyé par email puis par ticket est importé, mais compté une seule fois.
 */
export function contentHash(clientName: string, text: string): string {
  return createHash("sha256").update(`${normalizeText(clientName)}|${normalizeText(text)}`).digest("hex");
}

/** La longueur minimale d'un extrait, une fois normalisé, pour y reconnaître un message déjà reçu. */
const MIN_EXCERPT = 60;

/**
 * Le même message sous deux formes : l'un contient l'autre, au formatage près. C'est le cas d'un email collé dans
 * l'agent sans sa formule de politesse, puis reçu en entier dans un CSV. Sous 60 caractères, rien n'est conclu :
 * « Merci ! » n'est le doublon de personne.
 */
export function sameMessage(a: string, b: string): boolean {
  const first = normalizeText(a);
  const second = normalizeText(b);
  if (first === second) return true;
  const [short, long] = first.length <= second.length ? [first, second] : [second, first];
  return short.length >= MIN_EXCERPT && long.includes(short);
}
