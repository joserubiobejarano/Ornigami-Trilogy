import { PeopleList } from "./PeopleList";
import { getFilteredPeople, getEventFilterOptions } from "./actions";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{
    city?: string;
    payment?: string;
    entrenamiento?: string;
    numero?: string;
  }>;
}) {
  const params = await searchParams;
  const city = params.city && params.city !== "all" ? params.city : undefined;
  const paymentMethod =
    params.payment && params.payment !== "all" ? params.payment : undefined;
  const programType =
    params.entrenamiento && params.entrenamiento.trim() ? params.entrenamiento.trim() : undefined;
  const eventCode =
    params.numero && params.numero.trim() ? params.numero.trim() : undefined;

  const [{ people, counts }, eventFilterOptions] = await Promise.all([
    getFilteredPeople({
      city,
      paymentMethod,
      programType,
      eventCode,
    }),
    getEventFilterOptions(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h2 className="text-2xl font-semibold">Participantes</h2>
      <PeopleList
        people={people}
        counts={counts}
        filterCity={city ?? "all"}
        filterPayment={paymentMethod ?? "all"}
        filterEntrenamiento={programType ?? "all"}
        filterNumero={eventCode ?? "all"}
        eventFilterOptions={eventFilterOptions}
      />
    </div>
  );
}
