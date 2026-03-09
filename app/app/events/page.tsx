import { createClient } from "@/lib/supabase/server";
import { listCities, listProgramTypes } from "@/app/app/administration/actions";
import { NewEventButton } from "./NewEventModal";
import { EventsTable } from "./EventsTable";
import { processScheduledDeletions } from "./actions";
import type { EventRow } from "./types";

export default async function EventsPage() {
  await processScheduledDeletions();

  const supabase = await createClient();
  const [eventsResult, cities, programTypes] = await Promise.all([
    supabase.from("events").select("*").order("created_at", { ascending: false }),
    listCities(),
    listProgramTypes(),
  ]);

  const rawRows = (eventsResult.data ?? []) as EventRow[];

  const PROGRAM_TYPE_ORDER: Record<string, number> = {
    PT: 0,
    LT: 1,
    TL: 2,
    OTRO: 3,
  };
  const parseCodeNumber = (code: string): number => {
    const match = String(code ?? "").match(/^\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };
  const programTypeOrder = (pt: string): number =>
    PROGRAM_TYPE_ORDER[String(pt ?? "").trim().toUpperCase()] ?? 99;

  const rows = [...rawRows].sort((a, b) => {
    const numA = parseCodeNumber(a.code);
    const numB = parseCodeNumber(b.code);
    if (numB !== numA) return numB - numA;
    const orderA = programTypeOrder(a.program_type);
    const orderB = programTypeOrder(b.program_type);
    if (orderA !== orderB) return orderA - orderB;
    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return createdB - createdA;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Entrenamientos</h2>
        <NewEventButton cities={cities} programTypes={programTypes} />
      </div>

      <EventsTable rows={rows} cities={cities} programTypes={programTypes} />
    </div>
  );
}
