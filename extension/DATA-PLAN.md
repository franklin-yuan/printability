# Data plan — version 0.8.0

## Presentation

Start print shows the minimum known wait among eligible-state, matching-filament printers, excluding BROKEN and ambiguous identities. Unknown competitors are disclosed rather than assigned invented estimates. Next steps contains operator advice. Updates and pop-ups contain factual grouped changes and never get replaced with AI prose. History is limited to 20 batches in the current page session. Settings is grouped by notifications/AI, wait/files, and hardware.

## Operator priorities — implemented in 0.7.0

The interface should explain printer events directly from the printer page and logs. AI should not paraphrase a status change that the UI can state exactly. Use AI only when it adds prioritization: identify the most urgent printer, recommend the next operator action, and explain the reasoning from the available evidence.

Use distinct visual states for printing, idle, paused and recoverable, paused with a fatal error, disconnected, and locally marked BROKEN. Notifications should identify the highest-priority issue and give the next action, such as resume, inspect the reported fault, move the job, or fix the printer. A paused printer that can continue must be visually different from one paused by a fatal error. Keep the underlying event, urgency, and recommended action visible together so the operator can act without requesting a summary.

The implementation ranks verified current faults and operator BROKEN flags above unexplained pauses, evidenced recoverable causes, connection checks and collection. Fatal severity requires explicit current-job wording; error codes are not guessed. A manual pause or filament runout prompts readiness checks, never unconditional resume. Unsupported reprint/model-replacement advice is excluded by the AI instructions. The deterministic section works without AI, and AI suggestions are ordered by priority with the first action visible. Card previews are constrained to prevent overlap, with an illustration for unused printers.

## Read path

3DPrinterOS rendered DOM → source.js and job-details.js → normalized printer records → deterministic eligibility → automatic major-change or user-triggered OpenAI analysis → advisory suggestions.

Log collection uses a temporary off-screen same-origin Printers page. Only that page's job dialogs are opened automatically; foreground dialogs and navigation are never automated. Missing background access is reported as unavailable. The foreground printer card grid preserves original controls, exposing them through Manage files on user request. Stored files remain searchable without contributing to wait estimates.

Source selectors were inspected on the authenticated Printers page:
- `.printers-table__item[id^="printer-item-"]`
- `.printer-details-title`, `.printer-details-type`, `.printer-badge`
- `.filament-properties-parent .filament-properties`, `.filament-extra`, `.filament-color`
- `tr[id^="printers-job__row_"]`, `.job-status[aria-label]`, `.file-details-title [title]`, `.edit-time`
- `.collapse-jobs--in-progress` identifies active job rows
- `#job-details-modal #job-logs-panel`, `.job-name`, status and visible log text

Only displayed evidence is read. Historical jobs are retained for access but don't create a queue-delay estimate. Timestamped transitions are ordered before selecting the latest state; the live modal badge is preferred when available. An older fault from a non-current job, or a fault followed by a currently healthy phase, is labeled historical.

## AMS

Read material labels and RGB swatches from each rendered slot; omit Empty slots. Material and color must match together. Keep original material names and RGB values; broad color names are approximate. Unknown filament is not a positive match. The live wall reuses only recent readings from the same browser tab. No hidden API calls or internal Vue state inspection.

## OpenAI

Extension service worker sends a scoped snapshot to the loopback Python helper. The API key remains in the helper; Windows DPAPI protects saved config if available, otherwise settings stay in memory. A bearer connection code and extension origin restrict helper requests. Content scripts cannot read the code because extension storage is restricted to trusted contexts; only a narrow settings message interface is exposed.

The helper whitelists/limits snapshot fields and requests strict JSON output from `/v1/responses` with `store:false`. Validate printer IDs and evidence references. Show failures openly. AI advice does not control machines or change deterministic eligibility. Automatic paid AI is off by default and requires explicit opt-in, including on existing installations. If enabled, calls are limited to six per UTC day and 30 minutes apart across tabs; manual requests are additional. Local notifications do not need AI. Each printer displays three searchable files per page. Expected wait is reported remaining time plus the configured collection buffer; unknown remains unknown and stored files add no delay.

## Pending

Physical switch transport, ESP32 output, multi-account identity namespaces, cross-browser-tab synchronization, and calibrated completion/collection prediction remain future work. Local operator overrides are clearly identified as such.
