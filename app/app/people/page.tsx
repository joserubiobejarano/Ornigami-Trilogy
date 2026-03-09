import { listCities } from "@/app/app/administration/actions";
import { PeopleList } from "./PeopleList";
import { getFilteredPeople, getEventFilterOptions } from "./actions";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{
    city?: string;
    payment?: string;
    entrenamiento?: string;
  }>;
}) {
  const params = await searchParams;
  const city = params.city && params.city !== "all" ? params.city : undefined;
  const paymentMethod =
    params.payment && params.payment !== "all" ? params.payment : undefined;
  const eventId =
    params.entrenamiento && params.entrenamiento.trim() ? params.entrenamiento.trim() : undefined;

  const [{ people, counts }, eventFilterOptions, cities] = await Promise.all([
    getFilteredPeople({
      city,
      paymentMethod,
      eventId,
    }),
    getEventFilterOptions(),
    listCities(),
  ]);

  const cityOptions = cities.map((c) => c.name);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1 sm:px-0">
      <h2 className="text-2xl font-semibold">Participantes</h2>
      <PeopleList
        people={people}
        counts={counts}
        filterCity={city ?? "all"}
        filterPayment={paymentMethod ?? "all"}
        filterEntrenamiento={eventId ?? "all"}
        eventFilterOptions={eventFilterOptions}
        cityOptions={cityOptions}
      />
    </div>
  );
}
