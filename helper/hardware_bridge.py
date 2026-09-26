"""USB gateway bridge; pyserial is optional until hardware is connected."""
import re
import threading
import time
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent / 'vendor'))


class HardwareBridge:
    def __init__(self):
        self.lock = threading.RLock()
        self.serial = None
        self.thread = None
        self.stop = threading.Event()
        self.modules = {}
        self.devices = {}
        self.bindings = {}
        self.pending = {}
        self.enrollment = None
        self.setup_message = ""
        self.protocol = 0
        self.commands = []
        self.last_submit = 0
        self.last_hello = 0
        self.owner = None
        self.error = 'Select the S3 USB port in the helper.'
        self.port = ''

    def ports(self):
        try:
            from serial.tools import list_ports
            return [p.device for p in list_ports.comports()]
        except ImportError:
            return []

    def connect(self, port):
        self.disconnect()
        try:
            import serial
        except ImportError:
            raise ValueError('Install USB support using the helper button first.') from None
        if port not in self.ports():
            raise ValueError('Select an available USB serial port.')
        device = serial.Serial(port, 115200, timeout=0.2, write_timeout=1)
        with self.lock:
            self.serial=device;self.port=port;self.error='Waiting for Printability S3 firmware…'
            self.enrollment=None;self.setup_message="";self.modules={};self.devices={};self.bindings={};self.pending={};self.protocol=0;self.last_hello=0;self.commands=[];self.last_submit=0;self.owner=None
        self.stop.clear()
        self.thread=threading.Thread(target=self._run,daemon=True);self.thread.start()

    def disconnect(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=2)
        with self.lock:
            if self.serial:
                self.serial.close()
            self.enrollment=None;self.pending={};self.serial=None;self.last_hello=0;self.modules={};self.commands=[];self.owner=None
            self.error='USB gateway disconnected.'

    def ingest(self, text, now=None):
        now=time.monotonic() if now is None else now
        parts=text.strip().split()
        with self.lock:
            if len(parts)==4 and parts[:2]==['H','PRINTY'] and parts[2] in ('1','2','3') and parts[3]=='S3':
                self.protocol=int(parts[2])
                self.last_hello=now;self.error='';return
            if len(parts)==3 and parts[0]=='D' and re.fullmatch(r'[0-9A-F]{12}',parts[1]) and parts[2] in ('0','1'):
                if parts[1] in self.devices or len(self.devices)<128:
                    previous=self.devices.get(parts[1])
                    if self.enrollment and now<self.enrollment['until'] and now-self.last_submit<6 and self.last_hello and now-self.last_hello<4 and previous and now-previous['seen']<4 and previous['broken']!=(parts[2]=='1'):
                        slot=self.enrollment['id'];self.pending[slot]=parts[1]
                        self.setup_message=f'Saving module {slot}...'
                        self.enrollment=None
                    self.devices[parts[1]]={'seen':now,'broken':parts[2]=='1'}
                return
            if len(parts)==3 and parts[0]=='M' and parts[1].isdigit() and 1<=int(parts[1])<=64 and re.fullmatch(r'[0-9A-F]{12}',parts[2]):
                slot=int(parts[1]);mac=parts[2]
                if self.bindings.get(slot)!=mac:self.modules.pop(slot,None)
                self.bindings[slot]=mac
                if self.pending.get(slot)==mac:
                    self.pending.pop(slot);self.setup_message=f'Module {slot} connected. Choose its printer below.'
                return
            if len(parts)!=3 or parts[0] not in ('S','X'):
                return
            try:slot=int(parts[1])
            except ValueError:return
            if not 1<=slot<=64:return
            if parts[0]=='X' and parts[2]=='DUPLICATE_ID':
                self.modules[slot]={'seen':now,'broken':False,'conflict':True}
            elif parts[0]=='S' and parts[2] in ('0','1'):
                old=self.modules.get(slot,{})
                self.modules[slot]={'seen':now,'broken':parts[2]=='1','conflict':old.get('conflict',False)}

    def snapshot(self, now=None):
        now=time.monotonic() if now is None else now
        with self.lock:
            if self.enrollment and (now>=self.enrollment['until'] or now-self.last_submit>=6 or not self.last_hello or now-self.last_hello>=4):
                self.enrollment=None;self.setup_message='Setup ended. Click Set up and flip the switch again.'
            online=bool(self.serial and self.last_hello and now-self.last_hello<4)
            return {'connected':online,'port':self.port,'error':self.error if not online else '',
                    'enrollment':self.enrollment['id'] if self.enrollment else None,'setupMessage':self.setup_message,
                    'maxLights':64 if self.protocol==3 else 6,'protocol':self.protocol,'bindings':self.bindings.copy(),'pending':bool(self.pending),
                    'devices':[{'mac':mac,'online':online and now-d['seen']<4,'broken':d['broken']} for mac,d in sorted(self.devices.items())],
                    'modules':[{'id':slot,'online':online and now-m['seen']<4 and not m['conflict'],
                                'broken':m['broken'],'conflict':m['conflict']} for slot,m in sorted(self.modules.items())]}

    def submit(self, payload, now=None):
        now=time.monotonic() if now is None else now
        if not isinstance(payload,dict) or not isinstance(payload.get('owner'),str) or not 8<=len(payload['owner'])<=80:
            raise ValueError('Invalid hardware owner.')
        commands=payload.get('lights')
        if not isinstance(commands,list) or len(commands)>64:raise ValueError('Expected at most 64 lights.')
        seen=set();validated=[]
        for c in commands:
            if not isinstance(c,dict) or type(c.get('id')) is not int or not 1<=c['id']<=64 or c['id'] in seen:raise ValueError('Light IDs must be unique, 1–64.')
            rgb=c.get('rgb')
            if not isinstance(rgb,list) or len(rgb)!=3 or any(type(v) is not int or not 0<=v<=255 for v in rgb):raise ValueError('Invalid light color.')
            seen.add(c['id']);validated.append((c['id'],*rgb))
        enroll=payload.get('enroll')
        if enroll is not None and (type(enroll) is not int or not 0<=enroll<=64):raise ValueError('Invalid setup module.')
        assignment=payload.get('assignment')
        if assignment is not None:
            if not isinstance(assignment,dict) or type(assignment.get('id')) is not int or not 1<=assignment['id']<=64 or not isinstance(assignment.get('mac'),str) or not re.fullmatch(r'[0-9A-F]{12}',assignment['mac']):
                raise ValueError('Invalid module assignment.')
        with self.lock:
            if (assignment is not None or enroll is not None) and (self.protocol not in (2,3) or not self.last_hello or now-self.last_hello>=4):
                raise ValueError('Update and connect the S3 firmware before assigning modules.')
            if self.owner and self.owner!=payload['owner'] and now-self.last_submit<8:
                raise ValueError('Another Printability tab controls the lights. Disable hardware there or close that tab.')
            if enroll is not None:
                if self.pending:raise ValueError('Wait for assignment to save.')
                self.enrollment={'id':enroll,'until':now+30} if enroll else None
                self.setup_message=f'Flip the switch on module {enroll} now (30 seconds).' if enroll else 'Setup cancelled.'
            if assignment is not None:
                if assignment['mac']!='000000000000' and assignment['mac'] not in self.devices:raise ValueError('Module has not been discovered.')
                if self.pending and self.pending.get(assignment['id'])!=assignment['mac']:raise ValueError('Wait for the previous assignment to finish.')
                self.pending[assignment['id']]=assignment['mac']
            self.owner=payload['owner'];self.commands=validated;self.last_submit=now
        return self.snapshot(now)

    def _run(self):
        last_send=0;buffer=b''
        try:
            while not self.stop.is_set():
                with self.lock:device=self.serial
                chunk=device.read(128)
                buffer+=chunk
                while b'\n' in buffer:
                    line,buffer=buffer.split(b'\n',1)
                    if len(line)<=100:self.ingest(line.decode('ascii',errors='ignore'))
                if len(buffer)>256:buffer=b''
                now=time.monotonic()
                with self.lock:
                    commands=list(self.commands) if now-self.last_submit<6 and self.last_hello and now-self.last_hello<4 else []
                if now-last_send>=1:
                    last_send=now
                    with self.lock:assignments=list(self.pending.items()) if self.last_hello and now-self.last_hello<4 else []
                    for slot,mac in assignments:device.write(f'A {slot} {mac}\n'.encode('ascii'))
                    for command in commands:device.write(('C %d %d %d %d\n'%command).encode('ascii'))
        except Exception:
            with self.lock:self.error='USB connection lost. Reconnect the S3 in the helper.';self.last_hello=0
