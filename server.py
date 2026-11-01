import http.server
import json
import os
import time
import urllib.parse
from datetime import datetime, timezone

PORT = int(os.environ.get("PORT", 3001))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "giapha-db.json")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")


def read_db():
    try:
        with open(DB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print("Error reading DB:", e)
        return {"familyInfo": {}, "accounts": [], "members": [], "activities": []}


def write_db(data):
    data.setdefault("familyInfo", {})["updatedAt"] = datetime.now(timezone.utc).isoformat()
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def verify_account(db, auth):
    if not auth or not auth.get("username") or not auth.get("password"):
        return None
    u = str(auth["username"]).lower()
    p = str(auth["password"])
    for acc in db.get("accounts", []):
        if acc.get("username", "").lower() == u and acc.get("password") == p:
            return acc
    return None


def can_edit_branch(acc, target_branch_id):
    if not acc:
        return False
    if acc.get("role") == "admin" or acc.get("branchId") == "all":
        return True
    return acc.get("branchId") == target_branch_id


class GiaPhaHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/giapha":
            db = read_db()
            safe_accounts = [
                {
                    "username": a["username"],
                    "displayName": a["displayName"],
                    "branchId": a["branchId"],
                    "role": a["role"],
                    "desc": a.get("desc", ""),
                }
                for a in db.get("accounts", [])
            ]
            return self._send_json(
                200,
                {
                    "familyInfo": db.get("familyInfo", {}),
                    "accounts": safe_accounts,
                    "members": db.get("members", []),
                    "activities": db.get("activities", []),
                },
            )
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        db = read_db()
        body = self._read_body()

        if parsed.path == "/api/login":
            acc = verify_account(db, body)
            if not acc:
                return self._send_json(401, {"error": "Sai tên tài khoản hoặc mật khẩu."})
            return self._send_json(
                200,
                {
                    "account": {
                        "username": acc["username"],
                        "displayName": acc["displayName"],
                        "branchId": acc["branchId"],
                        "role": acc["role"],
                        "desc": acc.get("desc", ""),
                    }
                },
            )

        if parsed.path == "/api/change-password":
            acc = verify_account(db, body.get("auth"))
            if not acc:
                return self._send_json(401, {"error": "Mật khẩu hiện tại không đúng."})
            new_pw = str(body.get("newPassword", "")).strip()
            if len(new_pw) < 4:
                return self._send_json(400, {"error": "Mật khẩu mới phải từ 4 ký tự trở lên."})
            acc["password"] = new_pw
            write_db(db)
            return self._send_json(200, {"success": True})

        if parsed.path == "/api/members":
            acc = verify_account(db, body.get("auth"))
            if not acc:
                return self._send_json(401, {"error": "Vui lòng đăng nhập tài khoản nhánh để thêm thành viên."})
            parent = next((m for m in db.get("members", []) if m["id"] == body.get("parentId")), None)
            if not parent:
                return self._send_json(400, {"error": "Không tìm thấy cha/mẹ trong gia phả."})
            target_branch = (body.get("branchId") or acc["branchId"]) if parent["branchId"] == "root" else parent["branchId"]
            if not can_edit_branch(acc, target_branch):
                return self._send_json(403, {"error": f"Tài khoản '{acc['displayName']}' chỉ có quyền thêm thành viên thuộc nhánh của mình."})

            siblings = [m for m in db.get("members", []) if m.get("parentId") == parent["id"]]
            new_mem = {
                "id": f"mem-{str(int(time.time() * 1000))[-6:]}",
                "fullName": str(body.get("fullName", "")).strip(),
                "gender": body.get("gender", "Nam"),
                "roleTitle": str(body.get("roleTitle", "Con / Cháu trong gia tộc")).strip(),
                "avatarUrl": str(body.get("avatarUrl", "")).strip(),
                "spouseName": str(body.get("spouseName", "")).strip(),
                "spouseRoleTitle": str(body.get("spouseRoleTitle", "Vợ / Dâu" if body.get("gender") == "Nam" else "Chồng / Rể")).strip(),
                "spouseBirthYear": str(body.get("spouseBirthYear", "")).strip(),
                "spouseAvatarUrl": str(body.get("spouseAvatarUrl", "")).strip(),
                "birthYear": str(body.get("birthYear", "")).strip(),
                "hometown": str(body.get("hometown") or parent.get("hometown", "")).strip(),
                "status": body.get("status", "Còn sống"),
                "generation": int(parent.get("generation", 1)) + 1,
                "parentId": parent["id"],
                "branchId": target_branch,
                "branchName": parent["branchName"],
                "orderInFamily": int(body.get("orderInFamily") or (len(siblings) + 1)),
                "bio": str(body.get("bio", "")).strip(),
                "phone": str(body.get("phone", "")).strip(),
                "address": str(body.get("address", "")).strip(),
            }
            db.setdefault("members", []).append(new_mem)
            write_db(db)
            return self._send_json(201, {"member": new_mem})

        if parsed.path == "/api/activities":
            acc = verify_account(db, body.get("auth"))
            if not acc:
                return self._send_json(401, {"error": "Vui lòng đăng nhập tài khoản gia đình để đăng hoạt động."})
            new_act = {
                "id": f"act-{str(int(time.time() * 1000))[-6:]}",
                "title": str(body.get("title", "")).strip(),
                "category": body.get("category", "Tin vui gia đình"),
                "eventDate": body.get("eventDate") or datetime.now().strftime("%Y-%m-%d"),
                "authorName": body.get("authorName") or acc["displayName"],
                "branchId": acc["branchId"],
                "content": str(body.get("content", "")).strip(),
                "imageUrl": str(body.get("imageUrl", "")).strip(),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }
            db.setdefault("activities", []).insert(0, new_act)
            write_db(db)
            return self._send_json(201, {"activity": new_act})

        if parsed.path == "/api/restore":
            acc = verify_account(db, body.get("auth"))
            if not acc or acc.get("role") != "admin":
                return self._send_json(403, {"error": "Chỉ tài khoản Quản Trị Gia Tộc mới được khôi phục sao lưu."})
            backup = body.get("backup", {})
            if isinstance(backup.get("members"), list):
                db["members"] = backup["members"]
            if isinstance(backup.get("activities"), list):
                db["activities"] = backup["activities"]
            write_db(db)
            return self._send_json(200, {"success": True})

        return self._send_json(404, {"error": "Endpoint không tồn tại."})

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/members/"):
            mem_id = parsed.path.split("/")[3]
            db = read_db()
            body = self._read_body()
            acc = verify_account(db, body.get("auth"))
            if not acc:
                return self._send_json(401, {"error": "Vui lòng đăng nhập."})
            for idx, m in enumerate(db.get("members", [])):
                if m["id"] == mem_id:
                    if not can_edit_branch(acc, m["branchId"]):
                        return self._send_json(403, {"error": "Chỉ được sửa thành viên trong nhánh của mình."})
                    for field in ["fullName", "gender", "roleTitle", "avatarUrl", "spouseName", "spouseRoleTitle", "spouseBirthYear", "spouseAvatarUrl", "birthYear", "hometown", "status", "bio", "phone", "address"]:
                        if field in body:
                            m[field] = str(body[field]).strip()
                    if "orderInFamily" in body:
                        m["orderInFamily"] = int(body["orderInFamily"])
                    db["members"][idx] = m
                    write_db(db)
                    return self._send_json(200, {"member": m})
            return self._send_json(404, {"error": "Không tìm thấy thành viên."})
        return self._send_json(404, {"error": "Endpoint không tồn tại."})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        db = read_db()
        body = self._read_body()
        acc = verify_account(db, body.get("auth"))
        if not acc:
            return self._send_json(401, {"error": "Vui lòng đăng nhập."})

        if parsed.path.startswith("/api/members/"):
            mem_id = parsed.path.split("/")[3]
            if mem_id == "mem-root":
                return self._send_json(400, {"error": "Không thể xóa Cội nguồn Ông Bà Tuyến - Phấn."})
            mem = next((m for m in db.get("members", []) if m["id"] == mem_id), None)
            if not mem:
                return self._send_json(404, {"error": "Không tìm thấy thành viên."})
            if not can_edit_branch(acc, mem["branchId"]):
                return self._send_json(403, {"error": "Bạn chỉ được xóa thành viên thuộc nhánh của mình."})
            if any(m.get("parentId") == mem_id for m in db.get("members", [])):
                return self._send_json(400, {"error": "Thành viên này đang có con cháu bên dưới, vui lòng xóa cấp dưới trước."})
            db["members"] = [m for m in db.get("members", []) if m["id"] != mem_id]
            write_db(db)
            return self._send_json(200, {"success": True})

        if parsed.path.startswith("/api/activities/"):
            act_id = parsed.path.split("/")[3]
            act = next((a for a in db.get("activities", []) if a["id"] == act_id), None)
            if not act:
                return self._send_json(404, {"error": "Không tìm thấy hoạt động."})
            if not can_edit_branch(acc, act["branchId"]):
                return self._send_json(403, {"error": "Không có quyền xóa hoạt động này."})
            db["activities"] = [a for a in db.get("activities", []) if a["id"] != act_id]
            write_db(db)
            return self._send_json(200, {"success": True})

        return self._send_json(404, {"error": "Endpoint không tồn tại."})


if __name__ == "__main__":
    print("==============================================================")
    print(" 🌳 GIA PHẢ ĐẠI GIA ĐÌNH TUYẾN - PHẤN (PYTHON SERVER)")
    print(f" 🌐 Địa chỉ truy cập : http://localhost:{PORT}")
    print(f" 💾 File lưu trữ gốc : {DB_PATH}")
    print("==============================================================")
    with http.server.ThreadingHTTPServer(("", PORT), GiaPhaHandler) as httpd:
        httpd.serve_forever()
