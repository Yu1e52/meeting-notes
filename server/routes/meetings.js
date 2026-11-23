import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { db, audioDir, getMeeting, touchMeeting } from '../db.js';

const router = Router();

const UPLOAD_EXTS = ['mp3', 'wav', 'm4a', 'webm', 'ogg'];
const RECORDING_EXTS = [...UPLOAD_EXTS, 'mp4'];
const MIME = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp4: 'audio/mp4'
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (!RECORDING_EXTS.includes(ext)) {
      const err = new Error('不支持的文件格式，仅支持 mp3 / wav / m4a / webm / ogg');
      err.code = 'INVALID_FORMAT';
      return cb(err);
    }
    cb(null, true);
  }
});

function uploadError(err, res) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: '文件超过 100MB 上限' } });
  }
  if (err.code === 'INVALID_FORMAT') {
    return res.status(400).json({ error: { code: 'INVALID_FORMAT', message: err.message } });
  }
  return res.status(400).json({ error: { message: `上传失败：${err.message}` } });
}

function saveAudio(file, ext, title, duration) {
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  writeFileSync(path.join(audioDir, filename), file.buffer);
  const fallbackTitle = path.basename(file.originalname, path.extname(file.originalname)) || '未命名会议';
  const info = db
    .prepare(
      `INSERT INTO meetings (title, audio_path, audio_mime, audio_size, duration)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(title?.trim() || fallbackTitle, filename, MIME[ext] || 'application/octet-stream', file.size, Number(duration) || 0);
  return getMeeting(info.lastInsertRowid);
}

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM meetings ORDER BY created_at DESC, id DESC').all());
});

router.post('/upload', (req, res) => {
  upload.single('audio')(req, res, (err) => {
    if (err) return uploadError(err, res);
    if (!req.file) return res.status(400).json({ error: { message: '请选择音频文件' } });
    const ext = path.extname(req.file.originalname).toLowerCase().slice(1);
    if (!UPLOAD_EXTS.includes(ext)) {
      return res.status(400).json({ error: { code: 'INVALID_FORMAT', message: '不支持的文件格式，仅支持 mp3 / wav / m4a / webm / ogg' } });
    }
    res.status(201).json(saveAudio(req.file, ext, req.body.title, req.body.duration));
  });
});

router.post('/recording', (req, res) => {
  upload.single('audio')(req, res, (err) => {
    if (err) return uploadError(err, res);
    if (!req.file) return res.status(400).json({ error: { message: '录音数据为空' } });
    const ext = path.extname(req.file.originalname).toLowerCase().slice(1);
    res.status(201).json(saveAudio(req.file, ext, req.body.title, req.body.duration));
  });
});

router.get('/:id', (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: { message: '会议不存在' } });
  res.json(meeting);
});

router.get('/:id/audio', (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: { message: '会议不存在' } });
  const file = path.join(audioDir, meeting.audio_path);
  if (!existsSync(file)) return res.status(404).json({ error: { message: '音频文件已丢失' } });
  res.sendFile(file);
});

router.put('/:id', (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: { message: '会议不存在' } });
  const title = req.body?.title;
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: { message: '标题不能为空' } });
  }
  db.prepare('UPDATE meetings SET title = ? WHERE id = ?').run(title.trim(), meeting.id);
  touchMeeting(meeting.id);
  res.json(getMeeting(meeting.id));
});

router.put('/:id/transcript', (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: { message: '会议不存在' } });
  const transcript = req.body?.transcript;
  if (typeof transcript !== 'string') {
    return res.status(400).json({ error: { message: '文字稿必须是字符串' } });
  }
  const status = transcript.trim() && meeting.status === 'recorded' ? 'transcribed' : meeting.status;
  db.prepare('UPDATE meetings SET transcript = ?, status = ? WHERE id = ?').run(transcript, status, meeting.id);
  touchMeeting(meeting.id);
  res.json(getMeeting(meeting.id));
});

router.delete('/:id', (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: { message: '会议不存在' } });
  const file = path.join(audioDir, meeting.audio_path);
  if (existsSync(file)) unlinkSync(file);
  db.prepare('DELETE FROM meetings WHERE id = ?').run(meeting.id);
  res.json({ ok: true });
});

export default router;