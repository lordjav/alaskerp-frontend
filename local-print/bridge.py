"""Local SAT15TUS bridge. Python 3.10+, standard library only; Windows spooler RAW."""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import secrets
import sqlite3
import sys
import uuid

DRAWER_PULSE = bytes([27, 112, 0, 50, 250])
ORIGINS = {"https://alaskerp.javiermeza.dev", "https://lordjav.github.io", "http://127.0.0.1:5173", "http://localhost:5173"}


def build_payload(data, drawer_only=False):
    if not isinstance(data, dict):
        raise ValueError("Solicitud inválida.")
    request_id = data.get("request_id")
    if not isinstance(request_id, str):
        raise ValueError("Falta identificador de solicitud.")
    uuid.UUID(request_id)
    if drawer_only:
        return DRAWER_PULSE
    lines = data.get("lines")
    if not isinstance(lines, list) or not 1 <= len(lines) <= 500:
        raise ValueError("El tiquete debe contener entre 1 y 500 líneas.")
    if any(not isinstance(line, str) or len(line) > 42 or any(ord(c) < 32 or ord(c) > 126 for c in line) for line in lines):
        raise ValueError("Líneas inválidas: máximo 42 caracteres ASCII imprimibles.")
    if type(data.get("open_drawer", False)) is not bool:
        raise ValueError("Apertura inválida.")
    # Reset, font A, left alignment. No cutter command: SAT15TUS uses manual tear bar.
    payload = b'\x1b@\x1bM\x00\x1ba\x00' + ('\n'.join(lines) + '\n\n\n\n').encode('ascii')
    return payload + (DRAWER_PULSE if data.get("open_drawer") else b'')


class WindowsPrinter:
    def __init__(self, name="SAT15TUS"):
        if sys.platform != "win32":
            raise RuntimeError("El conector requiere Windows.")
        self.name = name
        self.api = ctypes.WinDLL("winspool.drv", use_last_error=True)
        class DocInfo(ctypes.Structure):
            _fields_ = [("name", wintypes.LPWSTR), ("output", wintypes.LPWSTR), ("datatype", wintypes.LPWSTR)]
        self.DocInfo = DocInfo
        definitions = {
            "OpenPrinterW": ([wintypes.LPWSTR, ctypes.POINTER(wintypes.HANDLE), ctypes.c_void_p], wintypes.BOOL),
            "StartDocPrinterW": ([wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(DocInfo)], wintypes.DWORD),
            "WritePrinter": ([wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)], wintypes.BOOL),
            "EndDocPrinter": ([wintypes.HANDLE], wintypes.BOOL),
            "ClosePrinter": ([wintypes.HANDLE], wintypes.BOOL),
        }
        for name, (args, result) in definitions.items():
            fn = getattr(self.api, name); fn.argtypes = args; fn.restype = result

    def open(self):
        handle = wintypes.HANDLE()
        if not self.api.OpenPrinterW(self.name, ctypes.byref(handle), None):
            raise ctypes.WinError(ctypes.get_last_error())
        return handle

    def check(self):
        handle = self.open(); self.api.ClosePrinter(handle)

    def send(self, payload):
        handle = self.open()
        try:
            job = self.api.StartDocPrinterW(handle, 1, ctypes.byref(self.DocInfo("Alaskerp - tiquete/cajon", None, "RAW")))
            if not job: raise ctypes.WinError(ctypes.get_last_error())
            try:
                written = wintypes.DWORD()
                buffer = ctypes.create_string_buffer(payload)
                if not self.api.WritePrinter(handle, buffer, len(payload), ctypes.byref(written)):
                    raise ctypes.WinError(ctypes.get_last_error())
                if written.value != len(payload): raise OSError("Envío incompleto.")
            finally:
                if not self.api.EndDocPrinter(handle): raise ctypes.WinError(ctypes.get_last_error())
            return job
        finally:
            self.api.ClosePrinter(handle)


