// ============================================================
// GET /api/progress/:sessionId
// Server-Sent Events endpoint for real-time progress
// ============================================================

import { Router } from 'express';
import { getSession, addListener } from '../session/manager';

const router = Router();

router.get('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable Nginx buffering
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  // Register listener
  const removeListener = addListener(sessionId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Close connection when session is complete or errored
    if (event.type === 'all_complete' || event.type === 'error') {
      setTimeout(() => {
        res.end();
      }, 100);
    }
  });

  // Clean up on client disconnect
  req.on('close', () => {
    removeListener();
  });
});

export default router;
