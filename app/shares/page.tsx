import { redirect } from "next/navigation";

/** ระบบที่คนแชร์ is a view of the home screen now (components/shares/SharesView.tsx); old links land there. */
export default async function SharesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  redirect(params.order === "clones" ? "/projects?mode=shares&order=clones" : "/projects?mode=shares");
}
