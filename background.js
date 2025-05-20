let confirmDialogResolve = null;

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('background 收到消息:', request);
  if (request.action === 'startSync') {
    handleSync(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开放
  }
  if (request.action === 'confirmSync') {
    if (confirmDialogResolve) {
      console.log('resolve confirmDialogResolve', request.confirmed);
      confirmDialogResolve(request.confirmed);
      confirmDialogResolve = null;
    } else {
      console.log('confirmDialogResolve 不存在');
    }
    sendResponse({ ok: true });
    return true;
  }
});

// 发送进度更新
function sendProgressUpdate(step, progress, text) {
  chrome.runtime.sendMessage({
    action: 'syncProgress',
    step,
    progress,
    text
  });
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 带重试的操作
async function withRetry(operation, maxRetries = 3, delayMs = 2000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await delay(delayMs);
      }
    }
  }
  
  throw lastError;
}

// 同步处理主函数（支持profile参数）
async function handleSync(request) {
  try {
    const profile = request && request.profile;
    // 1. 导出Edge数据
    sendProgressUpdate(0, 0, '正在导出Edge数据...');
    const edgeData = await withRetry(async () => {
      const data = await exportEdgeData(profile);
      sendProgressUpdate(0, 100, 'Edge数据导出完成');
      return data;
    });
    
    // 2. 显示确认对话框
    sendProgressUpdate(1, 0, '等待用户确认...');
    const confirmed = await showConfirmationDialog();
    console.log('用户确认结果:', confirmed);
    if (!confirmed) {
      return { success: false, error: '用户取消同步' };
    }
    sendProgressUpdate(1, 100, '用户已确认');

    // 3. 清空当前浏览器数据
    sendProgressUpdate(2, 0, '正在清空当前浏览器数据...');
    await withRetry(async () => {
      await clearCurrentBrowserData();
      sendProgressUpdate(2, 100, '数据清空完成');
    });

    // 4. 导入数据到当前浏览器
    sendProgressUpdate(3, 0, '正在导入数据...');
    await withRetry(async () => {
      await importDataToCurrentBrowser(edgeData);
      sendProgressUpdate(3, 100, '数据导入完成');
    });

    return { success: true };
  } catch (error) {
    console.error('同步过程出错:', error);
    return { success: false, error: error.message };
  }
}

// 导出Edge数据（支持profile参数）
async function exportEdgeData(profile) {
  try {
    const response = await fetch('http://localhost:3000/export-edge-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ profile })
    });

    if (!response.ok) {
      throw new Error('导出Edge数据失败');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '导出失败');
    }

    return result.data;
  } catch (error) {
    console.error('导出数据失败:', error);
    throw new Error('无法连接到本地同步服务，请确保服务已启动');
  }
}

// 显示确认对话框
async function showConfirmationDialog() {
  return new Promise((resolve) => {
    console.log('showConfirmationDialog: 等待用户确认');
    confirmDialogResolve = resolve;
    chrome.windows.create({
      url: 'confirm.html',
      type: 'popup',
      width: 400,
      height: 300
    });
  });
}

// 清空当前浏览器数据
async function clearCurrentBrowserData() {
  try {
    // 获取所有根节点（如"书签栏"、"其他书签"）
    const bookmarkTree = await chrome.bookmarks.getTree();
    const rootNodes = bookmarkTree[0].children || [];
    for (const root of rootNodes) {
      if (root.children) {
        for (const child of root.children) {
          await chrome.bookmarks.removeTree(child.id);
        }
      }
    }
    // 暂不操作密码
  } catch (error) {
    console.error('清空数据失败:', error);
    throw new Error('清空浏览器数据失败，请重试');
  }
}

// 递归导入书签树结构
async function importBookmarksTree(nodes, parentId) {
  for (const node of nodes) {
    if (node.type === 'folder') {
      const folder = await chrome.bookmarks.create({
        parentId,
        title: node.title
      });
      if (node.children && node.children.length > 0) {
        await importBookmarksTree(node.children, folder.id);
      }
    } else if (node.type === 'url') {
      await chrome.bookmarks.create({
        parentId,
        title: node.title,
        url: node.url
      });
    }
  }
}

// 导入数据到当前浏览器
async function importDataToCurrentBrowser(data) {
  try {
    // 递归导入所有根节点下的书签树，保留结构
    for (const root of data.bookmarks) {
      // 1 是"书签栏"，2 是"其他书签"，3 是"移动设备书签"
      // 可根据 root.title 或 root.id 决定导入到哪个根目录
      // 这里默认全部导入到"书签栏"（id: '1'）
      await importBookmarksTree(root.children || [], '1');
    }
    // 暂不导入密码
  } catch (error) {
    console.error('导入数据失败:', error);
    throw new Error('导入数据失败，请重试');
  }
}

// 检查本地服务是否可用
async function checkServerStatus() {
  try {
    const response = await fetch('http://localhost:3000/edge-accounts');
    return response.ok;
  } catch (error) {
    return false;
  }
}

// 定期检查服务状态
setInterval(async () => {
  const isServerRunning = await checkServerStatus();
  if (!isServerRunning) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}, 5000); 