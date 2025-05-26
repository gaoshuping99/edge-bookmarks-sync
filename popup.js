// 初始化UI元素
document.addEventListener('DOMContentLoaded', async () => {
  const profileSelect = document.getElementById('profileSelect');
  const startSyncButton = document.getElementById('startSync');
  const startServerButton = document.getElementById('startServer');
  const serverStatusDiv = document.getElementById('serverStatus');
  const statusDiv = document.getElementById('status');
  const warningDiv = document.getElementById('warning');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  let selectedProfile = '';
  let isServerRunning = false;

  // 最大重试次数
  const MAX_RETRIES = 3;
  // 重试延迟（毫秒）
  const RETRY_DELAY = 2000;

  // 加载Edge所有Profile
  async function loadProfiles() {
    try {
      // 获取保存的Profile
      const savedProfile = await chrome.storage.local.get('lastSelectedProfile');
      const lastProfile = savedProfile.lastSelectedProfile || 'Default';

      const response = await fetch('http://localhost:3000/edge-profiles');
      const data = await response.json();
      if (data.success) {
        data.profiles.forEach(profile => {
          const option = document.createElement('option');
          option.value = profile;
          option.textContent = profile;
          if (profile === lastProfile) {
            option.selected = true;
            selectedProfile = profile; // 设置初始选中的Profile
          }
          profileSelect.appendChild(option);
        });
      } else {
        profileSelect.innerHTML = '<option value="">无可用Profile</option>';
        selectedProfile = '';
      }
    } catch (e) {
      profileSelect.innerHTML = '<option value="">加载失败</option>';
      selectedProfile = '';
    }
  }

  // 更新Profile选择
  profileSelect.addEventListener('change', async (e) => {
    selectedProfile = e.target.value;
    // 保存选择的Profile
    await chrome.storage.local.set({ lastSelectedProfile: selectedProfile });
  });

  // 更新进度显示
  function updateProgress(step, progress, text) {
    progressContainer.classList.add('active');
    progressFill.style.width = `${progress}%`;
    progressText.textContent = text;
    const steps = ['step1', 'step2', 'step3', 'step4'];
    steps.forEach((stepId, index) => {
      const stepElement = document.getElementById(stepId);
      stepElement.classList.remove('completed', 'current');
      if (index < step) {
        stepElement.classList.add('completed');
      } else if (index === step) {
        stepElement.classList.add('current');
      }
    });
  }

  function showError(message, isRetryable = true) {
    statusDiv.textContent = message;
    if (isRetryable) {
      warningDiv.textContent = '点击重试按钮重新同步';
      startSyncButton.textContent = '重试';
    } else {
      warningDiv.textContent = '请检查Edge浏览器是否已关闭';
      startSyncButton.textContent = '开始同步';
    }
    startSyncButton.disabled = false;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function syncWithRetry(retryCount = 0) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'startSync',
        profile: selectedProfile
      });
      if (response.success) {
        updateProgress(3, 100, '同步完成！');
        statusDiv.textContent = '同步成功！';
        warningDiv.textContent = '';
        startSyncButton.textContent = '开始同步';
        return true;
      } else {
        throw new Error(response.error || '同步失败');
      }
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        updateProgress(0, 0, `同步失败，${RETRY_DELAY/1000}秒后重试...`);
        await delay(RETRY_DELAY);
        return syncWithRetry(retryCount + 1);
      } else {
        throw error;
      }
    }
  }

  async function startSync() {
    if (!selectedProfile) {
      showError('请先选择Edge个人资料', false);
      return;
    }
    try {
      startSyncButton.disabled = true;
      startSyncButton.textContent = '同步中...';
      updateProgress(0, 0, '正在导出Edge数据...');
      
      // 确保使用当前选择的Profile
      const currentProfile = profileSelect.value;
      if (currentProfile !== selectedProfile) {
        selectedProfile = currentProfile;
        await chrome.storage.local.set({ lastSelectedProfile: selectedProfile });
      }
      
      console.log('开始同步，选择的Profile:', selectedProfile);
      
      // 检查服务状态
      const serverStatus = await fetch('http://localhost:3000/edge-profiles').catch(() => null);
      if (!serverStatus || !serverStatus.ok) {
        throw new Error('无法连接到本地同步服务，请确保服务已启动');
      }
      
      await syncWithRetry();
    } catch (error) {
      console.error('同步过程出错:', error);
      if (error.message.includes('无法连接到本地同步服务')) {
        showError('无法连接到同步服务，请确保服务已启动', true);
      } else {
        showError(`同步失败：${error.message}`, true);
      }
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'syncProgress') {
      updateProgress(message.step, message.progress, message.text);
    }
  });

  startSyncButton.addEventListener('click', startSync);

  // 检查服务状态
  async function checkServerStatus() {
    try {
      const response = await fetch('http://localhost:3000/edge-profiles');
      isServerRunning = response.ok;
      serverStatusDiv.textContent = `服务状态: ${isServerRunning ? '在线' : '离线'}`;
      serverStatusDiv.className = `server-status ${isServerRunning ? 'online' : 'offline'}`;
      startSyncButton.disabled = !isServerRunning;
      startServerButton.disabled = isServerRunning;
    } catch (error) {
      isServerRunning = false;
      serverStatusDiv.textContent = '服务状态: 离线';
      serverStatusDiv.className = 'server-status offline';
      startSyncButton.disabled = true;
      startServerButton.disabled = false;
    }
  }

  // 启动服务
  async function startServer() {
    try {
      startServerButton.disabled = true;
      startServerButton.textContent = '启动中...';
      serverStatusDiv.textContent = '服务状态: 正在启动...';
      
      // 调用后端启动服务
      const response = await fetch('http://localhost:3000/start-server', {
        method: 'POST'
      });
      
      if (response.ok) {
        await checkServerStatus();
      } else {
        throw new Error('启动服务失败');
      }
    } catch (error) {
      console.error('启动服务失败:', error);
      serverStatusDiv.textContent = '服务状态: 启动失败';
      serverStatusDiv.className = 'server-status offline';
      startServerButton.disabled = false;
      startServerButton.textContent = '启动服务';
    }
  }

  // 定期检查服务状态
  setInterval(checkServerStatus, 5000);

  // 绑定启动服务按钮事件
  startServerButton.addEventListener('click', startServer);

  // 初始化加载Profile
  await loadProfiles();

  // 初始化时检查服务状态
  await checkServerStatus();

  // 新增：自动下载、解析并导入Edge密码CSV
  async function downloadAndImportEdgePasswords(profile) {
    try {
      // 1. 下载CSV
      const response = await fetch(`http://localhost:3000/export-edge-passwords-csv?profile=${encodeURIComponent(profile)}`);
      if (!response.ok) throw new Error('下载CSV失败');
      // 2. 触发本地导入
      const importResp = await fetch('http://localhost:3000/import-edge-passwords', { method: 'POST' });
      const result = await importResp.json();
      if (result.success) {
        alert('密码已自动导入！如未见效果，请检查浏览器窗口和系统权限。');
      } else {
        alert('自动导入失败：' + result.error);
      }
      // 3. 删除CSV
      await fetch('http://localhost:3000/delete-edge-passwords-csv', { method: 'POST' });
    } catch (e) {
      alert('导入Edge密码失败：' + e.message);
    }
  }

  // 新增按钮事件
  const importPwdBtn = document.getElementById('importEdgePasswordsBtn');
  if (importPwdBtn) {
    importPwdBtn.addEventListener('click', async () => {
      // 自动打开密码管理页面
      chrome.tabs.create({ url: 'chrome://password-manager/settings' }); // 如不支持可改chrome://settings/passwords
      // 友好弹窗提示
      alert('请在新打开的"密码管理工具"页面，点击"选择文件"按钮，手动导入刚刚导出的CSV文件。');
    });
  }

  // 新增：导出Edge密码到桌面按钮事件绑定
  const exportPwdBtn = document.getElementById('exportEdgePasswordsToDesktopBtn');
  if (exportPwdBtn) {
    exportPwdBtn.addEventListener('click', () => {
      alert('请在Edge浏览器的"设置-密码管理"页面，使用官方"导出密码"功能手动导出明文CSV文件。\n\n系统会弹出验证窗口（如Touch ID或输入系统密码），导出的CSV即为明文。');
    });
  }
}); 