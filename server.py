#!/usr/bin/env python3
"""
Nawaqss Wishlist & Waitlist Server (Production-Ready)
Lightweight, zero-dependency Python HTTP server.
Serves static landing page, admin portal, and securely appends leads to CSV and JSON.
"""

import os
import sys
import json
import csv
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Auto-load .env file if present (zero external dependencies)
env_file = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_file):
    try:
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k not in os.environ:
                        os.environ[k] = v
    except Exception as e:
        print(f"[Warning] Could not load .env: {e}")

PORT = int(os.environ.get("PORT", 8080))
ADMIN_KEY = os.environ.get("ADMIN_SECRET_KEY", "").strip()

CSV_FILE = os.path.join(BASE_DIR, "wishlist_leads.csv")
JSON_FILE = os.path.join(BASE_DIR, "wishlist_leads.json")

CSV_HEADERS = [
    "كود الطلب",
    "تاريخ التسجيل (UTC)",
    "الصفة",
    "الاسم بالكامل",
    "رقم الموبايل",
    "البريد الإلكتروني",
    "المحافظة",
    "المدينة أو المنطقة",
    "طريقة التواصل المفضلة",
    "ملاحظات إضافية",
    "IP العميل"
]

def init_storage():
    """Ensure CSV and JSON storage files exist with proper headers."""
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, mode="w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(CSV_HEADERS)
        print(f"[Storage] Created fresh CSV storage: {CSV_FILE}")

    if not os.path.exists(JSON_FILE):
        with open(JSON_FILE, mode="w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)
        print(f"[Storage] Created fresh JSON storage: {JSON_FILE}")

def append_lead(lead_data, client_ip):
    """Append a lead atomically to both CSV and JSON."""
    ref_id = lead_data.get("id") or f"NWQ-WL-{datetime.utcnow().strftime('%y%m%d%H%M%S')}"
    created_at = lead_data.get("createdAt") or datetime.utcnow().isoformat()
    role = lead_data.get("role", "مريض")
    full_name = lead_data.get("fullName", "").strip()
    phone = lead_data.get("phone", "").strip()
    email = lead_data.get("email", "").strip()
    gov = lead_data.get("governorate", "").strip()
    city = lead_data.get("cityArea", "").strip()
    contact_pref = lead_data.get("contactPreference", "whatsapp")
    notes = lead_data.get("notes", "").strip()

    row = [
        ref_id,
        created_at,
        role,
        full_name,
        phone,
        email,
        gov,
        city,
        contact_pref,
        notes,
        client_ip
    ]

    # 1. Append to CSV (UTF-8 with BOM for Excel compatibility)
    with open(CSV_FILE, mode="a", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(row)

    # 2. Append to JSON
    json_entries = []
    try:
        with open(JSON_FILE, mode="r", encoding="utf-8") as f:
            json_entries = json.load(f)
    except Exception:
        json_entries = []

    json_record = {
        "id": ref_id,
        "createdAt": created_at,
        "role": role,
        "fullName": full_name,
        "phone": phone,
        "email": email,
        "governorate": gov,
        "cityArea": city,
        "contactPreference": contact_pref,
        "notes": notes,
        "clientIp": client_ip
    }
    json_entries.append(json_record)

    with open(JSON_FILE, mode="w", encoding="utf-8") as f:
        json.dump(json_entries, f, ensure_ascii=False, indent=2)

    return json_record

class NawaqssWishlistHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        pathname = parsed.path

        if pathname == "/api/wishlist":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")

            try:
                data = json.loads(body)
            except Exception:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Invalid JSON payload"}).encode("utf-8"))
                return

            client_ip = self.headers.get("X-Forwarded-For") or self.client_address[0]
            if "," in client_ip:
                client_ip = client_ip.split(",")[0].strip()

            saved = append_lead(data, client_ip)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            response = {
                "success": True,
                "message": "تم تسجيل بياناتك بنجاح في قائمة الوصول المبكر لمنصة Nawaqss",
                "lead": saved
            }
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode("utf-8"))
            print(f"[Lead] {saved['role']}: {saved['fullName']} ({saved['phone']}) - {saved['governorate']}")
            return

        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        pathname = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Route alias for /admin -> admin.html
        if pathname in ("/admin", "/admin/"):
            self.send_response(302)
            self.send_header("Location", "/admin.html")
            self.end_headers()
            return

        # ── Protected Admin CSV Export ──
        if pathname in ("/api/admin/export", "/api/wishlist/export"):
            req_key = query.get("key", [""])[0].strip()
            if not ADMIN_KEY or req_key != ADMIN_KEY:
                self.send_response(401)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                err = {"error": "غير مصرح: مفتاح الإدارة غير صحيح أو مفقود. استخدم ?key=YOUR_KEY"}
                self.wfile.write(json.dumps(err, ensure_ascii=False).encode("utf-8"))
                return

            init_storage()
            with open(CSV_FILE, mode="rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="nawaqss_wishlist_leads.csv"')
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(content)
            return

        # ── Protected Admin Leads Data API ──
        if pathname == "/api/admin/leads":
            req_key = query.get("key", [""])[0].strip()
            if not ADMIN_KEY or req_key != ADMIN_KEY:
                self.send_response(401)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                err = {"error": "المفتاح السري غير صحيح"}
                self.wfile.write(json.dumps(err, ensure_ascii=False).encode("utf-8"))
                return

            records = []
            if os.path.exists(JSON_FILE):
                try:
                    with open(JSON_FILE, mode="r", encoding="utf-8") as f:
                        records = json.load(f)
                except Exception:
                    records = []

            # Return newest first
            records_reversed = list(reversed(records))
            total = len(records)
            patients = sum(1 for r in records if r.get("role") == "مريض")
            pharmacies = sum(1 for r in records if r.get("role") == "صيدلية")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            data = {
                "success": True,
                "total": total,
                "patients": patients,
                "pharmacies": pharmacies,
                "leads": records_reversed
            }
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return

        # ── Public Safe Stats ──
        if pathname == "/api/wishlist/stats":
            total = 0
            if os.path.exists(JSON_FILE):
                try:
                    with open(JSON_FILE, mode="r", encoding="utf-8") as f:
                        total = len(json.load(f))
                except Exception:
                    pass

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"totalLeads": total}, ensure_ascii=False).encode("utf-8"))
            return

        # Standard static file serving
        super().do_GET()

def run():
    init_storage()
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, NawaqssWishlistHandler)
    print("=" * 65)
    print(f"✨ Nawaqss Wishlist Production Server is running on port: {PORT}")
    print(f"🌐 Public Landing Page:  http://localhost:{PORT}/")
    print(f"🔐 Protected Admin:       http://localhost:{PORT}/admin.html")
    print(f"🔑 Admin Key configured:  {'yes' if ADMIN_KEY else 'NO - set ADMIN_SECRET_KEY'}")
    print(f"📁 Leads CSV:            {CSV_FILE}")
    print(f"📁 Leads JSON:           {JSON_FILE}")
    print("=" * 65)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Server] Shutting down gracefully.")
        httpd.server_close()

if __name__ == "__main__":
    run()
