import { redirect } from "next/navigation";

/** The desktop app opens straight into the project list. */
export default function Home() {
  redirect("/projects");
}
