"""USB gateway bridge; pyserial is optional until hardware is connected."""
import re
import threading
import time
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent / 'vendor'))

MODULE_COUNT = 6
FIXED_BINDINGS = {i: 'FIXED' for i in range(1, MODULE_COUNT + 1)}


class HardwareBridge:
    def __init__(self):
        self.lock = threading.RLock()
        self.serial = None
        self.thread = None
        self.stop = threading.Event()
        self.modules = {}
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
            self.serial = device
            self.port = port
            self.error = 'Waiting for Printability S3 firmware…'
            self.modules = {}
            self.last_hello = 0
            self.commands = []
            self.last_submit = 0
            self.owner = None
        self.stop.clear()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def disconnect(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=2)
        with self.lock:
            if self.serial:
                self.serial.close()
            self.serial = None
            self.last_hello = 0
            self.modules = {}
            self.commands = []
            self.owner = None
            self.error = 'USB gateway disconnected.'

    def ingest(self, text, now=None):
        now = time.monotonic() if now is None else now
        parts = text.strip().split()
        with self.lock:
            if len(parts) == 4 and parts[:2] == ['H', 'PRINTY'] and parts[2] == '4' and parts[3] == 'S3':
                self.last_hello = now
                self.error = ''
                return
            if len(parts) != 3 or parts[0] != 'S' or parts[2] not in ('0', '1'):
                return
            try:
                slot = int(parts[1])
            except ValueError:
                return
            if not 1 <= slot <= MODULE_COUNT:
                return
            self.modules[slot] = {'seen': now, 'broken': parts[2] == '1', 'conflict': False}

    def snapshot(self, now=None):
        now = time.monotonic() if now is None else now
        with self.lock:
            online = bool(self.serial and self.last_hello and now - self.last_hello < 4)
            return {
                'connected': online,
                'port': self.port,
                'error': self.error if not online else '',
                'maxLights': MODULE_COUNT,
                'protocol': 4 if online else 0,
                'bindings': FIXED_BINDINGS.copy(),
                'modules': [{
                    'id': slot,
                    'online': online and now - m['seen'] < 4,
                    'broken': m['broken'],
                    'conflict': False,
                } for slot, m in sorted(self.modules.items())],
            }

    def submit(self, payload, now=None):
        now = time.monotonic() if now is None else now
        if not isinstance(payload, dict) or not isinstance(payload.get('owner'), str) or not 8 <= len(payload['owner']) <= 80:
            raise ValueError('Invalid hardware owner.')
        commands = payload.get('lights')
        if not isinstance(commands, list) or len(commands) > MODULE_COUNT:
            raise ValueError(f'Expected at most {MODULE_COUNT} lights.')
        seen = set()
        validated = []
        for c in commands:
            if not isinstance(c, dict) or type(c.get('id')) is not int or not 1 <= c['id'] <= MODULE_COUNT or c['id'] in seen:
                raise ValueError(f'Light IDs must be unique, 1-{MODULE_COUNT}.')
            rgb = c.get('rgb')
            if not isinstance(rgb, list) or len(rgb) != 3 or any(type(v) is not int or not 0 <= v <= 255 for v in rgb):
                raise ValueError('Invalid light color.')
            flash = c.get('flash', 0)
            if type(flash) is not int or flash not in (0, 1):
                raise ValueError('Invalid light flash flag.')
            seen.add(c['id'])
            validated.append((c['id'], *rgb, flash))
        with self.lock:
            if self.owner and self.owner != payload['owner'] and now - self.last_submit < 8:
                raise ValueError('Another Printability tab controls the lights. Disable hardware there or close that tab.')
            self.owner = payload['owner']
            self.commands = validated
            self.last_submit = now
        return self.snapshot(now)

    def _run(self):
        last_send = 0
        buffer = b''
        try:
            while not self.stop.is_set():
                with self.lock:
                    device = self.serial
                chunk = device.read(128)
                buffer += chunk
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    if len(line) <= 100:
                        self.ingest(line.decode('ascii', errors='ignore'))
                if len(buffer) > 256:
                    buffer = b''
                now = time.monotonic()
                with self.lock:
                    commands = list(self.commands) if now - self.last_submit < 6 and self.last_hello and now - self.last_hello < 4 else []
                if now - last_send >= 1:
                    last_send = now
                    for command in commands:
                        device.write(('C %d %d %d %d %d\n' % command).encode('ascii'))
        except Exception:
            with self.lock:
                self.error = 'USB connection lost. Reconnect the S3 in the helper.'
                self.last_hello = 0
