# Phase 0 spikes — ผลทดสอบ (2026-10-06)

ทดสอบบน Windows 11 Pro, Node 26.2, Claude Code 2.1.286, clasp 3.3.0 ด้วยบัญชีจริง
สคริปต์อยู่ใน [`spikes/`](../spikes/) — เป็นโค้ดทดลองทิ้ง ไม่ใช่โค้ดของแอป

## Spike A — ขับ `claude -p` ในโฟลเดอร์โปรเจกต์ ✅ ผ่าน

ใช้ subscription ของผู้ใช้ได้ (`apiKeySource: "none"`) โดยแอปไม่แตะ credential

| ทดสอบ | ผล |
|---|---|
| สร้าง tool ใหม่ (Sonnet + GAS rulebook เดิม 30 KB) | 4 ไฟล์, 38 วินาที, ทำตาม rulebook ครบ (manifest ถูก, self-diag ใน `doGet`) |
| แก้ต่อด้วย `--resume <session_id>` | session เดิม, 27 วินาที, แก้ด้วย `Edit` 8 จุด ไม่แตะไฟล์ที่ไม่เกี่ยว, prompt cache ถูกใช้ |
| เขียน/แก้ไฟล์ในโฟลเดอร์ | ผ่าน |
| เขียน `../x`, เขียน absolute path นอกโฟลเดอร์ | ถูกปฏิเสธ |
| Read / Grep / Glob นอกโฟลเดอร์ | ถูกปฏิเสธ |
| CLAUDE.md / plugin / MCP / hooks ส่วนตัวของผู้ใช้ | ไม่ถูกโหลด (เหลือแค่ plugin builtin) |

**คำสั่งที่ใช้ได้จริง** (ดู [`run-claude.mjs`](../spikes/claude-cli/run-claude.mjs)):

```
claude.exe -p <prompt>
  --output-format stream-json --verbose --include-partial-messages
  --append-system-prompt-file <rulebook>
  --tools Read,Edit,Write,Glob,Grep
  --permission-mode acceptEdits
  --setting-sources project --strict-mcp-config
  --model sonnet  [--resume <session_id>]
env: CLAUDE_CODE_DISABLE_CLAUDE_MDS=1  CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
cwd: โฟลเดอร์โปรเจกต์ (long path)
```

**กับดักที่เจอ (ต้องทำตามในแอปจริง):**
- `--setting-sources project` **ไม่พอ** — `~/.claude/CLAUDE.md` ของผู้ใช้ยังรั่วเข้ามา ต้องตั้ง `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`
- **ห้ามใส่ `--allowedTools Read`** — rule แบบไม่ระบุ path อนุญาตให้อ่าน *ทุกที่* ในเครื่อง ปล่อยให้ default ทำงาน (อ่านได้เฉพาะใน cwd)
- rule แบบระบุ path (`Write(./**)`) ใช้ไม่ได้เมื่อ cwd เป็น 8.3 short path (`ADMINI~1`) — ใช้ `fs.realpathSync.native()` แปลงเป็น long path ก่อน spawn เสมอ
- **ห้ามใช้ `--bare`** — ปิด OAuth ทำให้ใช้ subscription ไม่ได้
- npm shim `claude.cmd` ชี้ไปที่ `node_modules/@anthropic-ai/claude-code/bin/claude.exe` — spawn exe ตรงได้ ไม่ต้องผ่าน shell
- ข้อความตอบกลับมาตอนท้าย (`firstTextMs` ≈ เวลาทั้งหมด) แต่มี `input_json_delta` จำนวนมากระหว่างเขียนไฟล์ → UI ต้องแสดงความคืบหน้าจาก tool input แทนข้อความ
- transcript ของ session ไปอยู่ใน `~/.claude/projects/` ของผู้ใช้ (จะเห็นใน `/resume`) — ยอมรับได้ เปลี่ยนต้องใช้ `CLAUDE_CONFIG_DIR` ซึ่งย้าย credential ไปด้วย

