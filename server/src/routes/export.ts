// ============================================================
// GET /api/export/:sessionId
// Export naming results as JSON or CSV
// ============================================================

import { Router } from 'express';
import { getSession } from '../session/manager';

const router = Router();

router.get('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const format = (req.query.format as string) || 'json';
  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.results.length === 0) {
    return res.status(404).json({ error: 'No results available yet' });
  }

  if (format === 'csv') {
    const header = 'nodeId,originalName,suggestedName,confidence,markId';
    const rows = session.results.map((r) =>
      `"${r.nodeId}","${escapeCsv(r.originalName)}","${escapeCsv(r.suggestedName)}",${r.confidence},${r.markId}`,
    );
    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=figma-namer-${sessionId}.csv`);
    return res.send(csv);
  }

  // JSON format - also suitable for the companion plugin
  const exportData = {
    sessionId: session.id,
    exportedAt: new Date().toISOString(),
    totalNodes: session.results.length,
    namings: session.results.map((r) => ({
      nodeId: r.nodeId,
      originalName: r.originalName,
      suggestedName: r.suggestedName,
      confidence: r.confidence,
    })),
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=figma-namer-${sessionId}.json`);
  res.json(exportData);
});

function escapeCsv(str: string): string {
  return str.replace(/"/g, '""');
}

export default router;
