import { BGKList } from "./BGKList";
import { getBGKEnrollments } from "./actions";

export default async function BGKPage() {
  const rows = await getBGKEnrollments();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h2 className="text-2xl font-semibold">Backlogs</h2>
      <BGKList rows={rows} />
    </div>
  );
}
