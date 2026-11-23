import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 部分环境（沙箱/受限账户）禁止写 Roaming，默认放 LocalAppData；可用环境变量覆盖（便携模式）
const userDataDir =
  process.env.MEETING_NOTES_USER_DATA ||
  path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'meeting-notes');
app.setPath('userData', userDataDir);

function pickPort(preferred) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => {
      const fallback = net.createServer();
      fallback.listen(0, '127.0.0.1', () => {
        const port = fallback.address().port;
        fallback.close(() => resolve(port));
      });
    });
    probe.listen(preferred, '127.0.0.1', () => probe.close(() => resolve(preferred)));
  });
}

async function waitServer(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('内置服务启动超时');
}

app.whenReady().then(async () => {
  process.env.MEETING_NOTES_DATA_DIR = path.join(app.getPath('userData'), 'data');
  const port = await pickPort(3003);
  process.env.PORT = String(port);
  await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.js')).href);
  await waitServer(port);

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    title: '语音转会议纪要',
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
}).catch((e) => {
  console.error('启动失败:', e);
  app.quit();
});

app.on('window-all-closed', () => app.quit());