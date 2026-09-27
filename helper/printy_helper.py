"""Printability local Printability Voice bridge. Standard-library only; Windows GUI launcher included."""
import base64
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import re
import secrets
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API_URL = 'https://api.x.ai/v1/realtime/client_secrets'
PORT = 8765
LOCK = threading.Lock()
ANALYSIS_LOCK = threading.Lock()
CONFIG = {'xai_key': '', 'extension_id': '', 'token': secrets.token_urlsafe(32), 'booth_demo': False}
CONFIG_PATH = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'Printy' / 'connection.json' # Preserve existing connection settings
sys.path.insert(0, str(Path(__file__).resolve().parent))
from hardware_bridge import HardwareBridge
HARDWARE = HardwareBridge()

# Public demo may CORS to loopback hardware/voice. Helper stays on 127.0.0.1 only;
# authorized() still requires the connection token or the booth bypass checkbox.
DEMO_ORIGIN_EXACT = {
    'https://printability.tech',
    'https://www.printability.tech',
    'https://franklin-yuan.github.io',
    'null',  # file://
}
DEMO_ORIGIN_RE = re.compile(
    r'^https?://(127\.0\.0\.1|localhost)(:\d+)?$'
    r'|^https://franklin-yuan\.github\.io$'
)


def is_demo_origin(origin):
    if not origin:
        return False
    if origin in DEMO_ORIGIN_EXACT:
        return True
    return bool(DEMO_ORIGIN_RE.fullmatch(origin))


def protect(value, decrypt=False):
    """Windows DPAPI binds the key/config to the signed-in Windows account."""
    if os.name != 'nt':
        raise RuntimeError('This GUI helper currently supports Windows only.')
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_byte))]
    buf = ctypes.create_string_buffer(value)
    src = Blob(len(value), ctypes.cast(buf, ctypes.POINTER(ctypes.c_byte)))
    dst = Blob()
    fn = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not fn(ctypes.byref(src), None, None, None, None, 1, ctypes.byref(dst)):
        raise RuntimeError('Windows could not protect the saved connection.')
    try:
        return ctypes.string_at(dst.data, dst.size)
    finally:
        ctypes.windll.kernel32.LocalFree(dst.data)


def load_config():
    if CONFIG_PATH.exists():
        saved = json.loads(protect(base64.b64decode(CONFIG_PATH.read_bytes()), True))
        for k in CONFIG:
            if k not in saved:
                continue
            if k == 'booth_demo':
                CONFIG[k] = bool(saved[k])
            else:
                CONFIG[k] = str(saved[k])


def save_config():
    with LOCK:
        data = json.dumps(CONFIG).encode()
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_PATH.with_suffix('.tmp')
    tmp.write_bytes(base64.b64encode(protect(data)))
    tmp.replace(CONFIG_PATH)


