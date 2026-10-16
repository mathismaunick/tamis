import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/labels";

// L'espace insécable de la typographie française : « 16 h 31 » ne se coupe jamais en fin de ligne.
const nbsp = " ";

describe("un moment du journal", () => {
  it("s'écrit comme le reste de Tamis, à l'heure de Paris", () => {
    expect(formatDateTime("2026-10-14T14:31:00Z")).toBe(`14 oct., 16${nbsp}h${nbsp}31`);
    expect(formatDateTime("2026-12-01T08:05:00Z")).toBe(`1 déc., 9${nbsp}h${nbsp}05`);
  });

  it("lit l'horodatage tel que Postgres le rend en texte", () => {
    expect(formatDateTime("2026-10-14 14:31:05.123+00")).toBe(`14 oct., 16${nbsp}h${nbsp}31`);
  });

  it("change de jour à minuit, heure de Paris", () => {
    expect(formatDateTime("2026-10-14T22:02:00Z")).toBe(`15 oct., 0${nbsp}h${nbsp}02`);
  });
});
