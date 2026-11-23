# 语音转会议纪要

把一小时的会压缩成三分钟能读完的纪要：录音或上传音频 → 语音转文字（可人工校对）→ AI 流式生成「会议摘要 / 关键决议 / 待办事项（含负责人与期限）」。

**没有 API key 也能用**：录音、上传、回放、文字稿编辑完整可用；转写与纪要会明确提示「未配置 AI 服务」并引导到设置页，绝不伪造结果。

## 功能一览

- 🎙️ 浏览器麦克风录音（计时 + 停止自动保存，授权被拒有明确提示）
- 📁 上传 mp3 / wav / m4a / webm / ogg（单个 ≤ 100MB），刷新后仍可回放
- 📋 会议列表：状态标签（未转写 / 已转写 / 已生成纪要）、重命名、删除（联动删除音频文件）
- 📝 音频转写（OpenAI 兼容 `/audio/transcriptions`），文字稿可编辑保存，未转写也可手动粘贴
- ✨ 纪要 SSE 流式生成，Markdown 渲染（marked + DOMPurify），持久化、可重新生成覆盖
- ⚙️ AI 设置：baseUrl / apiKey / model / asrModel，密钥脱敏回显（仅末 4 位）、掩码不覆盖真密钥、真实连接测试
- 超过 25MB 的音频转写前会提示可能超限，仍允许尝试并如实报错（后端 5 分钟超时上限）

## 音频链路图

```
浏览器                          Express (3003)                    外部 AI 服务
──────                          ──────────────                    ────────────
MediaRecorder 录音 ─┐
                    ├─ multipart POST /api/meetings/* ─→ multer 内存中转
选择文件上传 ───────┘         │                          落盘 server/data/audio/
                              │                          SQLite 存元数据(路径/时长/状态)
                              ▼
<audio> 回放 ←── GET /api/meetings/:id/audio（sendFile，支持 Range 拖动）
                              │
点击「音频转写」── POST /api/ai/transcribe/:id ─→ 读磁盘音频，multipart 转发
                              │                    {baseUrl}/audio/transcriptions
                              │                    model = asrModel（SenseVoiceSmall）
                              ▼
文字稿 textarea ←── 转写结果存 SQLite，可人工校对 / 手动粘贴后保存
                              │
点击「生成纪要」── POST /api/ai/summary/:id ──→ {baseUrl}/chat/completions (stream)
                              │                    model = model（对话模型）
                              ▼
Markdown 流式渲染 ←── SSE 逐段转发 delta，完成后整篇落库，可重新生成覆盖
```

## 三个核心原理

**MediaRecorder（浏览器录音）**：`getUserMedia({audio:true})` 拿到麦克风流（首次触发授权弹窗），交给 `MediaRecorder` 按浏览器支持的编码切片（Chrome 输出 webm/opus，Safari 输出 mp4），`ondataavailable` 收集分片，停止后拼成 Blob 上传。录音必须 HTTPS 或 localhost，否则浏览器直接禁用麦克风。

**ASR 转写（语音识别）**：后端把磁盘上的音频用 `FormData + Blob` 重新打包成 multipart，转发到 OpenAI 兼容的 `/audio/transcriptions` 接口，`model` 字段填设置页的 asrModel。识别是整段离线进行的（不做实时流式），长音频耗时长，后端设 5 分钟超时并如实把上游错误（过大 / 格式不支持 / 密钥无效）透传给页面。

**SSE 流式纪要**：后端以 `text/event-stream` 响应，把上游 chat completions 的流式 delta 逐条转发（`data: {"delta":"..."}`），前端用 `fetch + ReadableStream` 按空行分块解析、边收边渲染 Markdown，打字机效果就是这么来的。关键细节：客户端断连要监听 `res.on('close')` 且判断 `!res.writableEnded` 才 abort 上游——Node 16+ 请求体收完就会触发 `req` 的 close，用 `req.on('close')` 会误杀正常请求。生成失败不落库，成功才整篇覆盖保存。

