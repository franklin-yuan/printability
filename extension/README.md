# Printability — for people using the print space

Printability is a 3DPrinterOS companion that helps **you** find a free printer, see how long to wait, talk to Printability Voice, and spot the machine with status lights. It is not a staff fault-monitoring console.

## Wireless lights

USB helper + ESP32-S3 gateway and six XIAO ESP32-C3 modules (ESP-NOW). Modules are flashed with fixed IDs **1–6** (no pairing). Closing the physical switch marks that printer out of service (red). Status colors: green free/ready, blue busy, orange paused, red down/error, purple offline. Highlighting a printer in the panel flashes its light so you can find it on the floor.

Enable lights in the panel **Settings** after connecting the helper. Hardware is off by default.

## Panel tabs

- **Find a printer:** pick material/color, see the soonest matching wait, open Voice, jump to that printer.
- **Matching:** list of printers that match your filament filters with status and wait.
- **Settings:** collection buffer, light assignments (1–6), mark a printer out of service, fallback filament if AMS is missing.

## Voice

Say what you want to print with. Voice finds a matching free printer, can prepare a **review-only** card (it never presses Start), and can highlight/flash a light. Requires the local helper and your xAI API key.

## Install

1. Load `extension/` as an unpacked Chrome extension.
2. Open https://cloud.3dprinteros.com/#/printers and sign in.
3. Start the Printability helper, paste the extension ID, connect USB for lights, add xAI key for Voice.
4. Reload the extension and refresh the dashboard after updates.

Out-of-service flags (checkbox or physical switch) exclude a printer from recommendations and light it red so you skip it.
