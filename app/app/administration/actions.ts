"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sortByProgramOrder } from "@/lib/program-order";

export type AppUserRow = { id: string; email: string; created_at: string | null };
export type CityRow = { id: string; name: string; created_at: string | null };
export type ProgramTypeRow = { id: string; code: string; label: string; created_at: string | null };

export async function listAppUsers(): Promise<AppUserRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email, created_at")
    .order("email");
  if (error) return [];
  return (data ?? []) as AppUserRow[];
}

export async function addAppUser(formData: FormData): Promise<{ success: true } | { success: false; error: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { success: false, error: "El correo es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("app_users").insert({ email });
  if (error) {
    if (error.code === "23505") return { success: false, error: "Ese correo ya está en la lista." };
    return { success: false, error: error.message };
  }
  revalidatePath("/app/administration");
  return { success: true };
}

export async function removeAppUser(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("app_users").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/app/administration");
  return { success: true };
}

export async function listCities(): Promise<CityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cities")
    .select("id, name, created_at")
    .order("name");
  if (error) return [];
  return (data ?? []) as CityRow[];
}

export async function addCity(formData: FormData): Promise<{ success: true } | { success: false; error: string }> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { success: false, error: "El nombre de la ciudad es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("cities").insert({ name });
  if (error) {
    if (error.code === "23505") return { success: false, error: "Esa ciudad ya existe." };
    return { success: false, error: error.message };
  }
  revalidatePath("/app/administration");
  revalidatePath("/app/events");
  return { success: true };
}

export async function deleteCity(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: city } = await supabase.from("cities").select("name").eq("id", id).single();
  if (!city?.name) return { success: false, error: "Ciudad no encontrada." };
  const { count } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("city", city.name);
  if (count && count > 0) return { success: false, error: "No se puede eliminar: hay eventos que usan esta ciudad." };
  const { error } = await supabase.from("cities").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/app/administration");
  revalidatePath("/app/events");
  return { success: true };
}

export async function listProgramTypes(): Promise<ProgramTypeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("program_types")
    .select("id, code, label, created_at");
  if (error) return [];
  const rows = (data ?? []) as ProgramTypeRow[];
  return sortByProgramOrder(rows, (r) => r.code);
}

export async function addProgramType(formData: FormData): Promise<{ success: true } | { success: false; error: string }> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const label = String(formData.get("label") ?? "").trim();
  if (!code) return { success: false, error: "El código es obligatorio." };
  if (!label) return { success: false, error: "La etiqueta es obligatoria." };
  const supabase = await createClient();
  const { error } = await supabase.from("program_types").insert({ code, label });
  if (error) {
    if (error.code === "23505") return { success: false, error: "Ese código ya existe." };
    return { success: false, error: error.message };
  }
  revalidatePath("/app/administration");
  revalidatePath("/app/events");
  return { success: true };
}

export async function deleteProgramType(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("program_types").select("code").eq("id", id).single();
  if (!row?.code) return { success: false, error: "Tipo de programa no encontrado." };
  const { count } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("program_type", row.code);
  if (count && count > 0) return { success: false, error: "No se puede eliminar: hay eventos que usan este programa." };
  const { error } = await supabase.from("program_types").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/app/administration");
  revalidatePath("/app/events");
  return { success: true };
}