**ปรับ rulebook:** rulebook เดิมอ้างชื่อ tool `write_file`/`edit_file`/`read_project`/`propose_spec` — ต่อท้ายด้วย section "Engine adapter (CLI mode)" ที่แมปเป็น `Write`/`Edit`/`Read` (ดู [`extract-rulebook.mjs`](../spikes/claude-cli/extract-rulebook.mjs)). ขั้น propose_spec ต้องออกแบบใหม่สำหรับโหมด CLI

## Spike B — deploy ผ่าน clasp ✅ ผ่าน

แอปเรียก clasp CLI เอง ไม่อ่าน token ของ clasp และไม่ต้องมี GCP project / OAuth client ของเรา

| ขั้น | ผล | เวลา |
|---|---|---|
| `create-script --type standalone` | ได้ scriptId | ~14 s |
| `push --force` | 4 ไฟล์ | ~8 s |
| `create-version` | version n | ~5 s |
| `create-deployment -V n` (ครั้งแรก) | deploymentId + `/exec` | ~5 s |
| `update-deployment <id> -V n` (ครั้งต่อไป) | URL เดิม เสิร์ฟเวอร์ชันใหม่ | ~5 s |
| เปิด `/exec` | HTTP 200, title ถูก, มีฟีเจอร์จาก turn ล่าสุด | ~1 s |

deploy ใหม่หนึ่งรอบ (push → version → update) ≈ 20 วินาที

**ข้อดีใหญ่:** `clientType: google-provided` — ใช้ OAuth client ของ Google เอง ผู้ใช้ **ไม่เจอจอ "Google hasn't verified this app"** แบบเว็บเดิม และไม่มีเพดาน 100 test users / token หมดอายุ 7 วัน

**กับดักที่เจอ:**
- **ต้องส่ง `-P <โฟลเดอร์โปรเจกต์>` ทุกคำสั่ง** — ไม่งั้น clasp เดินขึ้น parent dir แล้วใช้ `.clasp.json` ของคนอื่นที่ค้างอยู่ (เจอจริงที่ `AppData/Local/Temp/.clasp.json`) และ **exit 0** ทั้งที่ไม่ได้สร้าง → ห้ามเชื่อ exit code อย่างเดียว ต้องเช็กว่า `.clasp.json` เกิดในโฟลเดอร์จริง
- **`create-script` เขียนทับ `appsscript.json`** ด้วย manifest default (`America/New_York`, ไม่มี `webapp`) → deploy ได้แต่ `/exec` = 404 ต้องเขียน manifest ของเรากลับหลัง create เสมอ (เหมือน `ensureWebAppDeployConfig` เดิม)
- clasp push ไฟล์ `.json` ทุกไฟล์ในโฟลเดอร์ → ไฟล์ metadata ของแอปต้องอยู่นอกโฟลเดอร์โปรเจกต์ หรือใส่ `.claspignore`
- detector error ของ probe ต้องเข้มแบบ `lib/gas-verify.ts` เดิม (`TypeError:` มี colon) — คำว่า `TypeError` เฉย ๆ มีอยู่ใน JS wrapper ของ Google เอง (false positive)
- HtmlService ตัด HTML comment ทิ้ง — อย่าใช้ comment เป็น marker
- ในแอปจริง ให้ bundle `@google/clasp` เป็น dependency และใช้ `-A <ไฟล์ auth ของแอป>` เพื่อไม่ชนกับ clasp login ส่วนตัวของผู้ใช้

**ยังไม่ได้ทดสอบ:**
- บัญชีที่ยังไม่เปิด Apps Script API ที่ `script.google.com/home/usersettings` (บัญชีทดสอบเปิดไว้แล้ว) — ต้องดูข้อความ error ของ clasp เพื่อทำ onboarding
- `clasp login -A <file>` จาก Electron (เปิดเบราว์เซอร์ + localhost callback)
- tool ที่ต้องขอสิทธิ์ (Sheet/Drive) — `/exec` จะขึ้น "Authorization required" จนเจ้าของกดอนุญาตใน editor
- Codex CLI (`codex exec --json`) — มี flag ครบแต่ยังไม่ได้รัน

## ผลต่อการออกแบบ

