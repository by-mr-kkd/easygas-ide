# CLAUDE.md — EasyGAS IDE

Local, single-user desktop app (Windows first) for building Google Apps Script tools with AI. Next.js 15
App Router server bound to 127.0.0.1; Electron wrapper planned. Ported from the hosted EasyGAS SaaS
(no Supabase, no login, no quotas). UI text Thai, code/identifiers English. Credit line: "Powered by Mr.KKD".

## Commands

```bash
npm run dev        # 127.0.0.1:3000
npm test           # node --test tests/**/*.test.ts
npm run typecheck
npm run build      # next build + scripts/check-trace.mjs (must pass before release)
npm run desktop:build   # Windows installer → dist/desktop/out
```

## Rules that must not regress (see docs/SPIKES.md + the security review)

- **Data** lives in `%APPDATA%\EasyGAS IDE` (`lib/local/paths.ts`). Every project file path goes through
  `resolveInSrc` (no traversal, no Windows device names / ADS / trailing dot-space). App metadata stays
  OUTSIDE `src/` — clasp pushes `src/` and the CLI engine is sandboxed to it.
- **Never use `os.homedir()` in server code** — Next's file tracer copies that folder (other apps'
  secrets) into the standalone bundle. Use `userDir()`. `check-trace.mjs` enforces this.
- **Claude Code engine** (`lib/engines/claude-cli.ts`): spawn the user's own `claude.exe` directly (no
  shell); prompt on stdin; `--setting-sources ""`, `--strict-mcp-config`, `--tools Read,Edit,Write,Glob,Grep`,
  `--permission-mode acceptEdits`, NO `--allowedTools`, NO `--bare` (kills subscription login);
  `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` + `_AUTO_MEMORY=1`; long-path cwd; delete planted `.claude/`,
  `.mcp.json`, `CLAUDE.md` before each run. Never read Claude credentials — the ONE exception is
  `lib/engines/claude-quota.ts` (status-bar quota), and only while the user's Settings switch `claude_quota` is on:
  the token is used for one request and dropped, never stored, logged, returned or passed on. Don't name
  features "Claude Code".
- **clasp** (`lib/clasp.ts`): always `-P <long path>` (else it reuses stray `.clasp.json` / rejects 8.3
  paths as symlinks); app's own `-A` auth file; never read its token; don't trust exit code alone;
  `create-script` overwrites `appsscript.json` → rewrite ours after; re-deploys PATCH the same deployment.
  clasp's sign-in cannot delete scripts in Drive.
- **Codex engine** (`lib/engines/codex-cli.ts`): Codex runs as a pure model — `--disable` every outward
  feature the installed version lists (refuse to run if `shell_tool` cannot be disabled), `-s read-only`,
  `--ignore-user-config`, `--ignore-rules`, `project_doc_max_bytes=0`, an always-empty working folder. It gets the
  files in the message and answers ONE JSON object (`--output-schema`); the APP applies the changes through
  `executeEgsTool`. Instructions go in a file (`model_instructions_file`) — they do not fit a Windows command line.
  Never give Codex a file or shell tool. Never read `~/.codex`.
- **Muse Code engine** (`lib/engines/muse-cli.ts`, Meta): same pure-model shape as Codex — every run passes
  `MUSE_LOCKDOWN` (`--disable-shell --disable-write --disable-web-tools --sandbox-network restricted
  --approval-mode untrusted --approval-judge off --no-foreign-personal-context`) and the app refuses a version whose
  `exec --help` lacks any required switch. Never pass `--yolo`, `--disable-sandbox`, `--disable-approval` or
  `--trust-workspace`. Spawn `muse-bin-<version>.exe` directly (the `muse.cmd` launcher needs a shell). It has no
  instructions-file flag: a fresh session's first message carries the instructions, and before resuming the app
  checks the session still exists (`muse export`) — an unknown `--session-id` silently starts an empty session.
  Never read `~/.config/muse/auth.json`. The user's own Muse settings (MCP servers, hooks) cannot be switched off.
  The API-key provider `muse` (api.meta.ai, OpenAI format) is a separate credential from the monthly plan.
