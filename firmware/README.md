# Printy lights: six XIAO ESP32-C3 modules + ESP32-S3 N16R8 gateway

The S3 connects to the computer by USB and drives one chain of **48 WS2812 LEDs from GPIO4**: six sticks, eight LEDs per printer. Each C3 reads its **D2 / GPIO4 switch only**, reporting to the S3 using ESP-NOW channel 6. No school Wi-Fi login is needed. There is no LED data connection to the C3 boards. These are indicators, not printer motor controls.

```text
S3 GPIO4 -> logic shifter -> 330 ohm -> stick 1 DIN
stick 1 DOUT -> stick 2 DIN -> ... -> stick 6 DIN

C3 #1 D2 switch --ESP-NOW--> S3 controls stick 1
...
C3 #6 D2 switch --ESP-NOW--> S3 controls stick 6
```

The chain order determines the light number. Module ID 1 maps to pixels 0–7; ID 2 to 8–15; ID 3 to 16–23; ID 4 to 24–31; ID 5 to 32–39; ID 6 to 40–47. Assign these numbers to printer names in Printy Settings.

## Flash the boards once

Open `PrintyRadio/PrintyRadio.ino` in Arduino IDE. Install **esp32 by Espressif Systems 3.3.0** and **Adafruit NeoPixel 1.15.1** using the board/library managers.

1. S3 gateway: leave `PRINTY_GATEWAY 1`. Select **ESP32S3 Dev Module**, Flash Size **16MB**, PSRAM **OPI PSRAM**, USB Mode **Hardware CDC and JTAG**, USB CDC On Boot **Enabled** when using the native USB connector. Upload, then reset. N16R8 describes memory, not the carrier board: a connector labeled UART uses a USB-UART bridge instead; for that connector disable USB CDC On Boot so `Serial` uses UART0. Use the matching USB port in the helper. Connect GPIO4 to the LED chain as described below.
2. Every C3: open **PrintySwitch/PrintySwitch.ino**, select **XIAO_ESP32C3**, enable USB CDC On Boot and upload the SAME sketch to all six boards. No module ID edits. Attach each supplied antenna and wire D2 to the switch, then GND. Update both the S3 and all C3 boards together: discovery uses protocol version 2.
3. Restart the helper and reload the extension in chrome://extensions. Connect the S3 USB port in the helper, then enable hardware in Printy Settings / Lights & switches.
4. In Settings, click **Set up module 1**, then flip that module's switch within 30 seconds. Wait for the saved confirmation. Repeat for positions 2-6, matching LED chain order. No address selection or power-on ordering is needed. Only flip the intended switch while setup is listening. A newly powered board needs one initial heartbeat before a switch change can identify it.
5. Choose a printer for each light number under Printer settings. S3 stores switch assignments across restarts. Printer choices remain in browser settings. Re-pairing a board moves it from its old position. Existing protocol-2 C3s and the manually assigned gateway firmware are compatible; if using the experimental automatic-numbering gateway, reflash PrintyRadio.
6. Close Arduino Serial Monitor before connecting the helper. Diagnostics: `H PRINTY 2 S3`, `D <radio-address> <broken>`, `M <light-number> <radio-address>` and `S <light-number> <broken>`. A zero address means not assigned.

## Wiring

| Connection | Wiring |
|---|---|
| AUTO/BROKEN maintained switch | XIAO **D2 / GPIO4** to switch, other switch terminal to **GND**. Closed = BROKEN. Internal pull-up; no resistor required. |
| First WS2812 stick DIN | **S3 GPIO4**, through a suitable 3.3V-to-5V logic shifter, then a 330-ohm series resistor to DIN. |
| Following sticks | Previous stick DOUT to next stick DIN. Last DOUT is unconnected. |
| WS2812 power | Separate regulated **5V** supply to all sticks; LED ground must connect to S3 GND. Do not power 48 LEDs through a GPIO or the S3's regulator. |
| C3 power | USB power for initial testing. Follow the XIAO board guidance if using its 5V input; avoid backfeeding USB from another supply. |

