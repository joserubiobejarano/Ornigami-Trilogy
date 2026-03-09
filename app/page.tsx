import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function isRefreshTokenError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { __isAuthError?: boolean; code?: string }).__isAuthError === true &&
    (e as { code?: string }).code === "refresh_token_not_found"
  );
}

export default async function Home() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      redirect("/app");
    }
    redirect("/login");
  } catch (e) {
    if (isRefreshTokenError(e)) {
      redirect("/login");
    }
    throw e;
  }
}
