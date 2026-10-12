import { redirect } from "next/navigation";

/**
 * The style picker moved into the code screen (its "สไตล์" tab, components/ide/StylePane.tsx): a project
 * gets a name first, then its look. Old links land on the project (?project=<id>) or the project list.
 */
export default async function StyleShoppingPage({ searchParams }: { searchParams: Promise<{ project?: string | string[] }> }) {
  const { project } = await searchParams;
  if (typeof project === "string" && /^[0-9a-f-]{36}$/i.test(project)) redirect(`/projects/${project}`);
  redirect("/projects?new=1");
}
