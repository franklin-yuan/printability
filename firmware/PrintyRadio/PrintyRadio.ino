// Arduino ESP32 core 3.x. One sketch for both roles.
// S3 USB gateway: PRINTY_GATEWAY 1.
// Each C3 light module: PRINTY_GATEWAY 0 and MODULE_ID 1..6 (set before flashing that board).
#ifndef PRINTY_GATEWAY
#define PRINTY_GATEWAY 1
#endif
#ifndef MODULE_ID
#define MODULE_ID 1
#endif

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#if !PRINTY_GATEWAY
#include <Adafruit_NeoPixel.h>
constexpr int SWITCH_PIN = 4; // switch to GND; closed = printer down
constexpr int LED_PIN = 2;    // WS2812 DIN, 8 pixels on this module
constexpr int PIXEL_COUNT = 8;
Adafruit_NeoPixel pixels(PIXEL_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
#endif

constexpr int MODULE_COUNT = 6;
constexpr uint32_t FLEET = 0x50727961;
constexpr uint8_t CHANNEL = 6, VERSION = 4;
const uint8_t broadcastMac[6] = {255, 255, 255, 255, 255, 255};
struct __attribute__((packed)) Packet {
  uint32_t fleet;
  uint8_t version, type, id, flags, r, g, b;
};
static_assert(sizeof(Packet) == 11, "Wire format changed");
struct Received { Packet packet; };
QueueHandle_t inbox;
void received(const esp_now_recv_info_t *info, const uint8_t *data, int length) {
  (void)info;
  if (length != sizeof(Packet)) return;
  Received item;
  memcpy(&item.packet, data, sizeof(Packet));
  if (item.packet.fleet != FLEET || item.packet.version != VERSION) return;
  xQueueSend(inbox, &item, 0);
}
esp_err_t transmit(Packet packet) { return esp_now_send(broadcastMac, (uint8_t *)&packet, sizeof(packet)); }
void setup() {
  Serial.begin(115200);
#if !PRINTY_GATEWAY
  static_assert(MODULE_ID >= 1 && MODULE_ID <= MODULE_COUNT, "MODULE_ID must be 1..6");
  pinMode(SWITCH_PIN, INPUT_PULLUP);
#endif
  inbox = xQueueCreate(24, sizeof(Received));
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  esp_wifi_set_channel(CHANNEL, WIFI_SECOND_CHAN_NONE);
  if (!inbox || esp_now_init() != ESP_OK) { while (true) { Serial.println("E RADIO_INIT"); delay(1000); } }
  esp_now_register_recv_cb(received);
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, broadcastMac, 6);
  peer.channel = CHANNEL;
  peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) { while (true) { Serial.println("E RADIO_PEER"); delay(1000); } }
#if !PRINTY_GATEWAY
  pixels.begin();
  pixels.setBrightness(48);
  pixels.clear();
  pixels.show();
#endif
}

#if PRINTY_GATEWAY
Packet commands[MODULE_COUNT];
uint32_t commandAt[MODULE_COUNT] = {}, lastRadio[MODULE_COUNT] = {}, lastHello = 0;
bool commanded[MODULE_COUNT] = {}, dirty[MODULE_COUNT] = {};
int radioCursor = 0;
char line[80];
size_t used = 0;
bool overflow = false;
void serialCommand() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c != '\n') { if (used < sizeof(line) - 1) line[used++] = c; else overflow = true; continue; }
    line[used] = 0;
    int id, r, g, b, flash = 0;
    char extra;
    bool ok = false;
    if (!overflow) {
      if (sscanf(line, "C %d %d %d %d %d %c", &id, &r, &g, &b, &flash, &extra) == 5 && (flash == 0 || flash == 1)) ok = true;
      else if (sscanf(line, "C %d %d %d %d %c", &id, &r, &g, &b, &extra) == 4) { flash = 0; ok = true; }
    }
    if (ok && id >= 1 && id <= MODULE_COUNT && r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
      commands[id - 1] = {FLEET, VERSION, 1, (uint8_t)id, (uint8_t)flash, (uint8_t)r, (uint8_t)g, (uint8_t)b};
      commandAt[id - 1] = millis();
      commanded[id - 1] = true;
      dirty[id - 1] = true;
    }
    used = 0;
    overflow = false;
  }
}
void radioOut(uint32_t now) {
  for (int n = 0; n < MODULE_COUNT; n++) {
    int i = radioCursor;
    radioCursor = (radioCursor + 1) % MODULE_COUNT;
    if (!commanded[i] || now - commandAt[i] >= 10000) continue;
    if (!dirty[i] && now - lastRadio[i] < 300) continue;
    if (transmit(commands[i]) == ESP_OK) {
      lastRadio[i] = now;
      dirty[i] = false;
      return;
    }
  }
}
void loop() {
  serialCommand();
  const uint32_t now = millis();
  if (now - lastHello >= 1000) {
    lastHello = now;
    Serial.println("H PRINTY 4 S3");
    for (int i = 0; i < MODULE_COUNT; i++) Serial.printf("M %d FIXED\n", i + 1);
  }
  Received item;
  while (xQueueReceive(inbox, &item, 0) == pdTRUE) {
    const Packet &p = item.packet;
    if (p.type != 2 || p.id < 1 || p.id > MODULE_COUNT || p.flags > 1) continue;
    Serial.printf("S %u %u\n", p.id, p.flags);
  }
  radioOut(now);
  delay(2);
}
#else
uint32_t lastReport = 0, edgeAt = 0, cmdAt = 0, shown = 0xFFFFFFFF;
bool raw = false, broken = false, reportDue = true, haveCmd = false, cmdFlash = false;
uint8_t cmdR = 0, cmdG = 0, cmdB = 0;
void paint(uint32_t color) {
  if (color == shown) return;
  shown = color;
  pixels.fill(color, 0, PIXEL_COUNT);
  pixels.show();
}
void loop() {
  const uint32_t now = millis();
  bool value = digitalRead(SWITCH_PIN) == LOW;
  if (value != raw) { raw = value; edgeAt = now; }
  if (now - edgeAt >= 35 && broken != raw) { broken = raw; reportDue = true; }
  Received item;
  while (xQueueReceive(inbox, &item, 0) == pdTRUE) {
    const Packet &p = item.packet;
    if (p.type != 1 || p.id != MODULE_ID || p.flags > 1) continue;
    cmdR = p.r; cmdG = p.g; cmdB = p.b; cmdFlash = p.flags; cmdAt = now; haveCmd = true;
  }
  uint32_t color;
  if (broken) color = pixels.Color(255, 0, 0);
  else if (!haveCmd || now - cmdAt >= 4000) color = (now / 500) % 2 ? pixels.Color(90, 0, 160) : 0;
  else if (cmdFlash && ((now / 250) % 2) == 0) color = 0;
  else color = pixels.Color(cmdR, cmdG, cmdB);
  paint(color);
  if (reportDue || now - lastReport >= (uint32_t)900) {
    lastReport = now;
    reportDue = false;
    transmit({FLEET, VERSION, 2, (uint8_t)MODULE_ID, (uint8_t)broken, 0, 0, 0});
  }
  delay(5);
}
#endif
