#!/usr/bin/env python3
import base64
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from build_sprites import (
    classify_folder,
    output_name_for_folder,
    validate_output_base,
    DEFAULT_CONFIG,
)

HOST = "127.0.0.1"
PORT = 8765
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_SCRIPT = os.path.join(SCRIPT_DIR, "build_sprites.py")
CONFIG_PATH = os.path.join(SCRIPT_DIR, "spritesgg.local.config.json")
FRAME_W, FRAME_H = DEFAULT_CONFIG["frame_size"]


def json_response(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


def output_name_for_path(folder_name):
    base = output_name_for_folder(folder_name)
    base = validate_output_base(base, folder_name)
    return f"{base}.png"


def run_builder(folder_path):
    folder_path = os.path.abspath(folder_path)
    if not os.path.isdir(folder_path):
        raise RuntimeError(f"Carpeta no existe: {folder_path}")

    folder_name = os.path.basename(folder_path.rstrip(os.sep))
    object_type = classify_folder(folder_name, {})
    if not object_type:
        raise RuntimeError("Prefijo inválido. Usa PJ_, W_, NPC_, I_ o E#_.")

    cwd = os.path.dirname(folder_path)
    output_name = output_name_for_path(folder_name)
    output_path = os.path.join(folder_path, output_name)

    cmd = [
        "python3",
        BUILD_SCRIPT,
        "--config",
        CONFIG_PATH,
        "--only",
        folder_name,
        "--rebuild-all",
        "--precheck",
        "--stitch",
        "append",
    ]

    proc = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        stdout = (proc.stdout or "").strip()
        detail = stderr or stdout or "build_sprites failed"
        raise RuntimeError(detail)

    if not os.path.isfile(output_path):
        raise RuntimeError(f"No se encontró el output esperado: {output_path}")

    with open(output_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")

    return {
        "success": True,
        "folder_name": folder_name,
        "object_type": object_type,
        "output_name": output_name,
        "output_path": output_path,
        "frame_width": FRAME_W,
        "frame_height": FRAME_H,
        "stdout_tail": (proc.stdout or "").strip().splitlines()[-1] if proc.stdout else "",
        "stderr_tail": (proc.stderr or "").strip().splitlines()[-1] if proc.stderr else "",
        "png_base64": encoded,
    }


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True})

    def do_GET(self):
        if self.path == "/health":
            return json_response(self, 200, {"status": "ok"})
        return json_response(self, 404, {"success": False, "error": "Not found"})

    def do_POST(self):
        if self.path != "/build":
            return json_response(self, 404, {"success": False, "error": "Not found"})

        try:
            content_len = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            payload = json.loads(body.decode("utf-8"))
            folder_path = (payload.get("folder_path") or "").strip()
            if not folder_path:
                raise RuntimeError("Falta folder_path")

            result = run_builder(folder_path)
            return json_response(self, 200, result)
        except Exception as exc:
            return json_response(self, 400, {"success": False, "error": str(exc)})

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Builder bridge running on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
