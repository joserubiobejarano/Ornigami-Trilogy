import { getPersonWithEnrollments } from "./actions";
import { PersonDetailView } from "./PersonDetailView";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPersonWithEnrollments(id);
  return <PersonDetailView data={data} />;
}
