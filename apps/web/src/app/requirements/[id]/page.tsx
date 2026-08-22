import { redirect } from "next/navigation";

export default async function LegacyWorkbenchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/?p=${encodeURIComponent(id)}`);
}
