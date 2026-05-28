import os
import json
import uuid
import queue
import threading
import urllib.request
import urllib.parse
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Configuration
PORT = int(os.environ.get('PORT', 3000))
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))

os.makedirs(DATA_DIR, exist_ok=True)

SESSIONS_FILE = os.path.join(DATA_DIR, 'sessions.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')

# Locks for thread safety
db_lock = threading.Lock()
clients_lock = threading.Lock()

# SSE clients list (list of queue.Queue)
sse_clients = []

# Helper: Load/Save JSON DB
def load_db(file_path, default=None):
    if default is None:
        default = {}
    with db_lock:
        if not os.path.exists(file_path):
            return default
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return default

def save_db(file_path, data):
    with db_lock:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"Error saving to {file_path}: {e}")
            return False

# Initialize settings if not exists
default_settings = {
    "telegram_token": "",
    "telegram_chat_id": "",
    "discord_webhook": "",
    "enable_notifications": True
}
if not os.path.exists(SETTINGS_FILE):
    save_db(SETTINGS_FILE, default_settings)

# Broadcast event to all active SSE clients
def broadcast_event(event):
    with clients_lock:
        inactive_clients = []
        for q in sse_clients:
            try:
                q.put_nowait(event)
            except queue.Full:
                inactive_clients.append(q)
        for client in inactive_clients:
            if client in sse_clients:
                sse_clients.remove(client)

# Notification Service
def send_telegram_notification(token, chat_id, message):
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        # Bypassing SSL revocation issues for safety
        ctx = urllib.request.ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = urllib.request.ssl.CERT_NONE
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            response.read()
    except Exception as e:
        print(f"Telegram notification error: {e}")

def send_discord_notification(webhook_url, embed):
    if not webhook_url:
        return
    payload = {
        "embeds": [embed]
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    )
    try:
        ctx = urllib.request.ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = urllib.request.ssl.CERT_NONE
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            response.read()
    except Exception as e:
        print(f"Discord notification error: {e}")

def get_segment_name(segment):
    names = {
        1: "Segment 1: Basic Details",
        2: "Segment 2: Profile & Experience",
        3: "Segment 3: Program Preferences",
        4: "Segment 4: Completed Registration"
    }
    return names.get(segment, f"Segment {segment}")

def build_notification_message(session):
    name = session.get('fields', {}).get('name', 'Anonymous Visitor')
    city = session.get('fields', {}).get('city', 'Unknown City')
    mobile = session.get('fields', {}).get('mobile', 'N/A')
    segment = session.get('current_segment', 1)
    seg_name = get_segment_name(segment)
    
    msg = f"<b>🔔 Progress Alert:</b>\n"
    msg += f"<b>User:</b> {name}\n"
    msg += f"<b>City:</b> {city}\n"
    msg += f"<b>Mobile:</b> {mobile}\n"
    msg += f"<b>Status:</b> Just completed {seg_name}\n"
    msg += f"<b>Time:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    return msg

def build_discord_embed(session):
    name = session.get('fields', {}).get('name', 'Anonymous Visitor')
    city = session.get('fields', {}).get('city', 'Unknown City')
    email = session.get('fields', {}).get('email', 'N/A')
    mobile = session.get('fields', {}).get('mobile', 'N/A')
    segment = session.get('current_segment', 1)
    seg_name = get_segment_name(segment)
    
    colors = {
        1: 3447003,  # Blue
        2: 10181046, # Purple
        3: 15844367, # Yellow
        4: 3066993   # Green (Completed)
    }
    color = colors.get(segment, 3447003)
    
    embed = {
        "title": f"Form Progression Update",
        "description": f"User **{name}** has advanced in the registration process.",
        "color": color,
        "fields": [
            {"name": "Current Stage", "value": seg_name, "inline": True},
            {"name": "City", "value": city, "inline": True},
            {"name": "Mobile", "value": mobile, "inline": True},
            {"name": "Email", "value": email, "inline": True}
        ],
        "footer": {
            "text": f"Session: {session.get('id')} | {datetime.now().strftime('%H:%M:%S')}"
        }
    }
    return embed

def trigger_notifications(session):
    settings = load_db(SETTINGS_FILE, default_settings)
    if not settings.get('enable_notifications', True):
        return
        
    tel_token = settings.get('telegram_token')
    tel_chat = settings.get('telegram_chat_id')
    disc_webhook = settings.get('discord_webhook')
    
    # Send Telegram
    if tel_token and tel_chat:
        msg = build_notification_message(session)
        threading.Thread(target=send_telegram_notification, args=(tel_token, tel_chat, msg), daemon=True).start()
        
    # Send Discord
    if disc_webhook:
        embed = build_discord_embed(session)
        threading.Thread(target=send_discord_notification, args=(disc_webhook, embed), daemon=True).start()