- **The AI is picked per message** (`lib/ai-choice.ts`, `lib/ai-options.ts`, the chat box's `AiPicker`): the
  request carries `ai: {engine, provider?, model?}`, remembered as `project.ai`; Settings only sets what a NEW
  project starts with. Everything that calls an AI for a project follows that pick — chat, the re-check
  (through the CLI when the pick is a CLI engine: `lib/engines/cli-review.ts`) and the after-publish repair.
  A model name must pass `MODEL_ID` before it reaches a command line (it must not be readable as a flag).
- **One session per CLI engine** (`project.engine_sessions`, `lib/engines/engine-session.ts`): each remembers how
  many chat rows it has seen, and the turns it missed are quoted to it next time (`renderRecap`). CLI engines write
  plain-text rows and never set `llm_provider`; whether a history is tied to an API format is read from the rows
  (`apiProviderLock`) — tool traffic can only be replayed by the format that wrote it.
- **Install / sign-in buttons** (`lib/engines/cli-terminal.ts`): only the vendors' fixed install commands and a
  located absolute exe path go into the script; open the visible window via a hidden PowerShell `Start-Process`
  (spawned directly from the server, PowerShell sees no input and quits at once).
- **Child processes** get `childEnv()` (provider API keys stripped — `ANTHROPIC_API_KEY` / `META_API_KEY` would switch
  Claude Code / Muse Code to pay-as-you-go API billing).
- **middleware.ts**: loopback Host only; non-GET must be same-origin. Keep it on every route.
- **Locks**: `acquireProjectRun` returns a token; pass it to `releaseProjectRun`. File saves only check
  `isProjectBusy`. `updateProject` writes are serialized per project.
- API keys never go to the client (pages pass `hasKey` booleans only).
- **Three instruction layers** (docs/RULEBOOK.md): hard rules live in `GAS_RULEBOOK` + `validateGasFiles`;
  libraries/styling live ONLY in `lib/preferences.ts` (defaults + the user's choices render as one
  "Look & feel" block). Never write a library or style into `GAS_RULEBOOK` as a rule again, and never let
  a user choice switch off a hard rule.
- **Rulebook pack** (`rulebook/`, `lib/rulebook/`): `pack.json` is generated (`npm run rulebook:build`) —
  never hand-edit it or `rules/*.md`. A downloaded pack is used only after `verifyAndParsePack` (signature
  over the raw bytes BEFORE parsing, strictly newer version). The signing key never enters this repo. The
  AI gets the index, not the whole rulebook; per-turn card text rides on the user message and is never
  stored in history or put in the cached system block.
- **Lessons** (`lib/lessons.ts`, docs/RULEBOOK.md): the AI may only PROPOSE. Model-written lesson text
  reaches a prompt only after the user approved that exact text (status `active`); never widen that, and
  never let a proposal rewrite an approved lesson. Lessons ride on the turn's user message like rule cards.
- **A resumed Claude Code session keeps its ORIGINAL system prompt** (`--append-system-prompt-file` is not
  re-applied on `--resume`; verified live). Anything that can change mid-project must reach a resumed
  session through the turn's message — see `engineSystemPrompt` / `settingsNotice` in claude-cli.ts.
- **Desktop packaging** (docs/DESKTOP.md): the server and clasp reach the package through
  `scripts/desktop-after-pack.cjs`, never `extraResources` (it silently drops `node_modules` and dot-folders);
  `files` must keep `!**/node_modules/**`; clasp ships as ONE bundled file (thousands of small files made the
  first run after an install time out); the server child always gets `HOSTNAME=127.0.0.1`. The window has no
  Node access and never navigates off the app's origin.
- **Uninstall button** (`lib/desktop-uninstall.ts`, Settings → ข้อมูลในเครื่อง): it only LAUNCHES the NSIS uninstaller
  that sits next to the running executable, through a hidden PowerShell `Start-Process` — spawned directly, the
  uninstaller sees the app as its parent and skips its "close the running app" step. The path is derived from
  `process.execPath`, never from a request; `--delete-app-data` (electron-builder's switch) is the only option.
- **A page render must never wait on clasp**: `getClaspAccount` waits ~3 s, then answers optimistically; a
  failed check is not "signed out" and is never cached.
- **Premium = camera apps, checked offline** (`lib/premium/*`): a licence key `EGP1.<payload>.<sig>` is an
  Ed25519 signature verified against `LICENSE_PUBLIC_KEY` in `lib/premium/config.ts`; the key and the order
  secret live in `<dataRoot>/premium.json`. The order secret never reaches the client; the key reaches it
  ONLY when the user explicitly asks (Settings → Pro "แสดงรหัส" / "คัดลอกรหัส", and the key box shown once
  after a purchase or a restore) through `revealPremiumKeyAction`, never in initial props or status objects
  (status carries `keyMask` = first and last 6 chars). Restore on a new computer = email code:
  `premium-email-code {purpose:"restore"}` → 6-digit code → `premium-restore` → the key is verified offline
  with `parseLicense` (and must carry the same email) before it is stored, like a purchased key. When the
  offer has `emailVerify: true`, buying also needs an emailed `order` code first; when false (no email on
  the server) the purchase works without it and restore shows the Facebook-group line. Every server error
  code maps to a fixed short Thai line in `API_TEXT` (`lib/premium/api.ts`); the server's own message is
  never shown. The licence server is the Supabase
  project in `F:\SaaS\EasyGAS-Premium` (private repo, functions `premium-*`; the signing private key is in
  `%USERPROFILE%\.easygas-ide-keys\license-signing-key.pem`, never in either repo). Prices and the promo wording
  come from the server's offer only: never hard-code a price or claim a promotion in the app.
- **A licence works on 2 machines** (`lib/premium/device.ts`, server `premium-activate` / `premium-deactivate`):
  Pro = valid key AND an unexpired activation token `EGA1.<p>.<sig>` for THIS machine (sig over "EGA1.<p>", same
  public key). Machine id = sha256 of the Windows MachineGuid (seed fallback, created only in a user action).
  `premiumStatus` reads files only; renewal (`refreshPremiumDeviceAction`, once per app session via
  `PremiumRefresher`) talks to the server only when the token is 7+ days old. "เพิกถอนจากเครื่องนี้" frees the slot.
- **The paid camera instructions are NOT in this repo**: the server sends them (`premium-content`, table
  `premium_content`) to a non-revoked licence on a registered machine; the app caches them in premium.json
  (`lib/premium/content.ts`). Never paste them back into the source; edit them on the server (bump `version`).
  They must start with `CAMERA_RULES_HEADING`, the heading the core prompt names as the only camera exception.
- **Camera gate** (`lib/premium/camera-gate.ts`): a camera request is `allowed` only with an active licence AND
  a connected GitHub account; it then sets `project.hosting = "github"`, the server-delivered camera instruction
  set (cached; `CAMERA_RULES_UNAVAILABLE` when never fetched) travels in the TURN MESSAGE (never the fixed core prompt), and the lint runs
  with `allowCamera`. Otherwise the AI must not write camera code: `need-github` → connect first,
  `need-premium` → the camera part is left out entirely (no code, no substitute screen, not in the spec), ONE
  sentence that Google does not support the camera in GAS web apps, ONE sentence about EasyGAS Pro, and the chat
  card. The UI calls it "Pro"; code identifiers stay `premium`. GAS web apps still cannot
  open the camera; that rule stays in the core prompt, which names the app's camera heading as the only
  exception. `stripCameraClaims` removes any camera heading from what the user sends (agent route), so a
  pasted heading is never mistaken for the app's block; the lint (`allowCamera` only for `hosting: "github"`,
  set by the server) and the Pro check in `publishToPages` stay as the hard gates.
- **GitHub Pages hosting** (`lib/pages/*`): the project keeps normal `google.script.run` code. At publish the
  app adds `EgsRemote.gs` (a `doPost` dispatcher: refuses `_`-suffixed, `doGet`/`doPost`, non-functions and
  natives; answers ContentService JSON, never a stack) and builds a static `index.html` whose
  `google.script.run` posts `{fn,args}` to `/exec` WITHOUT a Content-Type header (a JSON header fails the
  preflight; verified live). The GitHub token lives in `<dataRoot>/github.json`, never in the client or child
  env; device flow scope is `repo` (the Pages API needs it); Pages must be switched on through the API
  (pushing `gh-pages` does not). `GITHUB_CLIENT_ID` is a constant in `lib/pages/config.ts` (public by design; the packaged app sees no build-time env), `EASYGAS_GITHUB_CLIENT_ID` overrides it for testing.
- **Editing an existing script** (`lib/import.ts`, origin `"imported"`): cloned with clasp into a project; its
  manifest is never rewritten; `<project>/remote-baseline.json` = the files at the last sync. Every push first
  re-clones and refuses on an outside edit (`RemoteChangedError` → "ดึงของล่าสุดจาก Google", local code kept in
  the history). Right after a push the sync point is recorded BEFORE versioning, so a later failure can never
  look like an outside edit. Publishing moves the script's EXISTING deployment (`create-version` +
  `update-deployment`), never creates one. Lint and the AI note count only what changed since the sync.
  "เช็คกับ Google" (`checkWithGoogle`, pure logic in `lib/sync-status.ts`) compares meaning, not bytes (Google
  re-formats appsscript.json). "เปิดโฟลเดอร์" spawns the file manager on `srcDir(id)` from the id only.
