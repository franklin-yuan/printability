// Arduino ESP32 core 3.x. Choose gateway or switch sender; Switches are paired by flipping them during website setup.
#ifndef PRINTY_GATEWAY
#define PRINTY_GATEWAY 1  // 1 = S3 + modular LED chain; 0 = XIAO C3 switch sender
#endif

#include <Arduino.h>
#include <ctype.h>
#include <stdlib.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#if PRINTY_GATEWAY
#include <Adafruit_NeoPixel.h>
#include <Preferences.h>
Preferences pairing;
constexpr int PRINTER_COUNT=64;
uint8_t bindings[PRINTER_COUNT][6]={};
constexpr int PIXELS_PER_PRINTER = 8;
Adafruit_NeoPixel pixels(PIXELS_PER_PRINTER * PRINTER_COUNT, 4, NEO_GRB + NEO_KHZ800); // S3 GPIO4 -> first stick DIN
#else
constexpr int SWITCH_PIN = 4; // XIAO D2 -> maintained switch -> GND

#endif
// Change fleet ID on ALL seven boards if another Printy kit is nearby.
// This separates kits; it is not encryption or authentication.
constexpr uint32_t FLEET = 0x50727961;
constexpr uint8_t CHANNEL = 6, VERSION = 3;
const uint8_t broadcastMac[6] = {255,255,255,255,255,255};
struct __attribute__((packed)) Packet {
  uint32_t fleet;
  uint8_t version, type, id, broken, r, g, b;
};
static_assert(sizeof(Packet)==11, "Wire format changed");
struct Received { Packet packet; uint8_t mac[6]; };
void transmit(Packet packet);
QueueHandle_t inbox;
void received(const esp_now_recv_info_t *info, const uint8_t *data, int length) {
  if(length != sizeof(Packet)) return;
  Received item; memcpy(&item.packet,data,sizeof(Packet));memcpy(item.mac,info->src_addr,6);
  if(item.packet.fleet!=FLEET || item.packet.version!=VERSION) return;
  xQueueSend(inbox,&item,0); // Never do USB/LED work in the radio callback.
}
void transmit(Packet packet) { esp_now_send(broadcastMac,(uint8_t*)&packet,sizeof(packet)); }
void setup() {
  Serial.begin(115200);
#if PRINTY_GATEWAY
  if(!pairing.begin("printy",false)){while(true){Serial.println("E PAIRING_STORAGE");delay(1000);}}
  size_t savedBytes=pairing.getBytesLength("bindings");
  if(savedBytes<=sizeof(bindings)&&savedBytes%6==0&&savedBytes)pairing.getBytes("bindings",bindings,savedBytes);
  pixels.begin();pixels.setBrightness(48);pixels.clear();pixels.show();
#else
  pinMode(SWITCH_PIN,INPUT_PULLUP);
#endif
  inbox=xQueueCreate(24,sizeof(Received));
  WiFi.mode(WIFI_STA);WiFi.setSleep(false);esp_wifi_set_channel(CHANNEL,WIFI_SECOND_CHAN_NONE);
  if(!inbox || esp_now_init()!=ESP_OK) { while(true){Serial.println("E RADIO_INIT");delay(1000);} }
  esp_now_register_recv_cb(received);
  esp_now_peer_info_t peer={};memcpy(peer.peer_addr,broadcastMac,6);peer.channel=CHANNEL;peer.encrypt=false;
  if(esp_now_add_peer(&peer)!=ESP_OK) { while(true){Serial.println("E RADIO_PEER");delay(1000);} }
}
#if PRINTY_GATEWAY
Packet commands[PRINTER_COUNT];uint32_t commandAt[PRINTER_COUNT]={},switchAt[PRINTER_COUNT]={},lastFrame=0,lastHello=0;
bool commanded[PRINTER_COUNT]={},known[PRINTER_COUNT]={},conflict[PRINTER_COUNT]={},switchBroken[PRINTER_COUNT]={};uint8_t owners[PRINTER_COUNT][6];
void resetSlot(int i){known[i]=false;conflict[i]=false;switchBroken[i]=false;switchAt[i]=0;commanded[i]=false;}
bool assignSlot(const char *input){
  int slot;char mac[13],extra;
  if(sscanf(input,"A %d %12s %c",&slot,mac,&extra)!=2||slot<1||slot>PRINTER_COUNT||strlen(mac)!=12)return false;
  uint8_t address[6];
  for(int i=0;i<12;i++)if(!isxdigit((unsigned char)mac[i]))return false;
  for(int i=0;i<6;i++){char pair[3]={mac[i*2],mac[i*2+1],0};address[i]=strtoul(pair,nullptr,16);}
  bool empty=true;for(auto b:address)if(b)empty=false;
  uint8_t previous[PRINTER_COUNT][6];memcpy(previous,bindings,sizeof(bindings));
  bool changed=false;
  if(!empty)for(int i=0;i<PRINTER_COUNT;i++)if(i!=slot-1&&memcmp(bindings[i],address,6)==0){memset(bindings[i],0,6);resetSlot(i);changed=true;}
  if(memcmp(bindings[slot-1],address,6)!=0){memcpy(bindings[slot-1],address,6);resetSlot(slot-1);changed=true;}
  if(changed&&pairing.putBytes("bindings",bindings,sizeof(bindings))!=sizeof(bindings)){
    memcpy(bindings,previous,sizeof(bindings));Serial.println("E PAIRING_STORAGE");return false;
  }
  return true;
}
char line[80];size_t used=0;bool overflow=false;
void serialCommand(){
  while(Serial.available()) {
    char c=(char)Serial.read();if(c=='\r')continue;
    if(c!='\n'){if(used<sizeof(line)-1)line[used++]=c;else overflow=true;continue;}
    line[used]=0;int id,r,g,b;char extra;
    if(!overflow && line[0]=='A'){assignSlot(line);used=0;overflow=false;continue;}
    if(!overflow && sscanf(line,"C %d %d %d %d %c",&id,&r,&g,&b,&extra)==4 && id>=1&&id<=PRINTER_COUNT&&r>=0&&r<=255&&g>=0&&g<=255&&b>=0&&b<=255){
      commands[id-1]={FLEET,VERSION,1,(uint8_t)id,0,(uint8_t)r,(uint8_t)g,(uint8_t)b};commandAt[id-1]=millis();commanded[id-1]=true;
    }
    used=0;overflow=false;
  }
}
void loop(){
  serialCommand();const uint32_t now=millis();
  if(now-lastHello>=1000){lastHello=now;Serial.println("H PRINTY 3 S3");
    for(int i=0;i<PRINTER_COUNT;i++)Serial.printf("M %d %02X%02X%02X%02X%02X%02X\n",i+1,bindings[i][0],bindings[i][1],bindings[i][2],bindings[i][3],bindings[i][4],bindings[i][5]);}
  Received item;
  while(xQueueReceive(inbox,&item,0)==pdTRUE){
    const Packet &p=item.packet;if(p.type!=2||p.broken>1)continue;
    int slot=-1;for(int i=0;i<PRINTER_COUNT;i++)if(memcmp(bindings[i],item.mac,6)==0)slot=i;
    Serial.printf("D %02X%02X%02X%02X%02X%02X %u\n",item.mac[0],item.mac[1],item.mac[2],item.mac[3],item.mac[4],item.mac[5],p.broken);
    if(slot>=0){known[slot]=true;switchAt[slot]=now;switchBroken[slot]=p.broken;Serial.printf("S %u %u\n",slot+1,p.broken);}

  }
  if(now-lastFrame>=25){lastFrame=now;bool changed=false;for(int i=0;i<PRINTER_COUNT;i++){
    uint32_t color;
    // Hold a known BROKEN switch red until that same module reports AUTO.
    // This override does not depend on the computer sending a color command.
    if(switchBroken[i])color=pixels.Color(255,0,0);
    else if(conflict[i]||!known[i]||now-switchAt[i]>=4000||!commanded[i]||now-commandAt[i]>=10000)
      color=(now/500)%2?pixels.Color(90,0,160):0;
    else color=pixels.Color(commands[i].r,commands[i].g,commands[i].b);
    static uint32_t previous[PRINTER_COUNT]={};
    if(previous[i]!=color){pixels.fill(color,i*PIXELS_PER_PRINTER,PIXELS_PER_PRINTER);previous[i]=color;changed=true;}
  }if(changed)pixels.show();}
  delay(2);
}
#else
uint32_t lastReport=0,edgeAt=0;bool raw=false,broken=false,reportDue=true;
void loop(){
  const uint32_t now=millis();bool value=digitalRead(SWITCH_PIN)==LOW;
  if(value!=raw){raw=value;edgeAt=now;}
  if(now-edgeAt>=35&&broken!=raw){broken=raw;reportDue=true;}
  Received item;while(xQueueReceive(inbox,&item,0)==pdTRUE){} // Switch senders have no LED outputs.
  if(reportDue||now-lastReport>=(uint32_t)900){lastReport=now;reportDue=false;transmit({FLEET,VERSION,2,0,(uint8_t)broken,0,0,0});}
  delay(5);
}
#endif
