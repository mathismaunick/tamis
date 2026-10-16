"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, accessToken, safeNextPath } from "@/lib/access";

export type UnlockState = { error?: string };

export async function unlock(_previous: UnlockState, formData: FormData): Promise<UnlockState> {
  const expected = process.env.DEMO_ACCESS_CODE;
  const code = String(formData.get("code") ?? "").trim();
  if (expected && code !== expected) {
    return { error: "Ce code ne correspond pas. Vérifiez-le et réessayez." };
  }
  if (expected) {
    (await cookies()).set(ACCESS_COOKIE, accessToken(expected), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  redirect(safeNextPath(String(formData.get("suite") ?? "/")));
}
