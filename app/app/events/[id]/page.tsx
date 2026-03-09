import { listCities } from "@/app/app/administration/actions";
import { getEventWithEnrollments } from "./actions";
import { EventCrmView } from "./EventCrmView";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [data, cities] = await Promise.all([
    getEventWithEnrollments(id, null),
    listCities(),
  ]);

  const cityOptions = cities.map((c) => c.name);

  return <EventCrmView data={data} cityOptions={cityOptions} />;
}
