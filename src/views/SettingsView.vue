<template>
  <div>
    <h2 class="page-title">AI 服务设置</h2>

    <div class="panel settings-form">
      <div v-if="saved" class="banner ok">已保存，转写与纪要功能即刻生效</div>
      <div v-if="error" class="banner error">{{ error }}</div>

      <label>接口地址 baseUrl</label>
      <input v-model="form.baseUrl" placeholder="https://api.siliconflow.cn/v1" />
      <p class="hint">任何 OpenAI 兼容接口均可：硅基流动 / DeepSeek / 阿里百炼 / Moonshot / 本地 Ollama</p>

      <label>API 密钥</label>
      <input v-model="form.apiKey" type="password" :placeholder="masked || '填写 API 密钥（sk-...）'" autocomplete="new-password" />
      <p class="hint">{{ masked ? `已保存密钥 ${masked}，留空表示不修改` : '密钥只存在你本机的 SQLite 里，不会上传到任何第三方' }}</p>

      <label>对话模型 model（生成纪要用）</label>
      <input v-model="form.model" placeholder="Qwen/Qwen2.5-7B-Instruct" />

      <label>语音识别模型 asrModel（音频转写用）</label>
      <input v-model="form.asrModel" placeholder="FunAudioLLM/SenseVoiceSmall" />
      <p class="hint">硅基流动的 SenseVoiceSmall 免费且中文效果好，推荐保持默认</p>

      <div style="margin-top: 18px; display: flex; gap: 10px">
        <button :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存配置' }}</button>
        <button class="ghost" :disabled="testing" @click="test">{{ testing ? '测试中…' : '测试连接' }}</button>
      </div>

      <div v-if="testResult" class="test-result banner" :class="testResult.ok ? 'ok' : 'error'">
        {{ testResult.ok ? `✅ 连接成功，模型：${testResult.model}` : `❌ ${testResult.message}` }}
      </div>
      <p class="hint">测试连接只验证对话模型；转写模型是否可用以实际转写结果为准</p>
    </div>

    <div class="panel guide">
      <h4>还没有密钥？三分钟免费搞定（推荐硅基流动）</h4>
      <ol>
        <li>打开 siliconflow.cn 注册账号（新用户送免费额度）</li>
        <li>控制台 → 「API 密钥」 → 新建密钥，复制 sk- 开头的字符串</li>
        <li>回到本页粘贴密钥，对话模型填 <code>Qwen/Qwen2.5-7B-Instruct</code>（免费），语音识别模型填 <code>FunAudioLLM/SenseVoiceSmall</code>（免费），保存并测试连接</li>
      </ol>
      <p class="hint">未配置密钥时，录音、上传、回放与文字稿编辑照常可用；转写与纪要会明确提示需配置，不会伪造结果。</p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { getSettings, saveSettings, testConnection } from '../lib/api.js';

const form = reactive({ baseUrl: '', apiKey: '', model: '', asrModel: '' });
const masked = ref('');
const saving = ref(false);
const testing = ref(false);
const saved = ref(false);
const error = ref('');
const testResult = ref(null);

onMounted(async () => {
  try {
    const s = await getSettings();
    form.baseUrl = s.baseUrl;
    form.model = s.model;
    form.asrModel = s.asrModel;
    masked.value = s.apiKeyMasked;
  } catch (e) {
    error.value = e.message;
  }
});

async function save() {
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    const s = await saveSettings({
      baseUrl: form.baseUrl,
      model: form.model,
      asrModel: form.asrModel,
      apiKey: form.apiKey || undefined
    });
    masked.value = s.apiKeyMasked;
    form.apiKey = '';
    saved.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function test() {
  testing.value = true;
  testResult.value = null;
  try {
    testResult.value = await testConnection();
  } catch (e) {
    testResult.value = { ok: false, message: e.message };
  } finally {
    testing.value = false;
  }
}
</script>