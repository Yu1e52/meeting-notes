async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.message || `请求失败（${res.status}）`);
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export const listMeetings = () => request('/api/meetings');
export const getMeeting = (id) => request(`/api/meetings/${id}`);
export const renameMeeting = (id, title) => request(`/api/meetings/${id}`, { method: 'PUT', body: JSON.stringify({ title }) });
export const deleteMeeting = (id) => request(`/api/meetings/${id}`, { method: 'DELETE' });
export const saveTranscript = (id, transcript) => request(`/api/meetings/${id}/transcript`, { method: 'PUT', body: JSON.stringify({ transcript }) });
export const transcribeMeeting = (id) => request(`/api/ai/transcribe/${id}`, { method: 'POST' });

export async function uploadAudio(blob, filename, { kind = 'upload', title, duration } = {}) {
  const form = new FormData();
  form.append('audio', blob, filename);
  if (title) form.append('title', title);
  if (duration !== undefined) form.append('duration', String(duration));
  const res = await fetch(`/api/meetings/${kind}`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `上传失败（${res.status}）`);
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export const getSettings = () => request('/api/settings');
export const saveSettings = (body) => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
export const testConnection = () => request('/api/settings/test', { method: 'POST' });

export async function streamSummary(id, onDelta) {
  const res = await fetch(`/api/ai/summary/${id}`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data?.error?.message || `请求失败（${res.status}）`);
    err.code = data?.error?.code;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop();
    for (const block of blocks) {
      let event = 'message';
      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) dataLine = line.slice(5).trim();
      }
      if (event === 'error') throw new Error(JSON.parse(dataLine).message);
      if (dataLine === '[DONE]') return;
      if (dataLine) onDelta(JSON.parse(dataLine).delta);
    }
  }
}