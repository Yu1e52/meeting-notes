const fs = require('node:fs');
const path = require('node:path');

// 某些机器的扫描进程会瞬间锁住新写入的 default_app.asar，导致 electron-builder
// 解压/移动失败。打包前复制一份不含该死文件的 Electron 发行版供 electronDist 使用。
const src = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');
const dest = path.join(__dirname, '..', 'node_modules', '.electron-dist-clean');

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (s) => path.basename(s) !== 'default_app.asar',
});
console.log('[prepack] clean electron dist ready:', dest);