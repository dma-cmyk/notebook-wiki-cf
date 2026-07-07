/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { GraphNode, GraphLink } from "../types";
import { ThemePreset } from "../App";
import { ZoomIn, ZoomOut, RefreshCw, Tag, Eye, EyeOff, Map as MapIcon } from "lucide-react";

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeSelect: (nodeId: string | null) => void;
  selectedNodeId?: string;
  activeTheme: ThemePreset;
}

interface PhysicsNode {
  id: string;
  title: string;
  tags: string[];
  type?: "memo" | "tag";
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function KnowledgeGraph({ nodes, links, onNodeSelect, selectedNodeId, activeTheme }: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  
  // Render trigger to let React create/destroy DOM nodes when the data structure changes
  const [renderTrigger, setRenderTrigger] = useState<number>(0);

  // Use refs for physical simulations to eliminate React state rendering lag (100% fluent drag & physics)
  const physicsNodesRef = useRef<PhysicsNode[]>([]);
  const dragCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const lastTouchRef = useRef<{ id: string; time: number } | null>(null);

  // Zoom & Pan states
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hasMoved, setHasMoved] = useState<boolean>(false);

  // Pinch zoom states for mobile
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [touchStartZoom, setTouchStartZoom] = useState<number>(1);

  // Tag toggle and minimap state (Default to false, hides tags to make it lighter/uncluttered)
  const [showTags, setShowTags] = useState<boolean>(false);
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const [isMinimapDragging, setIsMinimapDragging] = useState<boolean>(false);
  const minimapRef = useRef<SVGSVGElement>(null);

  // Filter nodes and links on the fly to avoid laggy performance and respect the tag toggle
  const filteredNodes = React.useMemo(() => {
    return showTags ? nodes : nodes.filter(n => n.type !== "tag");
  }, [nodes, showTags]);

  const filteredLinks = React.useMemo(() => {
    return showTags ? links : links.filter(link => {
      const s = nodes.find(n => n.id === link.source);
      const t = nodes.find(n => n.id === link.target);
      return s?.type !== "tag" && t?.type !== "tag";
    });
  }, [links, nodes, showTags]);

