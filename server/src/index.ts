// ============================================================
// Figma Namer - Express Server Entry Point
// ============================================================

import express from 'express';
import cors from 'cors';
import analyzeRouter from './routes/analyze';
import nameRouter from './routes/name';
import progressRouter from './routes/progress';
import exportRouter from './routes/export';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3456;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/analyze', analyzeRouter);
app.use('/api/name', nameRouter);
app.use('/api/progress', progressRouter);
app.use('/api/export', exportRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.2.0' });
});

app.listen(PORT, () => {
  console.log(`\n  Figma Namer server running at http://localhost:${PORT}`);
  console.log(`  Dashboard: http://localhost:5173\n`);
});
