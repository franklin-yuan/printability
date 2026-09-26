# Printability lights (demo): ESP32-S3 gateway and six ESP32-C3 modules

The S3 stays on USB and talks to the helper. It does not drive LEDs. Each light module is an ESP32-C3 with a fixed demo ID:

- Switch on **GPIO4**, other side to GND. Closed means that printer is down.
- Eight **WS2812** LEDs, data in on **GPIO2**.
- Hardcoded **MODULE_ID** `1` through `6` (set before flashing that board).

No MAC pairing and no flip-switch enrollment. The C3 reports its ID over ESP-NOW. Closing the switch turns that strip red immediately and marks the assigned printer down in the extension. While open, the S3 broadcasts status colors. Highlighting a printer on the dashboard flashes its strip.

```text
Computer USB -> ESP32-S3
ESP32-S3 --ESP-NOW broadcast--> ESP32-C3 modules (IDs 1–6)
C3 GPIO4 switch to GND
C3 GPIO2 -> 330 ohm -> WS2812 DIN
```

On a XIAO ESP32-C3, GPIO4 is D2 and GPIO2 is D0.

## Flash the boards once

Install **esp32 by Espressif Systems 3.3.0** and **Adafruit NeoPixel 1.15.1**.

1. S3 gateway: open `PrintyRadio/PrintyRadio.ino` with `PRINTY_GATEWAY 1`. Board: **ESP32S3 Dev Module**, 16MB flash, OPI PSRAM, USB CDC On Boot enabled for native USB. Upload. The S3 has no LED wiring.
2. Each C3: open `PrintySwitch/PrintySwitch.ino`. Set `#define MODULE_ID` to `1`, then upload. Change it to `2`, upload the next board, and so on through `6`. Board: **XIAO_ESP32C3**, USB CDC On Boot enabled. Attach each antenna.
3. Close Arduino Serial Monitor so the helper can open the S3 port.
4. Restart the helper, connect the S3 COM port, reload the extension, enable **Use status lights**, and assign printers to lights 1–6 in Settings.

Reflash the S3 and every C3 together. They share protocol version 4.

## Wiring

| Connection | Wiring |
|---|---|
| Down switch | **GPIO4** to the switch, other terminal to **GND**. Closed = down. |
| WS2812 DIN | **GPIO2**, with a 330-ohm series resistor (and a level shifter if needed). |
| WS2812 power | Regulated **5V** at the strip; common ground with the C3. |
| C3 power | USB for setup. Do not power the strip from the C3 3.3V pin. |

## What the strip shows

| Color | Meaning |
|---|---|
| Green | Idle or finished |
| Blue | Printing, heating, or preparing |
| Amber | Paused, cause not established |
| Teal | Recoverable pause (for example filament) |
| Red | Fault, or the module switch is closed |
| Purple | Offline / no recent color command |
| Off | Light number not assigned to exactly one printer |
| Flashing | That printer is highlighted on the dashboard |

## References

- [Seeed XIAO ESP32-C3 pinout](https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/)
- [Espressif ESP-NOW](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/espnow.html)
- [Adafruit NeoPixel logic levels](https://learn.adafruit.com/adafruit-neopixel-uberguide/logic-level)