Use a small HCT/AHCT buffer or an Adafruit Pixel Shifter board if the LED input does not already shift logic. Direct 3.3V data into a 5V WS2812 is not guaranteed. Keep data wiring short and run it alongside ground. Add bulk capacitance near the LED supply (470–1000µF); the photographed sticks already appear to have per-pixel capacitors. A three-pin SPDT switch uses its center and one outer terminal; the third remains unused. Never connect 5V to the XIAO D2 input or the S3 GPIO4 output.

Budget up to approximately **2.9A at 5V for 48 classic 60mA pixels at full white**, plus controllers if sharing that supply. The firmware limits brightness to 48/255, but supply/wiring should tolerate the intended maximum load. Feed power appropriately along the chain if voltage drops; do not backfeed the S3 USB 5V from the external LED supply. Common ground is required. The separate red LED is unnecessary: the S3 turns the matching stick red when its C3 reports BROKEN.

## Connect Printy without a command line

1. Restart `helper/Start Printy.vbs`. USB support is bundled in `helper/vendor`; no global Python package installation is needed.
2. Open Printy Settings → **Open helper connection settings**. Enter that extension ID in the helper and Save. An Grok key is optional.
3. Copy the helper's connection code to the extension's connection page and save/test it.
4. Plug the S3 in with a data-capable USB cable. Click **Refresh ports**, select its COM port, then **Connect** in the helper. It verifies the Printy firmware heartbeat before sending commands.
5. In the real 3DPrinterOS page, enable **Connect six wireless light modules**. Assign module IDs 1–6 to the appropriate printers in Settings. Existing four assignments are retained; assign modules 5 and 6 yourself. Do not use the demo to control hardware.

Only one dashboard tab can control the lights at a time. Close or disable hardware in an old tab before switching; ownership expires after eight seconds without updates.

## What to expect

- Green: idle or finished; blue: printing/heating/preparing; amber: unexplained pause; teal: evidenced recoverable pause; red: fault or BROKEN; purple: unavailable/unknown.
- Closing a switch sends a debounced report immediately, then repeats a heartbeat roughly once per second. The S3 turns all eight LEDs of that ID's stick red without needing the computer. This depends on the S3, LED power and ESP-NOW link; the C3 no longer has an independent local LED override. The dashboard receives it within a few seconds and excludes the printer from recommendations.
- Opening the switch clears only the physical override. A separately checked software BROKEN flag still applies.
- Radio/module loss expires after four seconds at the S3 and helper. Printy stops offering its assigned printer. The affected stick blinks purple unless its last verified switch report was BROKEN; that red state stays latched until the same module reports AUTO. Unassigned switch boards are discovered but cannot override any light.
- S3 color commands expire after ten seconds. Including the helper's six-second command lease, a lost browser connection can take up to about 16 seconds to show blinking purple. A known BROKEN state stays red.
- Unassigned sticks are off when their switch modules and PC commands are fresh; an active BROKEN switch still makes its stick red. Missing modules show blinking purple.
- This prototype uses unencrypted broadcast packets with a fleet ID, not secure radio pairing. Change the fleet ID on all seven boards to separate nearby kits. Each radio address can be assigned to only one light position. Do not use this channel for machinery control.

## Validation status

The actual firmware loops passed host C++ tests with mocked Arduino peripherals: 48-pixel grouping on S3 GPIO4, isolated red overrides, stale reports/commands, persistent radio assignments, and C3 D2 debounce/heartbeat. These are logic tests, not ESP32 target builds or radio/electrical tests. The helper serial loopback, authenticated hardware endpoint and browser switch round-trip were also tested previously. No physical boards were flashed or exercised. Arduino ESP32 target compilation remains blocked by this Windows execution environment's tool-folder access issue. Compile/upload and verify on the real boards; no precompiled ESP32 binaries are supplied.

## References

- [Seeed XIAO ESP32-C3 pinout and setup](https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/)
- [Espressif USB CDC settings](https://docs.espressif.com/projects/arduino-esp32/en/latest/tutorials/cdc_dfu_flash.html)
- [Espressif ESP-NOW](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/espnow.html)
- [Adafruit NeoPixel logic levels](https://learn.adafruit.com/adafruit-neopixel-uberguide/logic-level)