class JobStore:
    """Persist intent before spooling. Never replay an uncertain physical operation."""
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, digest TEXT NOT NULL, state TEXT NOT NULL, job INTEGER)")
        self.db.commit()

    def send(self, request_id, payload, printer):
        digest = hashlib.sha256(payload).hexdigest()
        row = self.db.execute("SELECT digest,state,job FROM jobs WHERE id=?", (request_id,)).fetchone()
        if row:
            if row[0] != digest: raise ValueError("El identificador ya pertenece a otra orden.")
            if row[1] != "sent": raise RuntimeError("Envío incierto. Comprueba impresora y cajón antes de solicitar otra impresión.")
            return row[2]
        self.db.execute("INSERT INTO jobs VALUES (?, ?, 'pending', NULL)", (request_id, digest)); self.db.commit()
        job = printer.send(payload)
        self.db.execute("UPDATE jobs SET state='sent',job=? WHERE id=?", (job, request_id)); self.db.commit()
        return job


def handler_for(printer, token, store, origins=ORIGINS):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def log_message(self, *args):
            pass  # Do not log sales or pairing credentials.

        def reply(self, status, data):
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            origin = self.headers.get("Origin")
            if origin in origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Alaskerp-Print-Token")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)

        def allowed(self, auth=True):
            if self.headers.get("Host") != "127.0.0.1:19151" or self.headers.get("Origin") not in origins:
                self.reply(403, {"message": "Origen no autorizado."}); return False
            if auth and not secrets.compare_digest(self.headers.get("X-Alaskerp-Print-Token", "").encode(), token.encode()):
                self.reply(401, {"message": "Clave del conector incorrecta. Revisa Tiquetes e impresora."}); return False
            return True

        def do_OPTIONS(self):
            if self.allowed(False): self.reply(200, {})

        def do_GET(self):
            if not self.allowed(): return
            if self.path == "/ping":
                self.reply(200, {"message": "Conector Alaska Caja disponible.", "version": 1}); return
            if self.path != "/health": self.reply(404, {"message": "Ruta desconocida."}); return
            try:
                printer.check()
                self.reply(200, {"message": "SAT15TUS está instalada y el conector responde. Imprime una prueba para verificar el equipo."})
            except OSError:
                self.reply(503, {"message": "Windows no permite acceder a SAT15TUS. Revisa la impresora instalada."})

        def do_POST(self):
            if not self.allowed(): return
            if self.path not in ("/print", "/drawer"): self.reply(404, {"message": "Ruta desconocida."}); return
            try:
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    raise ValueError("Se requiere JSON.")
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 65536: raise ValueError("Tamaño inválido.")
                self.connection.settimeout(5)
                data = json.loads(self.rfile.read(length))
                payload = build_payload(data, self.path == "/drawer")
                job = store.send(data["request_id"], payload, printer)
                self.reply(200, {"message": "Orden aceptada por Windows.", "job_id": job})
            except (ValueError, TypeError):
                self.reply(400, {"message": "Solicitud inválida o identificador reutilizado con otros datos."})
            except RuntimeError as error:
                self.reply(409, {"message": str(error)})
            except (OSError, sqlite3.Error):
                self.reply(503, {"message": "No se confirmó el envío. Revisa la cola y el papel antes de repetir la orden."})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, help="Carpeta persistente de clave y órdenes")
    parser.add_argument("--drawer", action="store_true", help="Abrir cajón directamente, sin web ni servidor")
    parser.add_argument("--show-token", action="store_true", help="Mostrar clave de conexión al iniciar")
    args = parser.parse_args()
    folder = args.data_dir or (Path(__file__).resolve().parent / ".local")
    folder.mkdir(parents=True, exist_ok=True)
    config = folder / "token.txt"
    if not config.exists(): config.write_text(secrets.token_urlsafe(32), encoding="ascii")
    token = config.read_text(encoding="ascii").strip()
    printer = WindowsPrinter()
    store = JobStore(folder / "jobs.sqlite3")
    if args.drawer:
        try:
            job = store.send(str(uuid.uuid4()), DRAWER_PULSE, printer)
            print(json.dumps({"message": "Orden aceptada por Windows.", "job_id": job}), flush=True)
        finally: store.db.close()
        return
    server = HTTPServer(("127.0.0.1", 19151), handler_for(printer, token, store))
    server.timeout = 5
    print("Conector Alaskerp en http://127.0.0.1:19151 - SAT15TUS", flush=True)
    if args.show_token: print("Clave para Tiquetes e impresora: " + token, flush=True)
    print("Conector activo. Ctrl+C para detener en modo consola.", flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close(); store.db.close()

if __name__ == "__main__": main()