1. โหมดรายเดือน (Claude) ใช้ได้จริง ทั้งคุณภาพ ความเร็ว และการกักไฟล์
2. **ทิ้ง custom Google OAuth + `APP_ENCRYPTION_KEY` + `google_connections` ได้ทั้งชุด** — ใช้ clasp แทน
3. ไฟล์โปรเจกต์อยู่บนดิสก์เป็นตัวจริง (ทั้ง Claude Code และ clasp ทำงานกับโฟลเดอร์)
4. Gate 2 probe (`lib/gas-verify.ts`) ยกมาใช้ได้ตรง ๆ — เรียก `/exec` จากเครื่องผู้ใช้ได้

## กับดักที่เจอเพิ่ม: system prompt ของ session ที่ resume (2026-10-06)

- ทดสอบจริง: หลังแก้ไฟล์ที่ส่งด้วย `--append-system-prompt-file` แล้วสั่งต่อด้วย `--resume <id>` โมเดลยังยกข้อความจาก system prompt ชุดแรกของ session นั้น (ฟอนต์ Prompt ทั้งที่ไฟล์เขียนว่า Sarabun และไม่มีหัวข้อที่เพิ่มทีหลัง)
- ผลคือสิ่งที่เปลี่ยนกลางโปรเจกต์ (สไตล์ที่ผู้ใช้ตั้งใหม่, วิธีเสนอบทเรียน) ไปไม่ถึง AI ถ้าใส่ไว้แค่ใน system prompt
- ทางแก้ใน `lib/engines/claude-cli.ts`: เก็บลายนิ้วมือของ system prompt สองส่วนไว้กับโปรเจกต์ ส่วนคงที่เปลี่ยน (อัปเดตแอปหรือชุดกฎ) ให้เริ่ม session ใหม่ ส่วนการตั้งค่าเปลี่ยน ให้แนบข้อความแจ้งไปกับข้อความของรอบนั้น

## Codex CLI (0.156.1, 2026-10-06)

- `codex exec --json` ส่งเหตุการณ์ JSONL: `thread.started` (มี `thread_id`), `item.completed` (`agent_message`), `turn.completed` (มี usage)
- ปิด `shell_tool` และ `unified_exec` แล้ว Codex ไม่มีเครื่องมือเขียนไฟล์เหลือ จึงออกแบบให้ Codex ตอบเป็น JSON (`--output-schema`) แล้วแอปบันทึกไฟล์เอง ทดสอบแล้ว: อ่านไฟล์ล่อนอกโปรเจกต์และรัน `whoami` ไม่ได้
- ชื่อ feature ที่ Codex ไม่รู้จักใน `--disable` ทำให้ Codex หยุดทันที (`Unknown feature flag`) แอปจึงอ่าน `codex features list` ก่อน
- `-c developer_instructions=...` ใช้ได้แต่ยาวเกินบรรทัดคำสั่งของ Windows (~32K) ใช้ `-c model_instructions_file=<path>` แทน ทดสอบกับไฟล์ 40 KB แล้ว
- `codex exec resume` จำบทสนทนาได้ แต่ไม่รับคำสั่งระบบที่เปลี่ยน (เหมือน Claude Code) และไม่รับ `-s`/`-C` (ใช้ `-c sandbox_mode=...`)
- session ที่หาไม่เจอ: `thread/resume failed: no rollout found for thread id ...`
- Sandbox ของ Windows แบบ elevated ต้องใช้สิทธิ์ผู้ดูแลระบบ และไม่กันการอ่านไฟล์ — อีกเหตุผลที่ไม่ให้ Codex มีเครื่องมือเลย
- ตัวติดตั้งของ OpenAI: `irm https://chatgpt.com/codex/install.ps1 | iex` ติดตั้งต่อผู้ใช้ที่ `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` ไม่ต้องมี Node.js
- เปิดหน้าต่าง PowerShell จากเซิร์ฟเวอร์ (ไม่มี console): spawn ตรง ๆ แบบ detached แล้วหน้าต่างปิดทันทีแม้ใส่ `-NoExit` เพราะ input ว่าง ต้องเปิดผ่าน `Start-Process`
