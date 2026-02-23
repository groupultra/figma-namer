// ============================================================
// Figma Namer - CanvasPreview Component
// Displays a zoomable/scrollable SoM-marked screenshot
// Supports clicking on marked regions to jump to naming results
// ============================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { SoMLabel } from '../../shared/types';

interface CanvasPreviewProps {
  /** Base64-encoded PNG image with SoM markings */
  imageBase64: string;
  /** Image dimensions */
  imageWidth: number;
  imageHeight: number;
  /** Optional: SoM labels for clickable regions */
  labels?: SoMLabel[];
  /** Callback when a label region is clicked */
  onLabelClick?: (markId: number, nodeId: string) => void;
  /** Optional: currently highlighted mark ID */
  highlightedMarkId?: number | null;
  /** Max container height */
  maxHeight?: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;

export const CanvasPreview: React.FC<CanvasPreviewProps> = ({
  imageBase64,
  imageWidth,
  imageHeight,
  labels,
  onLabelClick,
  highlightedMarkId,
  maxHeight = 300,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

  // Compute initial zoom to fit the container width
  useEffect(() => {
    if (containerRef.current && imageWidth > 0) {
      const containerWidth = containerRef.current.clientWidth;
      const fitZoom = containerWidth / imageWidth;
      setZoom(Math.min(fitZoom, 1));
    }
  }, [imageWidth]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => {
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    if (containerRef.current) {
      setScrollStart({
        x: containerRef.current.scrollLeft,
        y: containerRef.current.scrollTop,
      });
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      containerRef.current.scrollLeft = scrollStart.x - dx;
      containerRef.current.scrollTop = scrollStart.y - dy;
    },
    [isDragging, dragStart, scrollStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleLabelClick = useCallback(
    (markId: number, nodeId: string) => {
      if (onLabelClick) {
        onLabelClick(markId, nodeId);
      }
    },
    [onLabelClick],
  );

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  const zoomFit = () => {
    if (containerRef.current && imageWidth > 0) {
      const containerWidth = containerRef.current.clientWidth;
      setZoom(Math.min(containerWidth / imageWidth, 1));
    }
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div style={styles.wrapper}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <span style={styles.toolbarLabel}>SoM Preview</span>
        <div style={styles.zoomControls}>
          <button style={styles.zoomBtn} onClick={zoomOut} title="Zoom out">-</button>
          <span style={styles.zoomText}>{zoomPercent}%</span>
          <button style={styles.zoomBtn} onClick={zoomIn} title="Zoom in">+</button>
          <button style={styles.zoomBtn} onClick={zoomFit} title="Fit to width">Fit</button>
        </div>
      </div>

      {/* Scrollable / draggable canvas */}
      <div
        ref={containerRef}
        style={{
          ...styles.container,
          maxHeight,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            position: 'relative',
            width: imageWidth * zoom,
            height: imageHeight * zoom,
            flexShrink: 0,
          }}
        >
          <img
            src={`data:image/png;base64,${imageBase64}`}
            alt="SoM marked canvas"
            style={{
              width: imageWidth * zoom,
              height: imageHeight * zoom,
              display: 'block',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            draggable={false}
          />

          {/* Clickable label regions */}
          {labels?.map((label) => {
            const isHighlighted = highlightedMarkId === label.markId;
            return (
              <div
                key={label.markId}
                title={`#${label.markId} - ${label.originalName}`}
                style={{
                  position: 'absolute',
                  left: label.highlightBox.x * zoom,
                  top: label.highlightBox.y * zoom,
                  width: label.highlightBox.width * zoom,
                  height: label.highlightBox.height * zoom,
                  border: isHighlighted
                    ? '2px solid var(--color-primary)'
                    : '1px solid transparent',
                  background: isHighlighted
                    ? 'rgba(13,153,255,0.12)'
                    : 'transparent',
                  cursor: 'pointer',
                  borderRadius: 2,
                  transition: 'all 0.15s ease',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleLabelClick(label.markId, label.nodeId);
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    'rgba(13,153,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = isHighlighted
                    ? 'rgba(13,153,255,0.12)'
                    : 'transparent';
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---- Styles ----

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border)',
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  zoomControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  zoomBtn: {
    width: 24,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 3,
    background: 'transparent',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: 0,
  },
  zoomText: {
    fontSize: 10,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
    minWidth: 32,
    textAlign: 'center' as const,
  },
  container: {
    overflow: 'auto',
    background: '#f0f0f0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
};
