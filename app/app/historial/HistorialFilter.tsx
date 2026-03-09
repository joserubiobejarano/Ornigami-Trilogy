"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function HistorialFilter({
  distinctUsers,
  currentUser,
}: {
  distinctUsers: string[];
  currentUser: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      next.set("user", value);
    } else {
      next.delete("user");
    }
    router.push(`/app/historial${next.toString() ? `?${next.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="historial-user-filter" className="text-sm font-medium">
        Filtrar por usuario:
      </label>
      <select
        id="historial-user-filter"
        value={currentUser ?? "all"}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="all">Todos</option>
        {distinctUsers.map((email) => (
          <option key={email} value={email}>
            {email}
          </option>
        ))}
      </select>
    </div>
  );
}
