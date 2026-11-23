const fs = require('node:fs');
const path = require('node:path');

// default_app.asar 只在裸跑 electron 无应用时用到，打包后是死文件；
// 某些机器的扫描进程会锁住它导致 portable 自解压失败，打包前移除
exports.default = async function afterPack(context) {
  const target = path.join(context.appOutDir, 'resources', 'default_app.asar');
  try {
    fs.rmSync(target, { force: true });
  } catch {
    // 被占用时保留，不影响已安装形态运行
  }
};