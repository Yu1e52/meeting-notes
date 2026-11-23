# Design

## Context

全新项目，动机见 proposal.md - Why。约束：用户暂无 API key，录音/上传/回放/编辑必须无 key 完整可用；音频可能长达一小时，上传与转写要考虑体积；与 ai-job-hunter 保持一致的技术栈与分层，便于讲解与复用经验。

## Goals / Non-Goals

**Goals:**

- 分层：`server/`（Express + SQLite + 音频文件存储）、`src/`（Vue3）、`openspec/`
- 音频二进制与元数据分离：文件存磁盘，SQLite 只存路径与状态
- AI 配置模块与 ai-job-hunter 同构（多一个 asrModel 字段）

**Non-Goals:**

- 不做说话人分离（diarization）与实时流式转写——首版整段音频离线转写
- 不做多用户与云端存储
- 本阶段不做 exe / APK 打包

## Decisions

1. **录音用 MediaRecorder API**：浏览器原生，输出 webm/opus（Chrome）或 mp4（Safari），零依赖。备选 RecordRTC 封装库多余；Web Speech API 实时识别在国内网络不可靠，弃用。
2. **音频存磁盘 + SQLite 存元数据**：BLOB 进 SQLite 会让数据库膨胀且备份困难；磁盘文件 + 路径引用是标准做法。上传用 multer 内存中转后落盘，限制 100MB。
3. **转写走 OpenAI 兼容 /audio/transcriptions**：硅基流动 SenseVoice 免费且中文效果好，multipart 转发音频即可。备选本地 whisper.cpp 离线但安装编译门槛高，列为后续增强。
4. **大音频先提示再转写**：超过 25MB（约 1 小时 webm）时提示可能超时/超限，仍允许尝试并如实报错。不做自动切片（Non-Goal，避免首版复杂度）。
5. **纪要 SSE 流式**：与 ai-job-hunter 相同的 fetch + ReadableStream 方案，提示词固定输出「摘要/决议/待办」三段 Markdown 结构。
6. **状态机字段**：meeting.status ∈ recorded / transcribed / summarized，由操作驱动单向推进，重新生成不改变状态语义。

## Risks / Trade-offs

- [长音频转写超时] → 前端 fetch 不设短超时，后端转发设 5 分钟上限并如实报错；提示用户音频过大
- [MediaRecorder 各浏览器编码不一] → 后端按扩展名透传 MIME，ASR 接口支持 webm/mp3/wav/m4a；不支持的格式如实报错
- [麦克风权限/HTTPS 限制] → localhost 开发可用；部署必须 HTTPS，README 写明
- [无 key 时核心价值不可演示] → 录音回放与文字稿编辑完整可用，AI 入口统一引导配置，不伪造

## Migration Plan

全新项目无迁移。部署：`npm run build` 后 Express 托管 dist 与 API，音频目录挂持久卷；回滚回退代码，数据目录独立保留。