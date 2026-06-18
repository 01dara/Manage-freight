import http.server
import socketserver
import json
import os
import threading
import urllib.parse
import sys

PORT = 8000
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
CARGO_FILE = os.path.join(DATA_DIR, 'cargo.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')

# Threading locks
db_lock = threading.Lock()
sse_lock = threading.Lock()

# Active SSE clients
sse_clients = []

def init_db():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    
    with db_lock:
        if not os.path.exists(CARGO_FILE):
            with open(CARGO_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
                
        if not os.path.exists(SETTINGS_FILE):
            default_settings = {
                "managerName": "Hout Dara",
                "darkMode": False,
                "language": "KH",
                "senders": ["ភ្នំពេញ (Phnom Penh)", "សេអ៊ូល (Seoul)"],
                "receivers": ["ដារ៉ា (Dara)", "ម៉ារី (Mary)"]
            }
            with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(default_settings, f, ensure_ascii=False, indent=2)

def read_db(file_path):
    with db_lock:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return [] if file_path == CARGO_FILE else {}

def write_db(file_path, data):
    with db_lock:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

def broadcast_sse(event_type, payload=None):
    message = f"event: {event_type}\ndata: {json.dumps(payload or {})}\n\n"
    with sse_lock:
        closed_clients = []
        for client in sse_clients:
            try:
                client.wfile.write(message.encode('utf-8'))
                client.wfile.flush()
            except Exception:
                closed_clients.append(client)
        
        # Remove disconnected clients
        for client in closed_clients:
            if client in sse_clients:
                sse_clients.remove(client)

class CargoHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path

        # SSE Endpoint
        if path == '/api/events':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            
            # Keep client connected
            with sse_lock:
                sse_clients.append(self)
            
            # Send initial keepalive comment
            try:
                self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
            except Exception:
                pass
                
            # Block this thread to keep connection open
            # ThreadingTCPServer allocates a thread per connection, so this won't block other requests
            # We wait until connection drops
            event = threading.Event()
            # Monitor socket connection
            while True:
                try:
                    # Send a heartbeat/ping comment every 15 seconds
                    event.wait(15)
                    with sse_lock:
                        if self not in sse_clients:
                            break
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                except Exception:
                    break
            
            with sse_lock:
                if self in sse_clients:
                    sse_clients.remove(self)
            return

        # REST API endpoints
        elif path == '/api/cargo':
            data = read_db(CARGO_FILE)
            response = json.dumps(data, ensure_ascii=False)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(response.encode('utf-8'))
            return
            
        elif path == '/api/settings':
            data = read_db(SETTINGS_FILE)
            response = json.dumps(data, ensure_ascii=False)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(response.encode('utf-8'))
            return

        # Serve static files
        else:
            # Clean up paths to prevent directory traversal
            clean_path = path.lstrip('/')
            if not clean_path or clean_path == 'index.html':
                file_path = os.path.join(PUBLIC_DIR, 'index.html')
            else:
                file_path = os.path.join(PUBLIC_DIR, clean_path)

            # Check if file exists and lies within public directory
            real_public = os.path.realpath(PUBLIC_DIR)
            real_file = os.path.realpath(file_path)
            
            if not real_file.startswith(real_public) or not os.path.exists(file_path) or os.path.isdir(file_path):
                # Fallback to index.html for SPA client routing, or 404
                file_path = os.path.join(PUBLIC_DIR, 'index.html')
                if not os.path.exists(file_path):
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(b"File not found")
                    return

            # Determine content type
            content_type = 'text/html; charset=utf-8'
            if file_path.endswith('.css'):
                content_type = 'text/css; charset=utf-8'
            elif file_path.endswith('.js'):
                content_type = 'application/javascript; charset=utf-8'
            elif file_path.endswith('.json'):
                content_type = 'application/json; charset=utf-8'
            elif file_path.endswith('.png'):
                content_type = 'image/png'
            elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
                content_type = 'image/jpeg'
            elif file_path.endswith('.svg'):
                content_type = 'image/svg+xml'
            elif file_path.endswith('.ico'):
                content_type = 'image/x-icon'

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            
            # Read and write file content
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    def do_POST(self):
        path = self.path
        
        if path == '/api/cargo' or path == '/api/settings':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            
            try:
                data = json.loads(body)
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(f"Invalid JSON: {str(e)}".encode('utf-8'))
                return

            if path == '/api/cargo':
                # Save cargo list from client
                # Expected format is the complete list of cargo items, or we can handle operations.
                # To keep it extremely simple and match client-side IndexedDB sync,
                # the client will upload its list, or perform sync.
                # Let's support:
                # { "action": "save_all", "cargo": [...] } or standard list direct save
                # For sync, the client sending the entire list or individual items works.
                # Direct saving of the cargo items list:
                if isinstance(data, list):
                    write_db(CARGO_FILE, data)
                    broadcast_sse('cargo_update', data)
                    response = {"status": "success", "count": len(data)}
                else:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Expected a list of cargo items")
                    return
            
            elif path == '/api/settings':
                if isinstance(data, dict):
                    write_db(SETTINGS_FILE, data)
                    broadcast_sse('settings_update', data)
                    response = {"status": "success"}
                else:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Expected a settings object")
                    return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

def run():
    init_db()
    # Ensure public folder structure exists
    if not os.path.exists(PUBLIC_DIR):
        os.makedirs(PUBLIC_DIR)
        os.makedirs(os.path.join(PUBLIC_DIR, 'css'))
        os.makedirs(os.path.join(PUBLIC_DIR, 'js'))

    server_address = ('', PORT)
    httpd = ThreadingTCPServer(server_address, CargoHTTPRequestHandler)
    print(f"Flight Cargo Server running in real-time on http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()
        sys.exit(0)

if __name__ == '__main__':
    run()
