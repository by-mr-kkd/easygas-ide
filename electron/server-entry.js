// Entry point of the server process inside the packaged app (copied to resources/app/desktop-entry.js).
//
// The shell (electron/main.js) keeps this process's stdin open and never writes to it. If the shell
// goes away for ANY reason — a crash, "End task", a forced log-off — the pipe closes, and this process
// takes itself down together with whatever it started (clasp, an AI CLI). Without this a server with no
// window would keep running in the background after such an exit.
const { execFile } = require("node:child_process");

let leaving = false;
function leave() {
  if (leaving) return;
  leaving = true;
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(process.pid), "/T", "/F"], () => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref(); // in case taskkill itself cannot run
  } else {
    process.exit(0);
  }
}
process.stdin.on("end", leave);
process.stdin.on("close", leave);
process.stdin.on("error", leave);
process.stdin.resume();

require("./server.js");
