import { redirect } from "next/navigation";

/** The script list moved into the home screen's second tab; old links still land there. */
export default function ScriptsPage() {
  redirect("/projects?mode=existing");
}