# Multithreaded HTTP Request Handler
class FormTrackerHandler(BaseHTTPRequestHandler):
    
    def log_message(self, format, *args):
        # Keep logs clean, custom logs when necessary
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # CORS support
        origin = self.headers.get('Origin', '*')

        # SSE Endpoint for Admin Dashboard
        if path == '/api/admin/stream':
            self.handle_sse(origin)
            return

        # API: Get Sessions
        if path == '/api/admin/sessions':
            self.handle_get_sessions(origin)
            return

        # API: Get Stats
        if path == '/api/admin/stats':
            self.handle_get_stats(origin)
            return

        # API: Get Settings
        if path == '/api/admin/settings':
            self.handle_get_settings(origin)
            return

        # Default static file serving
        self.handle_static_files(path)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        origin = self.headers.get('Origin', '*')

        # Read JSON body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            body = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            self.send_error_response(400, "Invalid JSON data", origin)
            return

        # API: Update Session Progress
        if path == '/api/session/update':
            self.handle_session_update(body, origin)
            return

        # API: Update Settings
        if path == '/api/admin/settings':
            self.handle_settings_update(body, origin)
            return

        # API: Send Test Notification
        if path == '/api/admin/test-notification':
            self.handle_test_notification(body, origin)
            return

        # API: Clear All Sessions
        if path == '/api/admin/clear-sessions':
            self.handle_clear_sessions(origin)
            return

        self.send_error_response(404, "Endpoint not found", origin)

    # SSE Connection Handler
    def handle_sse(self, origin):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', origin)
        self.end_headers()

        q = queue.Queue()
        with clients_lock:
            sse_clients.append(q)

        # Send initial registration status connection ping
        try:
            self.wfile.write(b"data: {\"type\": \"connected\"}\n\n")
            self.wfile.flush()
        except Exception:
            with clients_lock:
                if q in sse_clients:
                    sse_clients.remove(q)
            return

        keep_running = True
        while keep_running:
            try:
                # Block for 20s waiting for events, otherwise send ping to keep connection alive
                event = q.get(timeout=20.0)
                event_data = f"data: {json.dumps(event)}\n\n"
                self.wfile.write(event_data.encode('utf-8'))
                self.wfile.flush()
            except queue.Empty:
                try:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                except Exception:
                    keep_running = False
            except Exception:
                keep_running = False

        with clients_lock:
            if q in sse_clients:
                sse_clients.remove(q)

    # GET: Fetch list of all sessions
    def handle_get_sessions(self, origin):
        sessions = load_db(SESSIONS_FILE, {})
        # Sort sessions by last_updated descending
        sorted_sessions = sorted(
            sessions.values(),
            key=lambda x: x.get('last_updated', ''),
            reverse=True
        )
        self.send_json_response(200, sorted_sessions, origin)

    # GET: Get progress and drop-off stats
    def handle_get_stats(self, origin):
        sessions = load_db(SESSIONS_FILE, {})
        
        total_visits = len(sessions)
        active_fillers = 0
        completed = 0
        
        # Segment counts for the funnel
        segments_count = {1: 0, 2: 0, 3: 0, 4: 0}
        
        now = datetime.now()
        for session in sessions.values():
            seg = session.get('current_segment', 1)
            # Increment counts for funnel (if user is at segment 3, they completed 1 & 2 as well)
            for s in range(1, seg + 1):
                if s in segments_count:
                    segments_count[s] += 1

            if seg == 4:
                completed += 1
            else:
                # Active if updated in the last 15 minutes
                last_up = session.get('last_updated', '')
                try:
                    dt = datetime.fromisoformat(last_up)
                    diff = (now - dt).total_seconds()
                    if diff < 900:  # 15 minutes
                        active_fillers += 1
                except Exception:
                    pass

        stats = {
            "total_visits": total_visits,
            "active_fillers": active_fillers,
            "completed": completed,
            "funnel": segments_count
        }
        self.send_json_response(200, stats, origin)

    # GET: Settings
    def handle_get_settings(self, origin):
        settings = load_db(SETTINGS_FILE, default_settings)
        self.send_json_response(200, settings, origin)

    # POST: Update settings
    def handle_settings_update(self, body, origin):
        settings = load_db(SETTINGS_FILE, default_settings)
        # Update keys
        for key in ['telegram_token', 'telegram_chat_id', 'discord_webhook', 'enable_notifications']:
            if key in body:
                settings[key] = body[key]
        
        if save_db(SETTINGS_FILE, settings):
            self.send_json_response(200, {"success": True, "message": "Settings updated successfully"}, origin)
        else:
            self.send_error_response(500, "Failed to save settings", origin)

    # POST: Send a test notification
    def handle_test_notification(self, body, origin):
        token = body.get('telegram_token')
        chat_id = body.get('telegram_chat_id')
        webhook = body.get('discord_webhook')
        
        threads = []
        if token and chat_id:
            msg = "<b>🔔 Test Notification</b>\nYour registration progress tracker Telegram Integration is configured correctly!"
            threads.append(threading.Thread(target=send_telegram_notification, args=(token, chat_id, msg), daemon=True))
            
        if webhook:
            embed = {
                "title": "Discord Integration Test",
                "description": "Your progress tracker Discord Integration is configured correctly!",
                "color": 3066993
            }
            threads.append(threading.Thread(target=send_discord_notification, args=(webhook, embed), daemon=True))

        for t in threads:
            t.start()
            
        self.send_json_response(200, {"success": True, "message": "Test notifications triggered"}, origin)

    # POST: Update progress of a session
    def handle_session_update(self, body, origin):
        session_id = body.get('sessionId')
        segment = int(body.get('segment', 1))
        fields = body.get('fields', {})
        
        sessions = load_db(SESSIONS_FILE, {})
        now_str = datetime.now().isoformat()
        
        is_new_session = False
        if not session_id or session_id not in sessions:
            session_id = str(uuid.uuid4())
            is_new_session = True
            sessions[session_id] = {
                "id": session_id,
                "current_segment": segment,
                "fields": fields,
                "started_at": now_str,
                "last_updated": now_str
            }
        else:
            session = sessions[session_id]
            prev_segment = session.get('current_segment', 1)
            
            # Update fields iteratively
            for k, v in fields.items():
                session['fields'][k] = v
                
            session['last_updated'] = now_str
            
            # Send notification if segment completes or advances
            if segment > prev_segment:
                session['current_segment'] = segment
                trigger_notifications(session)
            elif segment == 4 and prev_segment < 4:
                session['current_segment'] = 4
                trigger_notifications(session)
        
        save_db(SESSIONS_FILE, sessions)
        
        # Broadcast SSE event to admin panel
        broadcast_event({
            "type": "session_update",
            "session": sessions[session_id],
            "is_new": is_new_session
        })
        
        self.send_json_response(200, {
            "success": True,
            "sessionId": session_id,
            "segment": sessions[session_id]['current_segment']
        }, origin)

    # POST: Clear all sessions
    def handle_clear_sessions(self, origin):
        if save_db(SESSIONS_FILE, {}):
            broadcast_event({
                "type": "clear_sessions"
            })
            self.send_json_response(200, {"success": True, "message": "All session data cleared successfully"}, origin)
        else:
            self.send_error_response(500, "Failed to clear session data", origin)

    # Serving Static Files Handler
    def handle_static_files(self, path):
        # Normalize and map paths
        if path == '/' or path == '':
            path = '/index.html'
        
        # Map paths without extension to .html (like /admin -> /admin.html)
        _, ext = os.path.splitext(path)
        if not ext:
            path += '.html'
            _, ext = os.path.splitext(path)
            
        # Security check: block raw server script or database downloads
        if ext.lower() in ['.py', '.json']:
            self.send_error_response(403, "Forbidden")
            return

        file_path = os.path.join(PUBLIC_DIR, path.lstrip('/'))
        
        # Security check: ensure path is within public folder
        real_public = os.path.realpath(PUBLIC_DIR)
        real_file = os.path.realpath(file_path)
        if not real_file.startswith(real_public):
            self.send_error_response(403, "Forbidden")
            return
            
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            self.send_error_response(404, "File Not Found")
            return
            
        # Determine mime type
        mime_types = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.ico': 'image/x-icon'
        }
        content_type = mime_types.get(ext.lower(), 'application/octet-stream')
        
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error_response(500, f"Internal Server Error: {e}")

    # Standard JSON Response Helpers
    def send_json_response(self, status, data, origin):
        response_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response_bytes)))
        self.send_header('Access-Control-Allow-Origin', origin)
        self.end_headers()
        self.wfile.write(response_bytes)

    def send_error_response(self, status, message, origin='*'):
        self.send_json_response(status, {"success": False, "error": message}, origin)


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def run_server():
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, FormTrackerHandler)
    print(f"Server successfully started on port {PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()


if __name__ == '__main__':
    run_server()