  // Initialize ResizeObserver to adapt to container size changes fluidly
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: width || 600, height: height || 400 });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync / Initialize Physics Nodes when props change
  useEffect(() => {
    const currentNodes = physicsNodesRef.current;
    const nodeMap = new Map<string, PhysicsNode>();
    currentNodes.forEach((n) => nodeMap.set(n.id, n));

    const updatedNodes: PhysicsNode[] = filteredNodes.map((n) => {
      const existing = nodeMap.get(n.id);
      if (existing) {
        return {
          ...existing,
          title: n.title,
          tags: n.tags,
          type: n.type,
        };
      } else {
        // Distribute nodes nicely
        const angle = Math.random() * Math.PI * 2;
        // Distribute tags slightly further out to keep layout spacious and organized
        const baseRadius = n.type === "tag" ? 160 : 70;
        const radius = baseRadius + Math.random() * 70;
        return {
          id: n.id,
          title: n.title,
          tags: n.tags,
          type: n.type,
          x: dimensions.width / 2 + Math.cos(angle) * radius,
          y: dimensions.height / 2 + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
        };
      }
    });

    physicsNodesRef.current = updatedNodes;
    setRenderTrigger((prev) => prev + 1);
  }, [filteredNodes]);

  // Main physics simulation loop via high-performance requestAnimationFrame
  useEffect(() => {
    let animationId: number;

    const step = () => {
      const next = physicsNodesRef.current;
      if (next.length === 0) {
        animationId = requestAnimationFrame(step);
        return;
      }

      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      // 1. Center gravity force (pull towards center gently)
      const gravity = 0.008;
      next.forEach((n) => {
        if (n.id === draggedNodeId) return;
        n.vx += (centerX - n.x) * gravity;
        n.vy += (centerY - n.y) * gravity;
      });

      // 2. Repulsion Force (anti-overlapping, Charge)
      for (let i = 0; i < next.length; i++) {
        const u = next[i];
        if (u.id === draggedNodeId) continue;

        for (let j = i + 1; j < next.length; j++) {
          const v = next[j];
          const dx = v.x - u.x;
          const dy = v.y - u.y;
          let distSq = dx * dx + dy * dy;
          // Clamp minimum distance square to avoid infinite/explosive division when overlapping
          if (distSq < 200) distSq = 200;
          const dist = Math.sqrt(distSq);

          const isBothTags = u.type === "tag" && v.type === "tag";
          const maxDist = isBothTags ? 80 : 150;
          const repulsionStrength = isBothTags ? 500 : 1300;

          if (dist < maxDist) {
            const force = repulsionStrength / (distSq + 25);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (u.id !== draggedNodeId) {
              u.vx -= fx;
              u.vy -= fy;
            }
            if (v.id !== draggedNodeId) {
              v.vx += fx;
              v.vy += fy;
            }
          }
        }
      }

      // 3. Link Spring Force
      const springStrength = 0.025;
      filteredLinks.forEach((link) => {
        const sourceNode = next.find((n) => n.id === link.source);
        const targetNode = next.find((n) => n.id === link.target);

        if (sourceNode && targetNode) {
          const dx = targetNode.x - sourceNode.x;
          const dy = targetNode.y - sourceNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const isTagLink = sourceNode.type === "tag" || targetNode.type === "tag";
          const targetLen = isTagLink ? 75 : 110;

          const force = (dist - targetLen) * springStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (sourceNode.id !== draggedNodeId) {
            sourceNode.vx += fx;
            sourceNode.vy += fy;
          }
          if (targetNode.id !== draggedNodeId) {
            targetNode.vx -= fx;
            targetNode.vy -= fy;
          }
        }
      });

      // 4. Update coordinates, apply damping, speed clippers and boundary constraints
      const damping = 0.82; // Optimal resistance friction to avoid vibration
      const maxSpeed = 10;   // Velocity clipper to prevent nodes from flying off screen

      next.forEach((n) => {
        if (n.id === draggedNodeId) {
          const dragCoords = dragCoordsRef.current;
          if (dragCoords) {
            n.x = dragCoords.x;
            n.y = dragCoords.y;
            n.vx = 0;
            n.vy = 0;
          }
        } else {
          // Clamp velocity speed
          const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
          if (speed > maxSpeed) {
            n.vx = (n.vx / speed) * maxSpeed;
            n.vy = (n.vy / speed) * maxSpeed;
          }

          n.x += n.vx;
          n.y += n.vy;
          n.vx *= damping;
          n.vy *= damping;

          // Keep within container boundary padding
          const margin = 20;
          if (n.x < margin) { n.x = margin; n.vx = 0; }
          if (n.x > dimensions.width - margin) { n.x = dimensions.width - margin; n.vx = 0; }
          if (n.y < margin) { n.y = margin; n.vy = 0; }
          if (n.y > dimensions.height - margin) { n.y = dimensions.height - margin; n.vy = 0; }
        }
      });

      // 5. Direct DOM Manipulation - Zero lag position updates bypass React render overhead entirely!
      next.forEach((node) => {
        const el = document.getElementById(`node-${node.id}`);
        if (el) {
          el.setAttribute("transform", `translate(${node.x}, ${node.y})`);
        }
      });

      filteredLinks.forEach((link, idx) => {
        const sourceNode = next.find((n) => n.id === link.source);
        const targetNode = next.find((n) => n.id === link.target);
        if (sourceNode && targetNode) {
          const el = document.getElementById(`link-${idx}`);
          if (el) {
            el.setAttribute("x1", sourceNode.x.toString());
            el.setAttribute("y1", sourceNode.y.toString());
            el.setAttribute("x2", targetNode.x.toString());
            el.setAttribute("y2", targetNode.y.toString());
          }
        }
      });

      animationId = requestAnimationFrame(step);
    };

    animationId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationId);
  }, [filteredLinks, dimensions, draggedNodeId]);

  // Coordinate Conversion Helper: screen pixel -> physics simulation coordinate
  const getPhysicsCoords = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    return {
      x: (mouseX - pan.x) / zoom,
      y: (mouseY - pan.y) / zoom,
    };
  };

  // Drag interaction events (for Nodes)
  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent triggering SVG canvas pan
    handleNodeStartDrag(nodeId, e.clientX, e.clientY);
  };

  const handleNodeStartDrag = (nodeId: string, clientX: number, clientY: number) => {
    setDraggedNodeId(nodeId);
    const coords = getPhysicsCoords(clientX, clientY);
    dragCoordsRef.current = coords;
  };

  // SVG Canvas Interaction Events (Pan and general Move)
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedNodeId) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setIsPanning(true);
    setPanStart({
      x: mouseX - pan.x,
      y: mouseY - pan.y,
    });
    setHasMoved(false);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedNodeId) {
      const coords = getPhysicsCoords(e.clientX, e.clientY);
      dragCoordsRef.current = coords;
    } else if (isPanning) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      setPan({
        x: mouseX - panStart.x,
        y: mouseY - panStart.y,
      });
      setHasMoved(true);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    if (draggedNodeId) {
      dragCoordsRef.current = null;
      setDraggedNodeId(null);
    }
  };

  // Wheel Zoom event
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = 1.06;
    let nextZoom = zoom;
    if (e.deltaY < 0) {
      nextZoom = Math.min(zoom * zoomFactor, 3); // max zoom 3x
    } else {
      nextZoom = Math.max(zoom / zoomFactor, 0.4); // min zoom 0.4x
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan((prev) => ({
        x: mouseX - (mouseX - prev.x) * (nextZoom / zoom),
        y: mouseY - (mouseY - prev.y) * (nextZoom / zoom),
      }));
    }
    setZoom(nextZoom);
  };

  // Zoom / Pan manual Controls
  const handleZoomIn = () => {
    const nextZoom = Math.min(zoom * 1.2, 3);
    if (containerRef.current) {
      const width = dimensions.width;
      const height = dimensions.height;
      setPan((prev) => ({
        x: width / 2 - (width / 2 - prev.x) * (nextZoom / zoom),
        y: height / 2 - (height / 2 - prev.y) * (nextZoom / zoom),
      }));
    }
    setZoom(nextZoom);
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(zoom / 1.2, 0.4);
    if (containerRef.current) {
      const width = dimensions.width;
      const height = dimensions.height;
      setPan((prev) => ({
        x: width / 2 - (width / 2 - prev.x) * (nextZoom / zoom),
        y: height / 2 - (height / 2 - prev.y) * (nextZoom / zoom),
      }));
    }
    setZoom(nextZoom);
  };

  const handleResetZoomAndPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mobile Swipe and Pinch gestures
  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (!draggedNodeId) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = touch.clientX - rect.left;
        const mouseY = touch.clientY - rect.top;

        setIsPanning(true);
        setPanStart({
          x: mouseX - pan.x,
          y: mouseY - pan.y,
        });
      }
    } else if (e.touches.length === 2) {
      setIsPanning(false);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
      setTouchStartDist(dist);
      setTouchStartZoom(zoom);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (draggedNodeId) {
        const coords = getPhysicsCoords(touch.clientX, touch.clientY);
        dragCoordsRef.current = coords;
      } else if (isPanning) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = touch.clientX - rect.left;
        const mouseY = touch.clientY - rect.top;
        setPan({
          x: mouseX - panStart.x,
          y: mouseY - panStart.y,
        });
      }
    } else if (e.touches.length === 2 && touchStartDist !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
      const factor = dist / touchStartDist;
      const nextZoom = Math.max(0.4, Math.min(3, touchStartZoom * factor));

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const centerY = (t1.clientY + t2.clientY) / 2 - rect.top;

        setPan((prev) => ({
          x: centerX - (centerX - prev.x) * (nextZoom / zoom),
          y: centerY - (centerY - prev.y) * (nextZoom / zoom),
        }));
      }
      setZoom(nextZoom);
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    setTouchStartDist(null);
    if (draggedNodeId) {
      dragCoordsRef.current = null;
      setDraggedNodeId(null);
    }
  };

  // Find connections for visual highlighting
  const activeNodeConnections = new Set<string>();
  if (hoveredNodeId || selectedNodeId) {
    const focusId = hoveredNodeId || selectedNodeId;
    filteredLinks.forEach((l) => {
      if (l.source === focusId) activeNodeConnections.add(l.target);
      if (l.target === focusId) activeNodeConnections.add(l.source);
    });
  }

  // ==================== MINIMAP CALCULATIONS ====================
  // Calculate bounding box containing all nodes
  const getMapBounds = () => {
    const pNodes = physicsNodesRef.current;
    if (pNodes.length === 0) {
      return { minX: 0, maxX: dimensions.width, minY: 0, maxY: dimensions.height };
    }
    let minX = Math.min(...pNodes.map((n) => n.x));
    let maxX = Math.max(...pNodes.map((n) => n.x));
    let minY = Math.min(...pNodes.map((n) => n.y));
    let maxY = Math.max(...pNodes.map((n) => n.y));
    
    // Add margin padding to look cleaner
    const pad = 100;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
    
    // Cover dimensions as minimum bounds
    minX = Math.min(minX, 0);
    maxX = Math.max(maxX, dimensions.width);
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, dimensions.height);
    
    return { minX, maxX, minY, maxY };
  };

  // Bounds for current render frame
  const bounds = getMapBounds();
  const mapW = bounds.maxX - bounds.minX;
  const mapH = bounds.maxY - bounds.minY;

  // Standard dimensions of minimap
  const minimapWidth = 140;
  const minimapHeight = 100;

  // Convert map coordinates to minimap coordinates
  const toMinimapCoords = (px: number, py: number) => {
    const xRatio = (px - bounds.minX) / (mapW || 1);
    const yRatio = (py - bounds.minY) / (mapH || 1);
    return {
      x: xRatio * minimapWidth,
      y: yRatio * minimapHeight,
    };
  };

  // Viewport calculations in physical coordinates
  const viewLeft = -pan.x / zoom;
  const viewTop = -pan.y / zoom;
  const viewWidth = dimensions.width / zoom;
  const viewHeight = dimensions.height / zoom;

  // Viewport rectangle coordinates on minimap
  const topLeft = toMinimapCoords(viewLeft, viewTop);
  const bottomRight = toMinimapCoords(viewLeft + viewWidth, viewTop + viewHeight);

  const rectX = topLeft.x;
  const rectY = topLeft.y;
  const rectW = bottomRight.x - topLeft.x;
  const rectH = bottomRight.y - topLeft.y;

  // Handle Minimap Drag & Move Operations
  const handleMinimapInteraction = (clientX: number, clientY: number) => {
    if (!minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const mx = Math.max(0, Math.min(clientX - rect.left, minimapWidth));
    const my = Math.max(0, Math.min(clientY - rect.top, minimapHeight));
    
    const px = bounds.minX + (mx / minimapWidth) * mapW;
    const py = bounds.minY + (my / minimapHeight) * mapH;
    
    setPan({
      x: dimensions.width / 2 - px * zoom,
      y: dimensions.height / 2 - py * zoom,
    });
    setHasMoved(true);
  };

  const handleMinimapMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMinimapDragging(true);
    handleMinimapInteraction(e.clientX, e.clientY);
  };

  const handleMinimapMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isMinimapDragging) return;
    e.preventDefault();
    e.stopPropagation();
    handleMinimapInteraction(e.clientX, e.clientY);
  };

  const handleMinimapMouseUpOrLeave = () => {
    setIsMinimapDragging(false);
  };

  const handleMinimapTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    e.stopPropagation();
    setIsMinimapDragging(true);
    if (e.touches.length === 1) {
      handleMinimapInteraction(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleMinimapTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!isMinimapDragging) return;
    e.stopPropagation();
    if (e.touches.length === 1) {
      handleMinimapInteraction(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[480px] border rounded-xl overflow-hidden select-none transition-colors duration-300 ${activeTheme.bg} ${activeTheme.border}`}
    >
      {nodes.length === 0 ? (
        <div className={`absolute inset-0 flex flex-col items-center justify-center p-8 text-center ${activeTheme.textMuted}`}>
          <p className="font-display font-medium mb-2 opacity-80">ナレッジグラフ</p>
          <p className="text-xs max-w-xs leading-relaxed opacity-60">
            メモがありません。左のメニューから新規メモを作成するか、API経由で登録してネットワークを視覚化してください。
          </p>
        </div>
      ) : (
        <>
          {/* Zoom controls float button panel */}
          <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
            <button
              onClick={handleZoomIn}
              title="拡大"
              className={`p-2 rounded-lg border shadow-sm cursor-pointer transition-all ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              title="縮小"
              className={`p-2 rounded-lg border shadow-sm cursor-pointer transition-all ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoomAndPan}
              title="表示をリセット"
              className={`p-2 rounded-lg border shadow-sm cursor-pointer transition-all ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            
            {/* Tag Show/Hide Toggler (Default to hidden) */}
            <button
              onClick={() => setShowTags(!showTags)}
              title={showTags ? "タグを非表示にする" : "タグを表示する"}
              className={`p-2 rounded-lg border shadow-sm cursor-pointer transition-all flex items-center justify-center ${
                showTags 
                  ? `${activeTheme.isDark ? "bg-emerald-950 text-emerald-400 border-emerald-800" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`
                  : `${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`
              }`}
            >
              <Tag className="w-4 h-4" />
            </button>

            {/* Minimap Show/Hide Toggler */}
            <button
              onClick={() => setShowMinimap(!showMinimap)}
              title={showMinimap ? "ミニマップを非表示にする" : "ミニマップを表示する"}
              className={`p-2 rounded-lg border shadow-sm cursor-pointer transition-all flex items-center justify-center ${
                showMinimap 
                  ? `${activeTheme.isDark ? "bg-indigo-950 text-indigo-400 border-indigo-800" : "bg-indigo-50 text-indigo-700 border-indigo-200"}`
                  : `${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`
              }`}
            >
              <MapIcon className="w-4 h-4" />
            </button>

            <div className={`text-[9px] font-mono font-bold text-center py-0.5 rounded ${activeTheme.tagBg} ${activeTheme.textMuted}`}>
              {Math.round(zoom * 100)}%
            </div>
          </div>

          <svg
            className={`w-full h-full ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={(e) => {
              if (e.target === e.currentTarget && !hasMoved) {
                onNodeSelect(null);
              }
            }}
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="18"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 2 L 8 5 L 0 8 z" fill={activeTheme.isDark ? "#64748b" : "#94a3b8"} />
              </marker>
              <marker
                id="arrow-highlight"
                viewBox="0 0 10 10"
                refX="18"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 2 L 8 5 L 0 8 z" fill={activeTheme.isDark ? "#818cf8" : "#4f46e5"} />
              </marker>
            </defs>

            {/* Scale & Pan Transform Group */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Draw Link Lines */}
              {filteredLinks.map((link, idx) => {
                const sourceNode = physicsNodesRef.current.find((n) => n.id === link.source);
                const targetNode = physicsNodesRef.current.find((n) => n.id === link.target);

                // Initial position fallbacks
                const x1 = sourceNode ? sourceNode.x : dimensions.width / 2;
                const y1 = sourceNode ? sourceNode.y : dimensions.height / 2;
                const x2 = targetNode ? targetNode.x : dimensions.width / 2;
                const y2 = targetNode ? targetNode.y : dimensions.height / 2;

                const isHighlighted =
                  (selectedNodeId && (link.source === selectedNodeId || link.target === selectedNodeId)) ||
                  (hoveredNodeId && (link.source === hoveredNodeId || link.target === hoveredNodeId));

                // Links connecting tags are styled thinner and with tighter dashes
                const isTagLink = (sourceNode && sourceNode.type === "tag") || (targetNode && targetNode.type === "tag");

                let strokeColor = "";
                if (isHighlighted) {
                  strokeColor = activeTheme.isDark ? "#818cf8" : "#4f46e5";
                } else if (activeTheme.isDark) {
                  strokeColor = isTagLink ? "#475569" : "#64748b";
                } else {
                  strokeColor = isTagLink ? "#cbd5e1" : "#94a3b8";
                }

                return (
                  <line
                    key={`link-${idx}`}
                    id={`link-${idx}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={strokeColor}
                    strokeWidth={isHighlighted ? 2.5 : (isTagLink ? 1.0 : 1.5)}
                    strokeDasharray={isHighlighted ? "none" : (isTagLink ? "2,3" : "4,4")}
                    markerEnd={isHighlighted ? "url(#arrow-highlight)" : "url(#arrow)"}
                    className="transition-colors duration-200"
                  />
                );
              })}

              {/* Draw Nodes */}
              {filteredNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isConnectedToFocus = activeNodeConnections.has(node.id);
                const isTag = node.type === "tag";

                const currentPhysicsNode = physicsNodesRef.current.find(n => n.id === node.id);
                const initialX = currentPhysicsNode ? currentPhysicsNode.x : dimensions.width / 2;
                const initialY = currentPhysicsNode ? currentPhysicsNode.y : dimensions.height / 2;

                // Design parameters base
                let r = isTag ? 6 : 8;
                let fill = "#ffffff";
                let stroke = "#cbd5e1";
                let strokeWidth = 1.5;

                if (isTag) {
                  // Style tag nodes distinctly (Emerald/Mint green accents)
                  if (isHovered) {
                    fill = activeTheme.isDark ? "#064e3b" : "#d1fae5";
                    stroke = activeTheme.isDark ? "#34d399" : "#059669";
                    strokeWidth = 2;
                    r = 8;
                  } else if (isConnectedToFocus) {
                    fill = activeTheme.isDark ? "#022c22" : "#ecfdf5";
                    stroke = activeTheme.isDark ? "#10b981" : "#10b981";
                    strokeWidth = 1.5;
                    r = 7;
                  } else {
                    fill = activeTheme.isDark ? "#022c22" : "#e6fbf1";
                    stroke = activeTheme.isDark ? "#10b981" : "#059669";
                    strokeWidth = 1.5;
                  }
                } else {
                  // Style standard memo nodes (Indigo accents)
                  if (isSelected) {
                    r = 11;
                    fill = activeTheme.graphNodeColor;
                    stroke = activeTheme.isDark ? "#ffffff" : "#1e1b4b";
                    strokeWidth = 2.5;
                  } else if (isHovered) {
                    r = 10;
                    fill = activeTheme.isDark ? "#ffffff" : activeTheme.graphNodeColor;
                    stroke = activeTheme.isDark ? activeTheme.graphNodeColor : "#ffffff";
                    strokeWidth = 2;
                  } else if (isConnectedToFocus) {
                    r = 9;
                    fill = activeTheme.isDark ? "#1e1b4b" : "#eef2ff";
                    stroke = activeTheme.graphNodeColor;
                    strokeWidth = 2;
                  } else {
                    fill = activeTheme.isDark ? "#1e293b" : "#ffffff";
                    stroke = activeTheme.graphNodeColor;
                    strokeWidth = 2;
                  }
                }

                return (
                  <g
                    key={node.id}
                    id={`node-${node.id}`}
                    transform={`translate(${initialX}, ${initialY})`}
                    className="cursor-pointer select-none"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onNodeSelect(node.id);
                    }}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      const now = Date.now();
                      const lastTouch = lastTouchRef.current;
                      if (lastTouch && lastTouch.id === node.id && now - lastTouch.time < 350) {
                        onNodeSelect(node.id);
                        lastTouchRef.current = null;
                      } else {
                        lastTouchRef.current = { id: node.id, time: now };
                      }

                      if (e.touches.length === 1) {
                        handleNodeStartDrag(node.id, e.touches[0].clientX, e.touches[0].clientY);
                      }
                    }}
                  >
                    {/* Visual shadow glow effect for active node */}
                    {(isSelected || isHovered) && (
                      <circle
                        cx={0}
                        cy={0}
                        r={r + (isTag ? 3 : 4)}
                        fill={isTag ? (activeTheme.isDark ? "#10b981" : "#10b981") : (activeTheme.isDark ? "#818cf8" : "#4f46e5")}
                        fillOpacity={0.15}
                      />
                    )}

                    {/* Node Visual Shape (Square for Tags, Circle for Memos) */}
                    {isTag ? (
                      <rect
                        x={-r}
                        y={-r}
                        width={r * 2}
                        height={r * 2}
                        rx={3}
                        transform="rotate(45)" // Rotate square into diamond
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        className="transition-all duration-150"
                      />
                    ) : (
                      <circle
                        cx={0}
                        cy={0}
                        r={r}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        className="transition-all duration-150"
                      />
                    )}

                    {/* Label Text */}
                    <text
                      x={0}
                      y={-r - 7}
                      textAnchor="middle"
                      className={`text-[10px] font-sans font-medium tracking-tight select-none pointer-events-none transition-all duration-150 ${
                        isSelected
                          ? `${activeTheme.isDark ? "fill-slate-100 font-semibold text-xs" : "fill-slate-950 font-semibold text-xs"}`
                          : isHovered
                          ? isTag
                            ? `${activeTheme.isDark ? "fill-emerald-300 font-semibold" : "fill-emerald-700 font-semibold"}`
                            : `${activeTheme.isDark ? "fill-slate-200 font-semibold" : "fill-slate-800 font-semibold"}`
                          : isTag
                          ? `${activeTheme.isDark ? "fill-emerald-400/90" : "fill-emerald-800"}`
                          : `${activeTheme.isDark ? "fill-slate-200" : "fill-slate-700"}`
                      }`}
                    >
                      {node.title.length > 15 ? node.title.slice(0, 15) + "..." : node.title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </>
      )}

      {/* Mini-legend overlays */}
      <div className={`absolute bottom-3 left-3 border rounded-lg px-2.5 py-1.5 text-[10px] space-y-1 select-none font-sans shadow-sm z-10 ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain}`}>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: activeTheme.graphNodeColor, borderColor: activeTheme.isDark ? "#ffffff" : "#1e1b4b" }}></span>
          <span>選択中（ダブルクリックで開く）</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: activeTheme.isDark ? "#1e1b4b" : "#eef2ff", borderColor: activeTheme.graphNodeColor }}></span>
          <span>接続ノード</span>
        </div>
        {showTags && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-md border" style={{ backgroundColor: activeTheme.isDark ? "#022c22" : "#e6fbf1", borderColor: activeTheme.isDark ? "#10b981" : "#059669", transform: "rotate(45deg)" }}></span>
            <span className="pl-1">タグノード（ダブルクリックで検索）</span>
          </div>
        )}
      </div>

      {/* Minimap Overlay (Bottom-Right) */}
      {showMinimap && filteredNodes.length > 0 && (
        <div 
          className={`absolute bottom-3 right-3 border rounded-lg p-1.5 shadow-md z-10 select-none transition-all duration-300 ${activeTheme.cardBg} ${activeTheme.border}`}
          style={{ width: `${minimapWidth + 14}px`, height: `${minimapHeight + 14}px` }}
        >
          <div className="w-full h-full relative overflow-hidden rounded border border-dashed border-slate-300/60 dark:border-slate-700/60">
            <svg
              ref={minimapRef}
              width={minimapWidth}
              height={minimapHeight}
              className="w-full h-full cursor-crosshair"
              onMouseDown={handleMinimapMouseDown}
              onMouseMove={handleMinimapMouseMove}
              onMouseUp={handleMinimapMouseUpOrLeave}
              onMouseLeave={handleMinimapMouseUpOrLeave}
              onTouchStart={handleMinimapTouchStart}
              onTouchMove={handleMinimapTouchMove}
              onTouchEnd={handleMinimapMouseUpOrLeave}
            >
              {/* Minimap background grid */}
              <rect width="100%" height="100%" fill={activeTheme.isDark ? "rgba(15, 23, 42, 0.4)" : "rgba(241, 245, 249, 0.4)"} />

              {/* Draw node dots on minimap */}
              {filteredNodes.map((n) => {
                const currentPhysicsNode = physicsNodesRef.current.find((pn) => pn.id === n.id);
                if (!currentPhysicsNode) return null;
                const mCoords = toMinimapCoords(currentPhysicsNode.x, currentPhysicsNode.y);
                const isTagNode = n.type === "tag";
                return (
                  <circle
                    key={`mini-${n.id}`}
                    cx={mCoords.x}
                    cy={mCoords.y}
                    r={isTagNode ? 1.5 : 2}
                    fill={isTagNode 
                      ? "#10b981" 
                      : (selectedNodeId === n.id ? "#ef4444" : activeTheme.graphNodeColor)
                    }
                    opacity={selectedNodeId === n.id ? 1 : 0.75}
                  />
                );
              })}

              {/* Viewport Boundary Rectangle on Minimap */}
              <rect
                x={rectX}
                y={rectY}
                width={rectW}
                height={rectH}
                fill="none"
                stroke={activeTheme.isDark ? "rgba(255, 255, 255, 0.55)" : "rgba(79, 70, 229, 0.65)"}
                strokeWidth={1.5}
                className="pointer-events-none transition-all duration-75"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
