import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import meetings from './routes/meetings.js';
import settings from './routes/settings.js';
import ai from './routes/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json({ limit: '5mb' }));
app.use('/api/meetings', meetings);
app.use('/api/settings', settings);
app.use('/api/ai', ai);

const dist = path.join(__dirname, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(dist, 'index.html'));
    } else next();
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { message: '服务器内部错误' } });
});

app.listen(PORT, () => {
  console.log(`[meeting-notes] API 服务已启动: http://localhost:${PORT}`);
});