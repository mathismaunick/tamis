import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

/**
 * Client SQL de Neon (requêtes HTTP, sans connexion persistante : adapté aux fonctions Vercel).
 * Créé au premier appel : importer le module ne lit pas DATABASE_URL. Le build, lui, lit la base, pour
 * pré-rendre les pages avec leurs données en cache.
 */
export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL manquant : renseignez-le dans .env.local, copié de .env.example (voir le README).");
    }
    client = neon(url);
  }
  return client;
}

/** Un vecteur au format texte attendu par pgvector : [0.1,0.2,…]. */
export function toVector(values: readonly number[]): string {
  return `[${values.join(",")}]`;
}
