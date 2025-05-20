const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const CryptoJS = require('crypto-js');
const { exec } = require('child_process');

const app = express();
const port = 3000;

// 启用 CORS
app.use(cors());
app.use(express.json());

// 启动服务的函数
function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, 'server.js');
    exec(`node ${serverPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`启动服务失败: ${error}`);
        reject(error);
        return;
      }
      console.log(`服务启动成功: ${stdout}`);
      resolve();
    });
  });
}

// 启动服务的接口
app.post('/start-server', async (req, res) => {
  try {
    await startServer();
    res.json({ success: true, message: '服务启动成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取 Edge 根目录
function getEdgeDataPath() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (process.platform === 'darwin') {
    return path.join(home, 'Library/Application Support/Microsoft Edge');
  } else if (process.platform === 'win32') {
    return path.join(home, 'AppData/Local/Microsoft/Edge/User Data');
  } else if (process.platform === 'linux') {
    return path.join(home, '.config/microsoft-edge');
  }
  return '';
}

// 获取所有 Edge Profile 目录
function getAllEdgeProfiles() {
  const home = process.env.HOME || process.env.USERPROFILE;
  let edgeBase = '';
  if (process.platform === 'darwin') {
    edgeBase = path.join(home, 'Library/Application Support/Microsoft Edge');
  } else if (process.platform === 'win32') {
    edgeBase = path.join(home, 'AppData/Local/Microsoft/Edge/User Data');
  } else if (process.platform === 'linux') {
    edgeBase = path.join(home, '.config/microsoft-edge');
  }
  const profiles = [];
  if (fs.existsSync(edgeBase)) {
    fs.readdirSync(edgeBase).forEach(dir => {
      if (dir === 'Default' || dir.startsWith('Profile ')) {
        profiles.push(dir);
      }
    });
  }
  return profiles;
}

// 获取所有 Edge Profile 列表
app.get('/edge-profiles', (req, res) => {
  const profiles = getAllEdgeProfiles();
  res.json({ success: true, profiles });
});

// 获取所有 Edge 账号（直接返回默认）
app.get('/edge-accounts', async (req, res) => {
  res.json({
    success: true,
    accounts: [
      { id: 'default', email: 'edge@local', name: 'Edge默认账号' }
    ]
  });
});

// 递归导出完整书签树结构
function extractBookmarksTree(node) {
  const result = {
    id: node.id,
    type: node.type,
    title: node.name,
    url: node.url,
    dateAdded: node.date_added,
    children: []
  };
  if (node.children) {
    result.children = node.children.map(extractBookmarksTree);
  }
  return result;
}

// 导出Edge数据（支持profile参数）
app.post('/export-edge-data', async (req, res) => {
  try {
    const { profile } = req.body;
    const edgePath = getEdgeDataPath();
    if (!fs.existsSync(edgePath)) {
      return res.json({ success: false, error: '未找到Edge数据目录' });
    }
    const profileDir = profile || 'Default';
    // 读取书签
    const bookmarksPath = path.join(edgePath, profileDir, 'Bookmarks');
    let bookmarks = [];
    if (fs.existsSync(bookmarksPath)) {
      const bookmarksRaw = fs.readFileSync(bookmarksPath, 'utf-8');
      const bookmarksJson = JSON.parse(bookmarksRaw);
      if (bookmarksJson.roots) {
        for (const key in bookmarksJson.roots) {
          const root = bookmarksJson.roots[key];
          bookmarks.push(extractBookmarksTree(root));
        }
      }
    }

    // 读取密码
    const loginDataPath = path.join(edgePath, profileDir, 'Login Data');
    let credentials = [];
    if (fs.existsSync(loginDataPath)) {
      // 复制数据库，避免被 Edge 占用
      const tempDbPath = path.join(__dirname, 'tmp_login_data');
      fs.copyFileSync(loginDataPath, tempDbPath);
      const db = new Database(tempDbPath, { readonly: true });
      try {
        const rows = db.prepare('SELECT origin_url, username_value, password_value FROM logins').all();
        // 解密密码
        credentials = rows.map(row => ({
          url: row.origin_url,
          username: row.username_value,
          password: decryptPassword(row.password_value)
        }));
      } finally {
        db.close();
        fs.unlinkSync(tempDbPath);
      }
    }

    res.json({
      success: true,
      data: {
        bookmarks,
        credentials
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 解密密码
function decryptPassword(encryptedPassword) {
  // 注意：实际解密需要从 Edge 的 Local State 中获取加密密钥
  // 这里仅作示例，实际实现需要更复杂的解密逻辑
  return '******'; // 返回加密后的密码
}

// 启动服务器
app.listen(port, () => {
  console.log(`Edge同步服务已启动，监听端口 ${port}`);
}); 