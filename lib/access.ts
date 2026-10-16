import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Code d'accès de la démo en ligne : sans lui, personne d'autre que le jury ne consomme les crédits
 * ni ne modifie le backlog. Le cookie contient une empreinte du code, jamais le code lui-même.
 */
export const ACCESS_COOKIE = "tamis_acces";

export function accessToken(code: string): string {
  return createHash("sha256").update(`tamis:${code}`).digest("hex");
}

/** Vrai si aucun code n'est configuré (développement local) ou si le cookie correspond au code. */
export function isAccessGranted(cookieValue: string | undefined, code: string | undefined): boolean {
  if (!code) return true;
  if (!cookieValue) return false;
  const expected = Buffer.from(accessToken(code));
  const received = Buffer.from(cookieValue);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Chemin de retour après saisie du code : uniquement un chemin interne, jamais une autre origine. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
