<template>
  <div>
    <h2 class="page-title">会议列表</h2>

    <div v-if="error" class="banner error">{{ error }}</div>
    <div v-if="micError" class="banner warn">{{ micError }}</div>

    <div class="panel capture-bar">
      <template v-if="!recording">
        <button @click="startRecording">🎙️ 开始录音</button>
      </template>
      <template v-else>
        <span class="rec-dot"></span>
        <span class="rec-timer">{{ formatDuration(seconds) }}</span>
        <button class="danger" @click="stopRecording">⏹ 停止并保存</button>
      </template>
      <button class="ghost" :disabled="uploading || recording" @click="fileInput.click()">
        {{ uploading ? '上传中…' : '📁 上传音频' }}
      </button>
      <input ref="fileInput" type="file" accept=".mp3,.wav,.m4a,.webm,.ogg" style="display: none" @change="onFilePicked" />
      <span class="capture-hint">支持 mp3 / wav / m4a / webm / ogg，单个不超过 100MB</span>
    </div>

    <div v-if="meetings.length" class="meeting-list">
      <div v-for="m in meetings" :key="m.id" class="panel meeting-card">
        <span class="badge" :class="m.status">{{ statusLabel(m.status) }}</span>
        <div class="info">
          <template v-if="renamingId === m.id">
            <input
              v-model="renameText"
              class="rename-input"
              @keyup.enter="confirmRename(m)"
              @keyup.esc="renamingId = null"
            />
          </template>
          <router-link v-else class="title" :to="`/meetings/${m.id}`">{{ m.title }}</router-link>
          <div class="meta">
            <span>{{ m.created_at }}</span>
            <span v-if="m.duration">时长 {{ formatDuration(m.duration) }}</span>
            <span>{{ formatSize(m.audio_size) }}</span>
          </div>
        </div>
        <div class="ops">
          <template v-if="renamingId === m.id">
            <button class="small" @click="confirmRename(m)">保存</button>
            <button class="small ghost" @click="renamingId = null">取消</button>
          </template>
          <template v-else>
            <button class="small ghost" @click="startRename(m)">重命名</button>
            <button class="small danger" @click="remove(m)">删除</button>
          </template>
        </div>
      </div>
    </div>
    <div v-else class="panel empty">还没有会议记录，点击上方「开始录音」或「上传音频」创建第一条</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { listMeetings, renameMeeting, deleteMeeting, uploadAudio } from '../lib/api.js';

const router = useRouter();
const meetings = ref([]);
const error = ref('');
const micError = ref('');
const uploading = ref(false);
const fileInput = ref(null);
const renamingId = ref(null);
const renameText = ref('');

const recording = ref(false);
const seconds = ref(0);
let recorder = null;
let stream = null;
let timer = null;
let chunks = [];

const STATUS_LABELS = { recorded: '未转写', transcribed: '已转写', summarized: '已生成纪要' };
const statusLabel = (s) => STATUS_LABELS[s] || s;

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
  try {
    meetings.value = await listMeetings();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);

async function startRecording() {
  error.value = '';
  micError.value = '';
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    micError.value = '当前浏览器不支持录音，请使用最新版 Chrome / Edge，部署环境需 HTTPS';
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      micError.value = '麦克风权限被拒绝：请点击浏览器地址栏左侧的锁/设置图标，允许麦克风后重试（部署环境必须 HTTPS）';
    } else if (e.name === 'NotFoundError') {
      micError.value = '未检测到麦克风设备，请连接麦克风后重试';
    } else {
      micError.value = `无法开始录音：${e.message}`;
    }
    return;
  }
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = saveRecording;
  recorder.start(1000);
  recording.value = true;
  seconds.value = 0;
  timer = setInterval(() => seconds.value++, 1000);
}

function stopRecording() {
  clearInterval(timer);
  recording.value = false;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

async function saveRecording() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  const type = recorder?.mimeType || 'audio/webm';
  const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
  const blob = new Blob(chunks, { type });
  chunks = [];
  if (!blob.size) {
    error.value = '录音数据为空，未保存';
    return;
  }
  const duration = seconds.value;
  try {
    const meeting = await uploadAudio(blob, `recording.${ext}`, {
      kind: 'recording',
      title: `录音 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      duration
    });
    router.push(`/meetings/${meeting.id}`);
  } catch (e) {
    error.value = `录音保存失败：${e.message}`;
    await load();
  }
}

async function onFilePicked(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  error.value = '';
  uploading.value = true;
  try {
    const duration = await probeDuration(file);
    const meeting = await uploadAudio(file, file.name, { kind: 'upload', duration });
    router.push(`/meetings/${meeting.id}`);
  } catch (err) {
    error.value = err.message;
    await load();
  } finally {
    uploading.value = false;
  }
}

function probeDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (val) => {
      URL.revokeObjectURL(url);
      resolve(val);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

function startRename(m) {
  renamingId.value = m.id;
  renameText.value = m.title;
}

async function confirmRename(m) {
  if (!renameText.value.trim()) return;
  try {
    await renameMeeting(m.id, renameText.value.trim());
    renamingId.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(m) {
  if (!confirm(`确定删除「${m.title}」？对应音频文件会一并删除，不可恢复`)) return;
  try {
    await deleteMeeting(m.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onBeforeUnmount(() => {
  clearInterval(timer);
  if (recorder && recorder.state !== 'inactive') {
    recorder.onstop = null;
    recorder.stop();
  }
  stream?.getTracks().forEach((t) => t.stop());
});
</script>