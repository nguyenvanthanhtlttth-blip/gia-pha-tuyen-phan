const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'data', 'giapha-db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error('Error reading Gia Pha DB:', err);
    return { familyInfo: {}, accounts: [], members: [], activities: [] };
  }
}

function writeDB(data) {
  data.familyInfo = data.familyInfo || {};
  data.familyInfo.updatedAt = new Date().toISOString();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function verifyAccount(db, auth) {
  if (!auth || !auth.username || !auth.password) return null;
  return (db.accounts || []).find(
    a => a.username.toLowerCase() === String(auth.username).toLowerCase() && a.password === String(auth.password)
  );
}

function canEditBranch(account, targetBranchId) {
  if (!account) return false;
  if (account.role === 'admin' || account.branchId === 'all') return true;
  return account.branchId === targetBranchId;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname.startsWith('/api/')) {
    try {
      const db = readDB();

      // GET /api/giapha — Public read of family tree & activities + safe account list
      if (pathname === '/api/giapha' && method === 'GET') {
        const safeAccounts = (db.accounts || []).map(a => ({
          username: a.username,
          displayName: a.displayName,
          branchId: a.branchId,
          role: a.role,
          desc: a.desc
        }));
        return sendJSON(res, 200, {
          familyInfo: db.familyInfo,
          accounts: safeAccounts,
          members: db.members || [],
          activities: db.activities || []
        });
      }

      // POST /api/login — Verify branch account
      if (pathname === '/api/login' && method === 'POST') {
        const body = await parseBody(req);
        const acc = verifyAccount(db, body);
        if (!acc) {
          return sendJSON(res, 401, { error: 'Sai tên tài khoản hoặc mật khẩu.' });
        }
        return sendJSON(res, 200, {
          account: {
            username: acc.username,
            displayName: acc.displayName,
            branchId: acc.branchId,
            role: acc.role,
            desc: acc.desc
          }
        });
      }

      // POST /api/change-password — Update branch password
      if (pathname === '/api/change-password' && method === 'POST') {
        const body = await parseBody(req);
        const acc = verifyAccount(db, body.auth);
        if (!acc) {
          return sendJSON(res, 401, { error: 'Mật khẩu hiện tại không đúng.' });
        }
        if (!body.newPassword || String(body.newPassword).trim().length < 4) {
          return sendJSON(res, 400, { error: 'Mật khẩu mới phải từ 4 ký tự trở lên.' });
        }
        acc.password = String(body.newPassword).trim();
        writeDB(db);
        return sendJSON(res, 200, { success: true });
      }

      // POST /api/members — Add a new child/member to the family tree
      if (pathname === '/api/members' && method === 'POST') {
        const body = await parseBody(req);
        const acc = verifyAccount(db, body.auth);
        if (!acc) {
          return sendJSON(res, 401, { error: 'Vui lòng đăng nhập tài khoản nhánh để thêm thành viên.' });
        }

        const parent = (db.members || []).find(m => m.id === body.parentId);
        if (!parent) {
          return sendJSON(res, 400, { error: 'Không tìm thấy cha/mẹ trong gia phả.' });
        }

        const targetBranchId = parent.branchId === 'root' ? (body.branchId || acc.branchId) : parent.branchId;
        if (!canEditBranch(acc, targetBranchId)) {
          return sendJSON(res, 403, {
            error: `Tài khoản "${acc.displayName}" chỉ có quyền thêm thành viên thuộc nhánh của mình.`
          });
        }

        const siblings = (db.members || []).filter(m => m.parentId === parent.id);
        const newMember = {
          id: 'mem-' + Date.now().toString().slice(-6),
          fullName: (body.fullName || '').trim(),
          gender: body.gender || 'Nam',
          roleTitle: (body.roleTitle || 'Con / Cháu trong gia tộc').trim(),
          avatarUrl: (body.avatarUrl || '').trim(),
          spouseName: (body.spouseName || '').trim(),
          spouseRoleTitle: (body.spouseRoleTitle || (body.gender === 'Nam' ? 'Vợ / Dâu' : 'Chồng / Rể')).trim(),
          spouseBirthYear: (body.spouseBirthYear || '').trim(),
          spouseAvatarUrl: (body.spouseAvatarUrl || '').trim(),
          birthYear: (body.birthYear || '').trim(),
          hometown: (body.hometown || parent.hometown || '').trim(),
          status: body.status || 'Còn sống',
          generation: Number(parent.generation || 1) + 1,
          parentId: parent.id,
          branchId: targetBranchId,
          branchName: parent.branchId === 'root' ? (body.branchName || parent.branchName) : parent.branchName,
          orderInFamily: Number(body.orderInFamily || siblings.length + 1),
          bio: (body.bio || '').trim(),
          phone: (body.phone || '').trim(),
          address: (body.address || '').trim()
        };

        db.members.push(newMember);
        writeDB(db);
        return sendJSON(res, 201, { member: newMember });
      }

      // PUT /api/members/:id — Update existing member or spouse info
      if (pathname.startsWith('/api/members/') && method === 'PUT') {
        const id = pathname.split('/')[3];
        const body = await parseBody(req);
        const acc = verifyAccount(db, body.auth);
        if (!acc) {
          return sendJSON(res, 401, { error: 'Vui lòng đăng nhập để chỉnh sửa thông tin.' });
        }

        const idx = (db.members || []).findIndex(m => m.id === id);
        if (idx === -1) {
          return sendJSON(res, 404, { error: 'Không tìm thấy thành viên.' });
        }

        const member = db.members[idx];
        if (!canEditBranch(acc, member.branchId)) {
          return sendJSON(res, 403, {
            error: `Tài khoản "${acc.displayName}" chỉ được chỉnh sửa thành viên thuộc nhánh của mình.`
          });
        }

        db.members[idx] = {
          ...member,
          fullName: body.fullName !== undefined ? body.fullName.trim() : member.fullName,
          gender: body.gender !== undefined ? body.gender : member.gender,
          roleTitle: body.roleTitle !== undefined ? body.roleTitle.trim() : member.roleTitle,
          avatarUrl: body.avatarUrl !== undefined ? body.avatarUrl.trim() : (member.avatarUrl || ''),
          spouseName: body.spouseName !== undefined ? body.spouseName.trim() : member.spouseName,
          spouseRoleTitle: body.spouseRoleTitle !== undefined ? body.spouseRoleTitle.trim() : member.spouseRoleTitle,
          spouseBirthYear: body.spouseBirthYear !== undefined ? body.spouseBirthYear.trim() : member.spouseBirthYear,
          spouseAvatarUrl: body.spouseAvatarUrl !== undefined ? body.spouseAvatarUrl.trim() : (member.spouseAvatarUrl || ''),
          birthYear: body.birthYear !== undefined ? body.birthYear.trim() : member.birthYear,
          hometown: body.hometown !== undefined ? body.hometown.trim() : (member.hometown || ''),
          status: body.status !== undefined ? body.status : member.status,
          orderInFamily: body.orderInFamily !== undefined ? Number(body.orderInFamily) : member.orderInFamily,
          bio: body.bio !== undefined ? body.bio.trim() : member.bio,
          phone: body.phone !== undefined ? body.phone.trim() : member.phone,
          address: body.address !== undefined ? body.address.trim() : member.address
        };

        writeDB(db);
        return sendJSON(res, 200, { member: db.members[idx] });
      }

      // DELETE /api/members/:id
      if (pathname.startsWith('/api/members/') && method === 'DELETE') {
        const id = pathname.split('/')[3];
        const body = await parseBody(req);
        const acc = verifyAccount(db, body.auth);
        if (!acc) {
          return sendJSON(res, 401, { error: 'Vui lòng đăng nhập để xóa thành viên.' });
        }
        if (id === 'mem-root') {
          return sendJSON(res, 400, { error: 'Không thể xóa nút Cội nguồn Ông Bà Tuyến - Phấn.' });
        }
        const member = (db.members || []).find(m => m.id === id);
        if (!member) {
          return sendJSON(res, 404, { error: 'Không tìm thấy thành viên.' });
        }
        if (!canEditBranch(acc, member.branchId)) {
          return sendJSON(res, 403, { error: 'Bạn chỉ được xóa thành viên trong nhánh của mình.' });
        }
        const hasChildren = (db.members || []).some(m => m.parentId === id);
        if (hasChildren) {
          return sendJSON(res, 400, { error: 'Thành viên này đang có con cháu bên dưới, vui lòng xóa cấp dưới trước.' });
        }
        db.members = db.members.filter(m => m.id !== id);
        writeDB(db);
        return sendJSON(res, 200, { success: true });
      }

      // POST /api/activities — Post a new family activity / memory
      if (pathname === '/api/activities' && method === 'POST') {
        const body = await parseBody(req);
        const acc = verifyAccount(db, body.auth);
        if (!acc) {
          return sendJSON(res, 401, { error: 'Vui lòng đăng nhập tài khoản gia đình để đăng hoạt động.' });
        }
        if (!body.title || !body.content) {
          return sendJSON(res, 400, { error: 'Vui lòng nhập tiêu đề và nội dung hoạt động.' });
        }

        const newAct = {
          id: 'act-' + Date.now().toString().slice(-6),
          title: body.title.trim(),
          category: body.category || 'Tin vui gia đình',
          eventDate: body.eventDate || new Date().toISOString().slice(0, 10),
          authorName: body.authorName || acc.displayName,
          branchId: acc.branchId,
          content: body.content.trim(),
          imageUrl: (body.imageUrl || '').trim(),
          createdAt: new Date().toISOString()
        };

        db.activities = db.activities || [];
        db.activities.unshift(newAct);
        writeDB(db);
        return sendJSON(res, 201, { activity: newAct });
      }

      // DELETE /api/activities/:id
      if (pathname.startsWith('/api/activities/') && method === 'DELETE') {
        const id = pathname.split('/')[3];
        const body = await parseBody(req);
        const acc = verifyAccount(db, body.auth);
        if (!acc) {
          return sendJSON(res, 401, { error: 'Vui lòng đăng nhập.' });
        }
        const act = (db.activities || []).find(a => a.id === id);
        if (!act) return sendJSON(res, 404, { error: 'Không tìm thấy bài đăng.' });
        if (!canEditBranch(acc, act.branchId)) {
          return sendJSON(res, 403, { error: 'Chỉ người đăng hoặc Quản trị gia tộc mới được xóa bài này.' });
        }
        db.activities = db.activities.filter(a => a.id !== id);
        writeDB(db);
        return sendJSON(res, 200, { success: true });
      }

      // POST /api/restore — Restore full backup JSON (Admin only)
      if (pathname === '/api/restore' && method === 'POST') {
        const body = await parseBody(req);
        const acc = verifyAccount(db, body.auth);
        if (!acc || acc.role !== 'admin') {
          return sendJSON(res, 403, { error: 'Chỉ tài khoản Quản Trị Gia Tộc (admin) mới được khôi phục bản sao lưu.' });
        }
        if (!body.backup || !Array.isArray(body.backup.members)) {
          return sendJSON(res, 400, { error: 'File sao lưu không hợp lệ.' });
        }
        db.members = body.backup.members;
        if (Array.isArray(body.backup.activities)) {
          db.activities = body.backup.activities;
        }
        writeDB(db);
        return sendJSON(res, 200, { success: true });
      }

      return sendJSON(res, 404, { error: 'Endpoint không tồn tại.' });
    } catch (err) {
      console.error(err);
      return sendJSON(res, 500, { error: 'Lỗi hệ thống: ' + err.message });
    }
  }

  // Static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 - Không tìm thấy trang');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('==============================================================');
  console.log(' 🌳 GIA PHẢ ĐẠI GIA ĐÌNH TUYẾN - PHẤN (TRỌN ĐỜI)');
  console.log(` 🌐 Địa chỉ truy cập : http://localhost:${PORT}`);
  console.log(` 💾 File lưu trữ gốc : ${DB_PATH}`);
  console.log('==============================================================');
});
