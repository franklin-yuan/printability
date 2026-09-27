# Printy — quick start (v0.9.1)

## Try it out

**Live demo:** [https://printability.tech](https://printability.tech) (fallback [https://franklin-yuan.github.io/printability/](https://franklin-yuan.github.io/printability/))

Open the page on the booth laptop, click **Connect lights**, and drive the USB status lights while the on-screen printers simulate the farm. No Chrome extension or login required for the demo path.

### Enable GitHub Pages (one-time)

Repo Settings → **Pages** → Build and deployment → Source: **GitHub Actions**. After the workflow on `main` succeeds, the `github.io` URL goes live. Then set Custom domain to `printability.tech` (the repo already has a `CNAME` file).

### DNS for printability.tech (MLH .tech portal)

If the custom domain is not live yet, paste these records in the MLH /.tech DNS settings, then set the GitHub Pages custom domain to `printability.tech`:

| Type | Host / name | Value |
|------|-------------|--------|
| **A** | `@` (apex) | `185.199.108.153` |
| **A** | `@` | `185.199.109.153` |
| **A** | `@` | `185.199.110.153` |
| **A** | `@` | `185.199.111.153` |
| **CNAME** | `www` | `franklin-yuan.github.io` |

Fallback while DNS propagates: use the `github.io` URL above.

### Booth: demo + real lights

1. Plug in the ESP32-S3 USB gateway; power the C3 modules / LED strips.
2. Double-click `helper/Start Printability.vbs` (keep the helper open).
3. In the helper: **Refresh ports** → select the S3 COM port → **Connect**.
4. Check **Allow booth demo page (printability.tech → local lights)** for a no-token booth setup. (Or leave it unchecked and paste the helper connection code into the demo’s Lights panel once.)
5. Open [https://printability.tech](https://printability.tech) (or the `github.io` URL) **on that same laptop**.
6. Click **Connect lights**. Label table papers **Light 1 · Crane** … **Light 6 · Wren**.
7. Use scripted Voice, **Show printer** / **Flash**, or the per-card state buttons to change colors. Print stays disabled.

If the helper is closed, the on-screen demo still works and says lights are offline.

## Wireless lights and physical switches

Switch setup: click Set up module 1 in Settings, then flip its switch. Repeat for each LED-chain position, then choose the printer for each number. Restart the helper and reload the extension after updating.

Version 0.9 adds the USB helper bridge for an ESP32-S3 N16R8 gateway and six XIAO ESP32-C3 modules using ESP-NOW. Firmware and the full wiring/upload guide are in `firmware/README.md` in the full package. Install the firmware before enabling hardware in Settings. Restart the helper and reload/refresh the extension. Connect the S3 COM port in the helper, pair the connection code, enable six modules, and assign their IDs to printers. The API key is optional; hardware makes no paid requests.

Current wiring: the S3 drives six daisy-chained eight-pixel sticks (48 LEDs) from GPIO4. Each C3 reads only its D4/GPIO6 switch. Module IDs 1–6 correspond to sticks 1–6 in chain order. The S3 handles physical red overrides without the computer, provided the switch radio link and LED power are working.

Physical BROKEN overrides affect recommendations and the WS2812. A missing module makes its assigned printer's availability unknown. Hardware is off by default until you enable it. USB support is bundled in the helper's vendor folder.

The default Start print screen shows filament filters, one large next-printer wait, and the top two urgent actions together. All next steps opens the complete action list and AI details. Updates remains separate. Reload the extension and refresh the dashboard after updating.

## Simplified navigation

- **Start print:** filament filters and one large wait estimate for the next matching printer. Ready now means confirm bed clearance; timed estimates include the configured collection buffer. Missing estimates remain unknown. An incomplete set of estimates is labeled.
- **Next steps:** prioritized operator actions and optional AI advice, with logs in expandable details.
- **Updates:** separate factual history of printers now down, paused, recovered, or ready/finished. The most recent 20 batches are retained in this page session, including when pop-ups are disabled. Reloading clears this history. AI responses never replace these factual notifications.
- **Settings:** notification/AI controls, wait/file preferences, and lights/printer setup.

Per-printer wait summaries were removed so the main wait value answers “how long until I can start my next print?” Printer cards retain reported job time and searchable files. Reload the extension and refresh 3DPrinterOS to apply version 0.8.0; the helper did not change in this update.

## Priority and layout update

Overview now starts with **Address next**, ranked by observed urgency. Red marks reported faults, dark red explicit fatal faults, berry BROKEN, amber pauses with an unknown cause, teal pauses with evidence of a manual pause or filament runout, purple disconnections, green collection/idle, and blue normal work. Labels and next actions accompany every color. Recovery always requires operator checks; a Resume button is not evidence of safe recovery. Missing, stale, historical or mismatched job evidence cannot establish a current fault cause.

AI now recommends what to address first and explains why, considering unresolved issues across the farm. Its first recommendation is visible above expandable supporting details. Notifications include the next check and urgency. Automatic paid AI is OFF by default, including for existing installations. Local notifications and Address next work without API calls. Optional automatic AI requires the separate Settings checkbox and is capped at six calls per day, 30 minutes apart across tabs. Manual Analyze/Refresh is additional.

Printer cards have bounded image previews and a printer illustration when no active model is available. Idle printers say No active print; missing details on busy/paused printers say Job details unavailable. Original file controls and stored files remain accessible.

Each printer shows three files per page, current/recent first, with search over all its files and Previous/Next controls. Estimated wait uses reported remaining print time plus a configurable collection buffer (five minutes by default). Idle printers require bed-clearance confirmation. Paused, broken, disconnected or missing-time states have unknown waits. Stored files never add queue delay.

To apply this update, reload the extension, refresh 3DPrinterOS, and close/reopen the Printy helper so it loads the new AI instructions. Browser fixtures and mocked AI tests verify these changes; no paid AI request was made.

Printy adds a compact companion to 3DPrinterOS. Overview contains printer matching and AI next steps; Settings holds light assignments, manual BROKEN overrides, fallback filament settings, automatic notification controls and the AI connection link.

When automatic major-change notifications are enabled, Printy watches loaded printer statuses and shows a pop-up for meaningful events such as a pause, error, disconnect, completion, a printer becoming idle, or a BROKEN override. It batches changes for 15 seconds and ignores normal percentage ticks and heating/printing chatter. Notifications are spaced five minutes apart across tabs. They use local rules unless automatic paid AI is explicitly enabled; the stricter six-call/30-minute AI limits still apply. Connecting a helper alone does not enable automatic billing.

## Try the interface immediately

**Judges / expo:** use [https://printability.tech](https://printability.tech) — see **Try it out** at the top of this README.

The Chrome extension still operates on the authenticated 3DPrinterOS Printers page for the full product path.

1. Select PLA + Blue in Overview.
2. Open Settings, expand Crane and mark it BROKEN locally.
3. Return to Overview: Remy becomes the suggested printer.
4. Open a printer's Files & evidence section to see current/recent files and expand All files for older items.

Open Printability Voice from the real dashboard after connecting the local helper.

## Update the existing extension

1. Open Chrome's Extensions page (`chrome://extensions`).
2. Find **Printy / Farm Lights** and click its reload button. For a fresh installation, enable Developer mode, choose Load unpacked and select the `extension` folder.
3. Refresh your existing 3DPrinterOS browser tab. The new panel says **Printy** and has **Overview / Settings** tabs.
4. **Open Printers dashboard** is the main entry point, now arranged as printer cards. Each card has searchable Files, Job details and Manage files, which exposes the original file controls. Live View Wall remains optional. Automatic log collection uses an isolated off-screen page and never navigates your visible tab or opens its dialogs.

Status updates preserve panel scroll position, expanded sections and file searches. Updates to the companion panel wait while you use an input or dropdown. This update does not require restarting the helper.

The extension needs loopback access (`http://127.0.0.1`) to reach the local AI helper. No OpenAI key is stored in the extension. A browser refresh alone does not reload extension files.

## Turn on real OpenAI suggestions — no terminal required

1. Double-click `helper/Start Printy.vbs`. Python 3.12 is already installed on this machine at the launcher's configured path. No extra Python packages are required.
2. In Printy's **Settings**, choose **Open AI connection settings**. Copy the displayed extension ID into the helper.
3. Enter your OpenAI API key in the **helper window**, then click Save connection. Do not paste the API key into chat or the extension. The model defaults to `gpt-4.1-mini` and can be changed in the helper.
4. Click Copy connection code in the helper; paste that code into the extension connection page and click Save and test connection.
5. Leave the helper and Printers page open. Printy checks available logs in an isolated off-screen page using your signed-in session, starting with current jobs. For an idle printer, it reads the latest exposed completed/aborted job, if available. Stored queued files are ignored. Stop reading logs interrupts collection. Progress and unavailable-log reasons appear under Attention & logs. If the site blocks the background page or requires login, logs stay unavailable; there is no fallback that opens visible dialogs.
6. Major changes trigger local notifications. Enable automatic paid AI separately only if desired. Manual Analyze/Refresh remains available. Both analysis paths wait for log collection before sending the snapshot. Collection itself makes no OpenAI request. It refreshes approximately every two minutes on the Printers page, and before analysis when evidence is missing or the printer state/job changed.

Each request sends printer names/IDs, statuses, BROKEN flags, requested material/color, filament slots, current/recent filenames, available remaining-print time, the current job's original total estimate, log coverage, and bounded recent/fault/transition evidence. Emails and URLs are removed from transmitted strings; cookies, SSO tokens, raw page HTML, camera images and API keys are not included. File names and printer names are still sent. API usage is billed to your API account.

Windows DPAPI is used for local encrypted persistence, outside this project and outside OneDrive. If it is unavailable, the helper keeps the configuration only in memory and tells you to re-enter it next session. Closing the helper stops the connection. The test environment could not verify DPAPI persistence; no plaintext credential fallback exists.

## What is now read from 3DPrinterOS

- **Printers page:** rendered printer name/ID, status badge, AMS/filament material labels and RGB swatches, current job rows and stored file rows.
- **Job Details → Logs:** printer, filename, displayed remaining time, latest state transition, explicit reported fault and the last eight log entries. Printy reads available logs automatically and can be refreshed with Refresh all printer logs. Historical logs cannot supply current remaining time.
- **Live View Wall:** current card status plus data previously captured from the Printers page in the same browser tab. Wall AMS cache expires after two minutes and log evidence after five minutes. AI collection uses the Printers page. No synchronization between separate browser tabs yet.
- Only loaded page items are available. Collapsed/paginated/unloaded content and unseen logs cannot be inferred. The UI reports log coverage. A recently read page does not guarantee a recently updated printer feed.

The real Fireboy log inspected during development contained error **50364440: Chamber temperature malfunction**, then later transitions back to printing. Printy preserves the earlier fault and marks it historical rather than declaring the printer currently broken.

## Matching and wait times

- Eligible printers must report idle, have no current job, have an unambiguous name, and not have a local BROKEN override.
- Material and color must match **the same loaded slot**. PLA Basic/PLA Matte are grouped with PLA; composite/specialist materials keep their names. This is filament matching, not verification of the printer/nozzle's capability to print an arbitrary material.
- AMS data takes priority. Manual material/color is a fallback only when AMS was not read. Empty slots cannot satisfy a request.
- RGB swatches become approximate broad color names; verify the physical spool. Only filament entries rendered by 3DPrinterOS are read, so hidden external-spool/tooltips may be absent. The numbered slots are displayed order, not verified AMS bank labels.
- Old queued files add **zero wait time** and never reserve an idle printer. Current jobs and very recent file dates are highlighted. Relative page timestamps are approximate; missing dates remain unknown. All files remain accessible in the source UI and collapsed Printy details.
- Remaining time is the reported current print time, with collection/bed clearance excluded. Paused, failed and broken printers have unknown availability. No fabricated AI availability estimate.

## AI boundaries

OpenAI suggestions are advisory. Deterministic matching and BROKEN exclusion remain outside AI. Suggestions do not change printer status, start/reprint jobs or operate hardware. Missing key, connection/API failures, model refusals, incomplete responses and invalid evidence references produce visible errors instead of fake AI results. Advice describes a captured snapshot and remains visible if the farm changes, with a notice identifying meaningful changes. Percentage ticks do not invalidate it. Automatic paid AI is off by default, with a six-call daily cap and 30-minute spacing if enabled. Manual Refresh retains the last successful advice while loading or if a request fails. The first suggested action is visible; supporting details are expandable.

The extension isolates the connection code from page content scripts. The helper binds only to 127.0.0.1, checks Host/Origin and a secret connection code, limits payload size, and allows one analysis at a time. A local helper is intended for a trusted hackathon workstation, not a hosted multi-user service.

## Known prototype limits

- Physical integration is implemented but must be flashed, wired and tested on your actual boards. The checkbox remains a separate manual override; the physical switch cannot be cleared from it.
- This build targets the authenticated 3DPrinterOS dashboard.
- Printer settings are keyed by name. Recheck when renaming printers or switching accounts.
- Recommendations cannot confirm that a bed is physically clear or that a device feed is live.
- SSO remains in the user's normal browser. No login automation or admin API access is required.

## Verification

Passed: browser tests of Settings persistence, BROKEN exclusion, light count, disconnection, file access, real DOM-shaped AMS/log parsing, same-slot matching and historical fault recovery; helper request/response validation, email redaction, rejected origins/tokens and mocked API errors; extension background isolation and request routing. Version 0.6 fixture tests also verify background log collection without foreground job clicks, preservation of an operator's open dialog, card file search and native controls, scroll/expanded sections and dropdown focus. No live OpenAI call was made for this update. The site's actual off-screen-page compatibility still needs confirmation after reloading the installed extension; blocked access is reported as unavailable. Reload the extension and refresh the page using the steps above.

The implementation uses OpenAI's [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and the documented [GPT-4.1 mini model](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Summary regression fix (0.3.1)

Verified with delayed mock responses: status changes during analysis no longer reject the result, percentage updates do not mark it stale, later changes preserve it with a snapshot notice, and failed refreshes retain the prior summary. No extra automatic API requests are made. Reload the extension and refresh 3DPrinterOS; restart the helper to apply the shorter summary prompt.
