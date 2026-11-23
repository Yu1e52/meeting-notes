import { Router } from 'express';
import { getSetting, setSetting } from '../db.js';

const router = Router();

const DEFAULTS = {
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  asrModel: 'FunAudioLLM/SenseVoiceSmall'
};

export function getAiConfig() {
  return {
    baseUrl: getSetting('ai.baseUrl', DEFAULTS.baseUrl).replace(/\/+$/, ''),
    apiKey: getSetting('ai.apiKey'),
    model: getSetting('ai.model', DEFAULTS.model),
    asrModel: getSetting('ai.asrModel', DEFAULTS.asrModel)
  };
}

function maskKey(key) {
  return key ? '••••••••' + key.slice(-4) : '';
}

function publicConfig(cfg) {
  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    asrModel: cfg.asrModel,
    hasKey: !!cfg.apiKey,
    apiKeyMasked: maskKey(cfg.apiKey)
  };
}

router.get('/', (req, res) => {
  res.json(publicConfig(getAiConfig()));
});

router.put('/', (req, res) => {
  const { baseUrl, apiKey, model, asrModel } = req.body || {};
  if (baseUrl !== undefined) {
    if (!/^https?:\/\/.+/.test(baseUrl.trim())) {
      return res.status(400).json({ error: { message: 'baseUrl 必须以 http:// 或 https:// 开头' } });
    }
    setSetting('ai.baseUrl', baseUrl.trim());
  }
  if (model !== undefined && model.trim()) setSetting('ai.model', model.trim());
  if (asrModel !== undefined && asrModel.trim()) setSetting('ai.asrModel', asrModel.trim());
  if (typeof apiKey === 'string' && apiKey.trim() && !apiKey.startsWith('••')) {
    setSetting('ai.apiKey', apiKey.trim());
  }
  res.json(publicConfig(getAiConfig()));
});

router.post('/test', async (req, res) => {
  const cfg = getAiConfig();
  if (!cfg.apiKey) {
    return res.status(400).json({ ok: false, message: '尚未配置 API 密钥，请先保存密钥再测试' });
  }
  try {
    const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return res.json({ ok: false, message: `上游返回 ${upstream.status}：${text.slice(0, 300)}` });
    }
    const data = await upstream.json();
    res.json({ ok: true, model: data.model || cfg.model });
  } catch (err) {
    res.json({ ok: false, message: `请求失败：${err.message}` });
  }
});

export default router;