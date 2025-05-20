console.log('confirm.html 脚本已加载');
document.addEventListener('DOMContentLoaded', function() {
  console.log('confirm.html DOMContentLoaded');
  document.getElementById('confirmBtn').addEventListener('click', () => {
    console.log('点击了确认同步');
    chrome.runtime.sendMessage({ action: 'confirmSync', confirmed: true }, () => {
      if (chrome.runtime.lastError) {
        // 消除未捕获警告
        // console.warn(chrome.runtime.lastError.message);
      }
      window.close();
    });
  });
  document.getElementById('cancelBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'confirmSync', confirmed: false }, () => {
      if (chrome.runtime.lastError) {
        // 消除未捕获警告
        // console.warn(chrome.runtime.lastError.message);
      }
      window.close();
    });
  });
}); 