# Proposal

## Why

学生组织开会、小组讨论后没人愿意整理纪要，录音躺在手机里再也没听过。做一个「录音 → 转文字 → AI 生成结构化纪要」的工具：录音或上传音频，转写后一键产出摘要、决议与待办清单，把一小时的会压缩成三分钟能读完的纪要。

## What Changes

- 新建 Web 应用：Vue3 + Vite 前端，Express + SQLite 后端，音频文件存本地磁盘
- 音频采集：浏览器麦克风录音（MediaRecorder）、上传已有音频文件、会议列表管理与回放
- 语音转写：调用 OpenAI 兼容 /audio/transcriptions 接口（如硅基流动 SenseVoice），转写稿可人工编辑
- AI 纪要：基于转写稿流式生成结构化纪要（摘要 / 关键决议 / 待办事项含负责人），可重新生成
- AI 服务设置页：baseUrl / apiKey / model / ASR 模型配置与连接测试
- 未配置 key 时：录音、上传、回放、文字稿编辑完整可用；转写与纪要入口明确提示需配置，不伪造结果

## Capabilities

### New Capabilities

- `audio-capture`: 会议录音、音频上传、会议记录持久化与回放
- `transcription`: 音频转写为文字稿，转写结果可编辑保存
- `meeting-summary`: 基于文字稿生成结构化会议纪要（摘要/决议/待办）
- `ai-provider-settings`: AI 服务商配置（含 ASR 模型）的持久化、脱敏与连接测试

### Modified Capabilities

（无 —— 全新项目，无既有规格）

## Impact

- 全新项目 `meeting-notes/`，不影响其他项目
- 运行依赖：vue、vue-router、express、marked；开发依赖：vite、@vitejs/plugin-vue、concurrently
- 外部依赖：OpenAI 兼容 chat completions 与 audio/transcriptions API（用户后续填 key）
- 数据：SQLite 存会议元数据与文字稿，音频二进制存 `server/data/audio/`