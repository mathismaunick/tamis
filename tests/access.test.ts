import { describe, expect, it } from "vitest";
import { accessToken, isAccessGranted, safeNextPath } from "@/lib/access";

describe("code d'accès de la démo", () => {
  it("laisse tout passer quand aucun code n'est configuré", () => {
    expect(isAccessGranted(undefined, undefined)).toBe(true);
  });

  it("accepte le cookie qui correspond au code", () => {
    expect(isAccessGranted(accessToken("orbit-42"), "orbit-42")).toBe(true);
  });

  it("refuse un cookie absent, faux, ou contenant le code en clair", () => {
    expect(isAccessGranted(undefined, "orbit-42")).toBe(false);
    expect(isAccessGranted(accessToken("autre"), "orbit-42")).toBe(false);
    expect(isAccessGranted("orbit-42", "orbit-42")).toBe(false);
  });

  it("ne renvoie jamais vers une autre origine après la saisie du code", () => {
    expect(safeNextPath("/themes/3")).toBe("/themes/3");
    expect(safeNextPath("https://exemple.com")).toBe("/");
    expect(safeNextPath("//exemple.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
