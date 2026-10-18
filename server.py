#!/usr/bin/env python3
"""Lokaler Server für den Pressekit Generator.

Liefert die App unter http://localhost:8765 aus und bietet POST /api/mail:
Die App schickt das fertig gerenderte Pressekit als eigenständiges HTML,
der Server druckt es mit Chrome (headless) als A4-PDF und öffnet in Apple Mail
einen Entwurf mit BCC, Betreff, Text und PDF-Anhang. Verschickt wird nichts.
"""
import http.server
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

PORT = 8765
ROOT = Path(__file__).resolve().parent
APP_DIR = ROOT / 'app'
EXPORT_DIR = Path.home() / 'Downloads' / 'Pressekits'
CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    str(Path.home() / 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

MAIL_SCRIPT = '''
on run argv
  set theSubject to item 1 of argv
  set theBody to item 2 of argv
  set thePdf to item 3 of argv
  tell application "Mail"
    set msg to make new outgoing message with properties {subject:theSubject, content:theBody, visible:true}
    tell msg
      repeat with i from 4 to count of argv
        make new bcc recipient at end of bcc recipients with properties {address:(item i of argv)}
      end repeat
      make new attachment with properties {file name:(POSIX file thePdf)} at after the last paragraph
    end tell
    activate
  end tell
end run
'''


def find_chrome():
    return next((c for c in CHROME_CANDIDATES if os.path.exists(c)), None)


def safe_filename(name):
    name = re.sub(r'[\\/:*?"<>|]+', '', name).strip() or 'Pressekit'
    return name[:120]


def html_to_pdf(html, pdf_path):
    chrome = find_chrome()
    if not chrome:
        raise RuntimeError('Google Chrome wurde nicht gefunden – wird für die PDF-Erstellung benötigt.')
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / 'kit.html'
        src.write_text(html, encoding='utf-8')
        subprocess.run([
            chrome, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
            f'--user-data-dir={tmp}/profile', '--virtual-time-budget=5000',
            f'--print-to-pdf={pdf_path}', src.as_uri(),
        ], check=True, capture_output=True, timeout=90)
    if not pdf_path.exists():
        raise RuntimeError('Die PDF konnte nicht erstellt werden.')


def open_mail_draft(subject, body, pdf_path, bcc):
    subprocess.run(['osascript', '-', subject, body, str(pdf_path), *bcc],
                   input=MAIL_SCRIPT, text=True, check=True, capture_output=True, timeout=60)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == '/api/ping':
            return self.send_json(200, {'ok': True, 'chrome': bool(find_chrome())})
        super().do_GET()

    def do_POST(self):
        if self.path not in ('/api/mail', '/api/pdf'):
            return self.send_json(404, {'error': 'Nicht gefunden'})
        try:
            data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if self.path == '/api/pdf':
                with tempfile.TemporaryDirectory() as tmp:
                    pdf_path = Path(tmp) / 'kit.pdf'
                    html_to_pdf(data['html'], pdf_path)
                    pdf = pdf_path.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Length', str(len(pdf)))
                self.end_headers()
                self.wfile.write(pdf)
                return
            EXPORT_DIR.mkdir(parents=True, exist_ok=True)
            pdf_path = EXPORT_DIR / (safe_filename(data['filename']) + '.pdf')
            html_to_pdf(data['html'], pdf_path)
            if not data.get('pdfOnly'):
                open_mail_draft(data['subject'], data['body'], pdf_path, data.get('bcc', []))
            self.send_json(200, {'ok': True, 'pdf': str(pdf_path)})
        except subprocess.CalledProcessError as e:
            msg = (e.stderr or b'').decode() if isinstance(e.stderr, bytes) else (e.stderr or '')
            self.send_json(500, {'error': msg.strip() or str(e)})
        except Exception as e:  # noqa: BLE001 – Fehler an die App melden
            self.send_json(500, {'error': str(e)})

    def log_message(self, fmt, *args):
        if self.command == 'POST':
            super().log_message(fmt, *args)


if __name__ == '__main__':
    print(f'UNGESTUEM Pressekit Generator läuft auf http://localhost:{PORT}  (Fenster offen lassen)')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