- **Home screen** (`app/projects/page.tsx`): `ProjectSidebar` (every project, one click) beside two real tabs
  (`StartModeTabs`, mode in the URL: `/projects` = compose, `/projects?mode=existing` = the script list; `/scripts`
  redirects there). The panel changes, the sidebar stays.
- **"แก้ไขสคริปต์ที่มีอยู่" tab** (`GoogleScriptsList`): the list comes from
  Drive (`lib/drive-scripts.ts`, `trashed=false`; clasp's `list-scripts` includes the trash) with the token in
  the app's clasp login file, read server-side only; clasp's list is the fallback. Published or not = the Apps
  Script API deployments (`lib/publish-info.ts`; the HEAD deployment does not count). Hidden scripts are ids in
  `<dataRoot>/hidden-scripts.json` (nothing changes on Google). Deleting a script ON Google is not offered: the
  login has no scope for it and the scope contract stays as it is; the row links to its editor instead.
  Script ids must start with a letter or digit (`SCRIPT_ID`), so one can never be read as a clasp option.
- **"วิเคราะห์โค้ด"** (`components/ide/AuditCard.tsx`, imported projects): the critic in `mode: "audit"`
  (same rubric as the gate, Thai title/problem/fix/benefit, deliberate choices of an existing script treated as
  low) via `runCritic` (`lib/critic-run.ts`, shared with /api/recheck). Results live in `<project>/audit.json`;
  the picked findings go to the chat as one message after a snapshot.
- **Quota in the status bar** (`components/ide/QuotaStatus.tsx`, parsing in `lib/quota.ts`): Codex via its
  app-server (`lib/engines/codex-quota.ts`, `account/rateLimits/read`, nothing under ~/.codex read); Claude only
  behind the opt-in above. One reading a minute per AI (`app/projects/quota-actions.ts`). Wide window = every
  window inline with a bar; narrower = one line that opens a popover.
- **Guided tours** (`components/tour/GuidedTour.tsx`, steps + bubble maths in `lib/tour.ts`): the `?` button in the
  top bar of the home screen and the IDE. Elements are marked `data-tour="<target>"`; a step whose element is not
  on screen is skipped. Opens by itself once per screen, remembered in settings.app `tour_seen_<id>` (the
  desktop origin changes with its port, so localStorage alone forgets). Add a step = add to
  `TOURS` + mark the element; keep the copy in Thai.
- **No work at render time that touches the network or writes settings** — `next build` renders pages
  (the rulebook check once ran during a build). Trigger such work from a client effect → server action.

## UI conventions (redesign 2026-10)

- Colours come from the tokens in `app/globals.css` (`bg-surface`, `border-line`, `text-muted`, `bg-accent`, …);
  they switch for dark mode themselves — no `dark:` variants, no slate-/emerald- classes in new code.
- Clickable = `.btn` / `.field` / `.row-btn` / `.nav-item` (fill or border + hover). Guidance = `.hint` (plain
  text). An empty area is one line of hint text — no icon tiles, dashed boxes, gradients or emoji.
- Buttons differ by ROLE, each with its own weight, colour and icon: `.btn-primary` (filled) the main action —
  send, publish, create; `.btn-soft` + `.tone-ai|.tone-info|.tone-warn` (tinted) a shortcut; `.btn-secondary`
  (outlined) an ordinary choice; `.btn-ghost` toolbars. Violet = talks to the AI, blue = look / explain,
  amber = needs attention. `.icon-chip` marks what a panel or row is about. Warn colours never as decoration.
- Every screen uses `AppTopBar` (h-12). In the desktop app it is the window title bar (`.titlebar` drag region,
  `TITLEBAR_HEIGHT` in electron/main.js) — keep the two heights equal.
- Wording: "เผยแพร่" (never deploy), "โปรเจกต์", "Ctrl+K". Settings deep links: `/settings?s=ai|google|style|data`,
  `/knowledge?s=rules|lessons`, plus `&from=<projectId>` to return to a project.
- Hand-offs into the IDE travel in sessionStorage: `egs:kickoff` (prefill), `egs:kickoff-auto` (send), `egs:wizard`.