def voice_token():
    with LOCK: key=CONFIG['xai_key']
    if not key:raise ValueError('Enter your xAI API key in the helper and save.')
    request=urllib.request.Request(API_URL,data=json.dumps({'expires_after':{'seconds':60}}).encode(),headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(request,timeout=20) as response:data=json.load(response)
    except urllib.error.HTTPError as exc:
        raise ValueError('xAI rejected the connection. Check your xAI key, credits and voice API access.') from None
    except (urllib.error.URLError,TimeoutError):raise ValueError('Could not reach xAI. Check your connection.') from None
    token=data.get('value') or (data.get('client_secret') or {}).get('value')
    if not isinstance(token,str) or not token:raise ValueError('xAI returned no voice session token.')
    return {'value':token}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def is_demo_request(self):
        return is_demo_origin(self.headers.get('Origin'))
    def origin_allowed(self):
        origin=self.headers.get('Origin')
        # Demo Origins may CORS to loopback; authorized() still requires token or booth bypass.
        if self.is_demo_request():
            return True
        with LOCK: eid=CONFIG['extension_id']
        return bool(re.fullmatch('[a-p]{32}',eid)) and (origin is None or origin==f'chrome-extension://{eid}')
    def cors_headers(self):
        origin=self.headers.get('Origin')
        if self.origin_allowed() and origin:
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')
            if self.headers.get('Access-Control-Request-Private-Network')=='true' or self.is_demo_request():
                self.send_header('Access-Control-Allow-Private-Network','true')
    def reply(self, code, data):
        body=json.dumps(data).encode()
        self.send_response(code)
        self.cors_headers()
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def authorized(self, *, allow_demo=False):
        # Loopback-only: Host must be 127.0.0.1 (never a LAN bind).
        if self.headers.get('Host')!=f'127.0.0.1:{PORT}' or not self.origin_allowed():
            self.reply(403,{'error':'Set the matching extension ID in the Printability helper.'});return False
        if self.is_demo_request() and not allow_demo:
            self.reply(403,{'error':'This helper path is not available to the demo page.'});return False
        auth=self.headers.get('Authorization','')
        with LOCK:
            expected=f"Bearer {CONFIG['token']}"
            booth=bool(CONFIG.get('booth_demo'))
        if allow_demo and self.is_demo_request() and booth:
            return True
        if len(auth) != len(expected) or not secrets.compare_digest(auth, expected):
            hint='Enable “Allow booth demo page” in the helper, or paste the connection code.' if self.is_demo_request() else 'The connection code does not match. Copy it from the Printability helper.'
            self.reply(401,{'error':hint});return False
        return True
    def do_OPTIONS(self):
        if not self.headers.get('Origin') or not self.origin_allowed() or self.headers.get('Host')!=f'127.0.0.1:{PORT}':
            self.reply(403,{'error':'Origin not allowed'});return
        self.send_response(204)
        self.cors_headers()
        self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.end_headers()
    def do_GET(self):
        if self.path!='/health':self.reply(404,{'error':'Not found'});return
        if not self.authorized(allow_demo=True):return
        with LOCK: configured=bool(CONFIG['xai_key']); booth=bool(CONFIG.get('booth_demo'))
        self.reply(200,{'configured':configured,'boothDemo':booth,'hardware':HARDWARE.snapshot()})
    def do_POST(self):
        if self.path=='/hardware':
            if not self.authorized(allow_demo=True):return
            if self.headers.get_content_type()!='application/json':self.reply(415,{'error':'JSON required'});return
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4096:raise ValueError('Hardware payload too large or empty.')
                self.connection.settimeout(5)
                self.reply(200,{'hardware':HARDWARE.submit(json.loads(self.rfile.read(length)))})
            except (ValueError,TypeError):self.reply(400,{'error':'Invalid hardware request, or another Printability tab is controlling the lights.'})
            return
        if self.path!='/voice-token':self.reply(404,{'error':'Not found'});return
        # Ephemeral xAI client secret for extension or booth demo (localhost helper only).
        # Long-lived key never leaves this process. Demo needs booth checkbox or connection code.
        if not self.authorized(allow_demo=True):return
        if not ANALYSIS_LOCK.acquire(blocking=False):self.reply(429,{'error':'A voice connection is already being created.'});return
        try:self.reply(200,{'session':voice_token()})
        except ValueError as exc:self.reply(400,{'error':str(exc)})
        except Exception:self.reply(500,{'error':'Voice connection failed.'})
        finally:ANALYSIS_LOCK.release()



def run_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox
    root=tk.Tk();root.title('Printability · Lights and Printability Voice');root.geometry('610x760');root.resizable(True,True)
    load_error=''
    try:load_config()
    except Exception:load_error='Saved connection could not be opened. Enter your settings again.'
    frame=ttk.Frame(root,padding=24);frame.pack(fill='both',expand=True)
    ttk.Label(frame,text='Printability · Lights and Printability Voice',font=('Segoe UI',16,'bold')).pack(anchor='w')
    ttk.Label(frame,text='Keep this window open. Lights and switches do not require an API key.').pack(anchor='w',pady=(6,12))
    values={}
    for label,key,masked in [('xAI API key for Printability Voice','xai_key',True),('Chrome extension ID (from connection settings)','extension_id',False)]:
        ttk.Label(frame,text=label).pack(anchor='w',pady=(8,2))
        v=tk.StringVar(value=CONFIG[key]);values[key]=v
        ttk.Entry(frame,textvariable=v,show='*' if masked else '',width=72).pack(fill='x')
    status=tk.StringVar(value=load_error or 'Enter the extension ID and save. The API key is optional.')
    def save():
        eid=values['extension_id'].get().strip();key=values['xai_key'].get().strip()
        if not re.fullmatch('[a-p]{32}',eid):status.set('Copy the 32-letter extension ID from Printability connection settings.');return
        with LOCK:CONFIG.update(xai_key=key,extension_id=eid)
        try:save_config();status.set('Saved securely for this Windows account. Copy the connection code next.')
        except Exception:status.set('Connected for this session. Windows encryption was unavailable; re-enter settings after closing the helper.')
    ttk.Button(frame,text='Save connection',command=save).pack(anchor='w',pady=12)
    def copy():
        root.clipboard_clear();root.clipboard_append(CONFIG['token']);status.set('Connection code copied. Paste it into Printability’s connection settings.')
    ttk.Button(frame,text='Copy connection code',command=copy).pack(anchor='w')
    booth_var=tk.BooleanVar(value=bool(CONFIG.get('booth_demo')))
    def toggle_booth():
        with LOCK: CONFIG['booth_demo']=bool(booth_var.get())
        try:save_config();status.set('Booth demo page allowed. Open printability.tech on this laptop for lights and live Printability Voice — no token paste needed.' if booth_var.get() else 'Booth demo page blocked. Extension connection unchanged.')
        except Exception:status.set('Booth setting applied for this session only.')
    booth_row=ttk.Frame(frame);booth_row.pack(anchor='w',pady=(10,0),fill='x')
    ttk.Checkbutton(booth_row,text='Allow booth demo page (printability.tech → local lights & voice)',variable=booth_var,command=toggle_booth).pack(anchor='w')
    ttk.Label(frame,text='When checked, the public demo on this PC may drive USB lights and request an ephemeral Printability Voice token. Your xAI key never goes to the page or to git.',wraplength=550).pack(anchor='w',pady=(2,0))
    ttk.Label(frame,textvariable=status,wraplength=525).pack(anchor='w',pady=14)
    ttk.Label(frame,text='Hardware uses no paid API. Printability Voice uses your xAI API account while connected.\nStart voice explicitly; Stop disconnects it. No OpenAI calls.',wraplength=550).pack(anchor='w')
    ttk.Separator(frame).pack(fill='x',pady=12)
    ttk.Label(frame,text='ESP32-S3 USB gateway',font=('Segoe UI',12,'bold')).pack(anchor='w')
    hardware_status=tk.StringVar(value='Select the gateway port, then Connect.')
    port=tk.StringVar();ports=ttk.Combobox(frame,textvariable=port,state='readonly');ports.pack(fill='x',pady=5)
    def refresh_ports():
        values=HARDWARE.ports();ports['values']=values
        if values and port.get() not in values:port.set(values[0])
    def connect_hardware():
        try:HARDWARE.connect(port.get())
        except Exception as exc:hardware_status.set(str(exc));return
    controls=ttk.Frame(frame);controls.pack(anchor='w')
    ttk.Button(controls,text='Refresh ports',command=refresh_ports).pack(side='left')
    ttk.Button(controls,text='Connect',command=connect_hardware).pack(side='left')
    ttk.Button(controls,text='Disconnect',command=HARDWARE.disconnect).pack(side='left')
    def install_usb():
        import subprocess
        hardware_status.set('Installing USB support…')
        def work():
            try:
                result=subprocess.run([sys.executable,'-m','pip','install','--target',str(Path(__file__).resolve().parent/'vendor'),'pyserial==3.5'],capture_output=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),timeout=120)
                message='USB support installed. Click Refresh ports.' if result.returncode==0 else 'USB install failed. Check your internet connection and Python pip installation.'
            except Exception:message='USB support could not be installed.'
            root.after(0,lambda:hardware_status.set(message))
        threading.Thread(target=work,daemon=True).start()
    ttk.Button(frame,text='Install USB support (once)',command=install_usb).pack(anchor='w',pady=5)
    ttk.Label(frame,textvariable=hardware_status,wraplength=550).pack(anchor='w')
    def hardware_tick():
        snapshot=HARDWARE.snapshot()
        if HARDWARE.serial:
            count=sum(m['online'] for m in snapshot['modules'])
            hardware_status.set(f"Gateway connected · {count}/6 modules online" if snapshot['connected'] else snapshot['error'] or 'Gateway heartbeat lost.')
        root.after(1000,hardware_tick)
    refresh_ports();hardware_tick()
    try:server=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
    except OSError:
        messagebox.showerror('Printability helper','Port 8765 is already in use. If Printability is already open, use that window.');root.destroy();return
    threading.Thread(target=server.serve_forever,daemon=True).start()
    def close():HARDWARE.disconnect();server.shutdown();server.server_close();root.destroy()
    root.protocol('WM_DELETE_WINDOW',close);root.mainloop()

if __name__=='__main__':run_gui()
