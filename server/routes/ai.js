import { Router } from 'express';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { db, audioDir, getMeeting, touchMeeting } from '../db.js';
import { getAiConfig } from './settings.js';

const router = Router();

const SUMMARY_PROMPT = `你是一位专业的会议纪要助手。请根据用户提供的会议文字稿生成结构化纪要，输出 Markdown，必须且只包含以下三个小节：
## 会议摘要
（3-5 句话概括会议主题、讨论要点与结论）
## 关键决议
（逐条列出会议达成的决定；没有明确决议则写「本次会议未形成明确决议」）
## 待办事项
（用表格列出：事项 | 负责人 | 期限。负责人与期限仅在原文可提取时填写，原文未提及则填「未指明」）
要求：中文输出，忠实于文字稿内容，不要编造原文没有的信息；文字稿中的错别字可按上下文理解但不要改变原意。`;

router.post('/transcribe/:id', async (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: { message: '会议不存在' } });

  const cfg = getAiConfig();
  if (!cfg.apiKey) {
    return res.status(400).json({
      error: { code: 'AI_NOT_CONFIGURED', message: '尚未配置 AI 服务，请先到「设置」页填写 API 密钥' }
    });
  }

  const file = path.join(audioDir, meeting.audio_path);
  if (!existsSync(file)) {
    return res.status(400).json({ error: { code: 'AUDIO_MISSING', message: '音频文件已丢失，无法转写' } });
  }

  try {
    const buffer = readFileSync(file);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: meeting.audio_mime }), meeting.audio_path);
    form.append('model', cfg.asrModel);

    const upstream = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(300000)
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({
        error: { code: 'ASR_FAILED', message: `转写接口返回 ${upstream.status}：${text.slice(0, 300)}` }
      });
    }

    const data = await upstream.json();
    const transcript = (data.text || '').trim();
    if (!transcript) {
      return res.status(502).json({ error: { code: 'ASR_EMPTY', message: '转写接口返回了空结果，请检查音频是否包含语音' } });
    }

    const status = meeting.status === 'recorded' ? 'transcribed' : meeting.status;
    db.prepare('UPDATE meetings SET transcript = ?, status = ? WHERE id = ?').run(transcript, status, meeting.id);
    touchMeeting(meeting.id);
    res.json(getMeeting(meeting.id));
  } catch (err) {
    const message = err.name === 'TimeoutError'
      ? '转写超时（5 分钟上限），音频可能过大，建议压缩或裁剪后重试'
      : `请求转写接口失败：${err.message}`;
    res.status(502).json({ error: { code: 'ASR_FAILED', message } });
  }
});

router.post('/summary/:id', async (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: { message: '会议不存在' } });

  const cfg = getAiConfig();
  if (!cfg.apiKey) {
    return res.status(400).json({
      error: { code: 'AI_NOT_CONFIGURED', message: '尚未配置 AI 服务，请先到「设置」页填写 API 密钥' }
    });
  }
  if (!meeting.transcript.trim()) {
    return res.status(400).json({
      error: { code: 'EMPTY_TRANSCRIPT', message: '文字稿为空，请先转写或手动粘贴文字稿' }
    });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const sendError = (message) => {
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    res.end();
  };

  try {
    const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: `【会议标题】${meeting.title}\n\n【会议文字稿】\n${meeting.transcript.trim()}` }
        ]
      }),
      signal: controller.signal
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return sendError(`模型接口返回 ${upstream.status}：${text.slice(0, 300)}`);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {}
      }
    }

    if (full.trim()) {
      db.prepare(
        "UPDATE meetings SET summary = ?, summary_at = datetime('now', 'localtime'), status = 'summarized' WHERE id = ?"
      ).run(full, meeting.id);
      touchMeeting(meeting.id);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (controller.signal.aborted) return res.end();
    sendError(`请求模型失败：${err.message}`);
  }
});

export default router;