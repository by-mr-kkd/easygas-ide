import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { childEnv } from "@/lib/child-env";
import { srcDir } from "@/lib/local/paths";

/**
 * "เปิดโฟลเดอร์": show a project's code folder in the file manager. The app's server runs on the user's
 * own machine, so it opens the folder there. The path comes from the project id (validated by srcDir),
 * never from the client.
 */
export async function openProjectFolder(projectId: string): Promise<void> {
  const dir = srcDir(projectId);
  await mkdir(dir, { recursive: true });
  const [cmd, args]: [string, string[]] =
    process.platform === "win32" ? ["explorer.exe", [dir]] : process.platform === "darwin" ? ["open", [dir]] : ["xdg-open", [dir]];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", env: childEnv() });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