## 启动

需要 Node.js 22+（用到内置 `node:sqlite`，无需额外安装数据库）。

```bash
npm install
npm run dev        # Express 3003 + Vite 5173，浏览器打开 http://localhost:5173
```

生产运行：

```bash
npm run build      # 前端打包到 dist/
npm start          # Express 托管 dist 与 API，访问 http://localhost:3003
```

数据都在 `server/data/`（SQLite + 音频文件），备份 / 迁移拷这个目录即可。

## 免费 key 指引（三分钟）

1. 打开 **siliconflow.cn**（硅基流动）注册账号，新用户送免费额度
2. 控制台 → 「API 密钥」 → 新建密钥，复制 `sk-` 开头的字符串
3. 打开本应用「AI 设置」页：
   - baseUrl：`https://api.siliconflow.cn/v1`（默认已填）
   - apiKey：粘贴密钥
   - model（对话）：`Qwen/Qwen2.5-7B-Instruct`（免费）
   - asrModel（语音识别）：`FunAudioLLM/SenseVoiceSmall`（免费，中文效果好）
4. 保存 → 测试连接，成功后即可转写与生成纪要

任何 OpenAI 兼容服务都可以（DeepSeek、阿里百炼、本地 Ollama 等），只要同时提供 chat 与 audio/transcriptions 两个接口；只有 chat 的服务（如 DeepSeek 官方）可以生成纪要但无法转写。

## 部署注意：必须 HTTPS

浏览器只在 **HTTPS 或 localhost** 下开放麦克风（`getUserMedia` 的安全上下文限制）。部署到服务器时：

- 用 Nginx / Caddy 反代 Express 并配 TLS 证书（Caddy 自动签 Let's Encrypt 最省事）
- 反代需关闭 SSE 缓冲（Nginx：`proxy_buffering off;`），否则纪要不是流式输出
- 上传体积上限 100MB，Nginx 需 `client_max_body_size 100m;`
- `server/data/` 挂持久卷，容器重建不丢录音与配置

## 技术栈与目录

Vue 3 + Vite + vue-router / Express 4 + node:sqlite（WAL）+ multer / marked + DOMPurify。

```
server/
  db.js               SQLite 建表（meetings/settings）与 WAL
  index.js            Express 入口，托管 dist 与 API
  routes/meetings.js  会议 CRUD、上传/录音落盘、回放、文字稿保存
  routes/settings.js  四项 AI 配置、脱敏掩码、连接测试
  routes/ai.js        转写 multipart 转发 + 纪要 SSE 流式
  data/               app.db + audio/（运行时生成，已 gitignore）
src/
  views/MeetingsView.vue       录音面板 + 上传 + 会议列表
  views/MeetingDetailView.vue  回放 + 文字稿编辑 + 纪要流式渲染
  views/SettingsView.vue       AI 设置页
  lib/api.js                   fetch 封装 + SSE 消费
openspec/                      规格文档（proposal/design/specs/tasks）
```

## 桌面 exe

- 打包：`npm run dist:exe`（自动构建前端 + 生成不含死文件的干净 Electron 发行版 + electron-builder portable），产物 `release-build/meeting-notes-portable.exe`，单文件双击即用，无需安装 Node
- 原理：Electron 45 主进程先启动内置 Express（3003 端口优先，被占自动换空闲端口），数据目录经环境变量注入指向用户数据目录（打包后代码目录只读），再开窗口加载 http://127.0.0.1:<port>
- 录音/上传的音频文件随数据库存在用户数据目录，删除会议联动删音频。
- 已实测：portable 外壳解压→应用启动→接口/页面正常；本开发沙箱需附加 --no-sandbox 参数（Chromium 沙箱受限），正常 Windows 桌面双击即可
- 数据目录默认 %LOCALAPPDATA%/meeting-notes，可用环境变量覆盖（便携模式）
