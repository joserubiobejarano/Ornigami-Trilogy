import { getEventWithEnrollments } from "./actions";
import { EventCrmView } from "./EventCrmView";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getEventWithEnrollments(id, null);

  return <EventCrmView data={data} />;
}
