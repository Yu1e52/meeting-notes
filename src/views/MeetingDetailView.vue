<template>
  <div v-if="meeting">
    <div class="detail-head">
      <router-link class="back" to="/">← 返回列表</router-link>
      <template v-if="renaming">
        <input v-model="renameText" style="max-width: 360px" @keyup.enter="confirmRename" @keyup.esc="renaming = false" />
        <button class="small" @click="confirmRename">保存</button>
        <button class="small ghost" @click="renaming = false">取消</button>
      </template>
      <template v-else>
        <h2 class="page-title">{{ meeting.title }}</h2>
        <button class="small ghost" @click="startRename">重命名</button>
      </template>
      <span class="badge" :class="meeting.status">{{ statusLabel(meeting.status) }}</span>
    </div>

    <div v-if="loadError" class="banner error">{{ loadError }}</div>

    <div class="panel audio-panel">
      <audio controls :src="`/api/meetings/${meeting.id}/audio`"></audio>
      <div class="meta">
        <span>创建时间 {{ meeting.created_at }}</span>
        <span v-if="meeting.duration">时长 {{ formatDuration(meeting.duration) }}</span>
        <span>大小 {{ formatSize(meeting.audio_size) }}</span>
      </div>
    </div>

    <div class="detail-grid">
      <div class="panel detail-panel">
        <div class="panel-head">
          <h3>📝 文字稿</h3>
          <div class="ops">
            <button class="ghost" :disabled="transcribing" @click="transcribe">
              {{ transcribing ? '转写中…' : meeting.transcript ? '重新转写' : '音频转写' }}
            </button>
            <button :disabled="savingTranscript || draft === meeting.transcript" @click="saveDraft">
              {{ savingTranscript ? '保存中…' : '保存文字稿' }}
            </button>
          </div>
        </div>
        <div v-if="transcribing" class="banner warn">正在转写，长音频可能需要几分钟，请勿关闭页面…</div>
        <div v-if="transcriptError" class="banner error">
          {{ transcriptError.message }}
          <router-link v-if="transcriptError.code === 'AI_NOT_CONFIGURED'" to="/settings">前往设置 →</router-link>
        </div>
        <div v-if="draft !== meeting.transcript" class="banner warn">有未保存的修改，生成纪要将使用已保存的文字稿</div>
        <textarea
          v-model="draft"
          class="transcript-area"
          placeholder="点击「音频转写」自动识别，或直接在这里粘贴 / 输入会议文字稿后保存"
        ></textarea>
        <p class="hint">转写结果可人工校对；未配置 AI 服务时也可以手动粘贴文字稿，保存后即可生成纪要</p>
      </div>

      <div class="panel detail-panel">
        <div class="panel-head">
          <h3>✨ 会议纪要</h3>
          <div class="ops">
            <button :disabled="!canGenerate" @click="generate">
              {{ generating ? '生成中…' : meeting.summary ? '重新生成' : '生成纪要' }}
            </button>
          </div>
        </div>
        <div v-if="!meeting.transcript.trim() && !generating" class="banner warn">
          文字稿为空，请先转写或粘贴文字稿并保存，再生成纪要
        </div>
        <div v-if="summaryError" class="banner error">
          {{ summaryError.message }}
          <router-link v-if="summaryError.code === 'AI_NOT_CONFIGURED'" to="/settings">前往设置 →</router-link>
        </div>
        <p v-if="meeting.summary_at && !generating" class="hint">生成时间 {{ meeting.summary_at }}</p>
        <div
          v-if="displayedSummary"
          class="markdown"
          :class="{ 'typing-cursor': generating }"
          v-html="renderedSummary"
        ></div>
        <div v-else-if="!generating" class="placeholder">还没有纪要，点击「生成纪要」产出摘要 / 决议 / 待办</div>
        <div v-else class="placeholder typing-cursor">等待模型输出…</div>
      </div>
    </div>
  </div>
  <div v-else class="panel empty">{{ loadError || '加载中…' }}</div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getMeeting, renameMeeting, saveTranscript, transcribeMeeting, streamSummary } from '../lib/api.js';

const route = useRoute();
const meeting = ref(null);
const draft = ref('');
const loadError = ref('');
const transcriptError = ref(null);
const summaryError = ref(null);
const transcribing = ref(false);
const savingTranscript = ref(false);
const generating = ref(false);
const streamText = ref('');
const renaming = ref(false);
const renameText = ref('');

const STATUS_LABELS = { recorded: '未转写', transcribed: '已转写', summarized: '已生成纪要' };
const statusLabel = (s) => STATUS_LABELS[s] || s;

const displayedSummary = computed(() => (generating.value ? streamText.value : meeting.value?.summary || ''));
const renderedSummary = computed(() => DOMPurify.sanitize(marked.parse(displayedSummary.value)));
const canGenerate = computed(() => !!meeting.value?.transcript.trim() && !generating.value && !transcribing.value);

function formatDuration(sec) {
  const s = Math.round(Number(sec) || 0);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function load() {
  loadError.value = '';
  transcriptError.value = null;
  summaryError.value = null;
  streamText.value = '';
  try {
    meeting.value = await getMeeting(route.params.id);
    draft.value = meeting.value.transcript;
  } catch (e) {
    meeting.value = null;
    loadError.value = e.message;
  }
}

onMounted(load);
watch(() => route.params.id, (id) => {
  if (id) load();
});

function startRename() {
  renameText.value = meeting.value.title;
  renaming.value = true;
}

async function confirmRename() {
  if (!renameText.value.trim()) return;
  try {
    meeting.value = await renameMeeting(meeting.value.id, renameText.value.trim());
    renaming.value = false;
  } catch (e) {
    loadError.value = e.message;
  }
}

async function saveDraft() {
  savingTranscript.value = true;
  transcriptError.value = null;
  try {
    meeting.value = await saveTranscript(meeting.value.id, draft.value);
  } catch (e) {
    transcriptError.value = { message: e.message, code: e.code };
  } finally {
    savingTranscript.value = false;
  }
}

async function transcribe() {
  transcriptError.value = null;
  if (meeting.value.audio_size > 25 * 1024 * 1024) {
    const ok = confirm('音频超过 25MB，转写可能超时或被接口拒绝（约 1 小时录音的体积）。仍要尝试吗？');
    if (!ok) return;
  }
  transcribing.value = true;
  try {
    meeting.value = await transcribeMeeting(meeting.value.id);
    draft.value = meeting.value.transcript;
  } catch (e) {
    transcriptError.value = { message: e.message, code: e.code };
  } finally {
    transcribing.value = false;
  }
}

async function generate() {
  summaryError.value = null;
  generating.value = true;
  streamText.value = '';
  try {
    await streamSummary(meeting.value.id, (delta) => {
      streamText.value += delta;
    });
    meeting.value = await getMeeting(meeting.value.id);
  } catch (e) {
    summaryError.value = { message: e.message, code: e.code };
  } finally {
    generating.value = false;
    streamText.value = '';
  }
}
</script>