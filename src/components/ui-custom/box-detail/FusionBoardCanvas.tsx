import type { MutableRefObject } from 'react';
import type { Fusion } from '@/types/ftth';
import { EntityNode } from './EntityNode';
import { CableNode } from './CableNode';
import { SplitterFtthNode } from './SplitterFtthNode';
import type { DragState, EndpointOption, EntityOption, EntityPosition } from './types';

interface FusionBoardCanvasProps {
  isFullscreen: boolean;
  entityOptions: EntityOption[];
  entityPositions: Record<string, EntityPosition>;
  endpointsByEntity: Record<string, EndpointOption[]>;
  endpointById: Record<string, EndpointOption>;
  boardConnections: Fusion[];
  dragState: DragState | null;
  layoutTick: number;
  zoom: number;
  sceneSize: { width: number; height: number };
  fusionBoardRef: MutableRefObject<HTMLDivElement | null>;
  fusionSceneRef: MutableRefObject<HTMLDivElement | null>;
  endpointRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  getEndpointPosition: (endpointId: string) => { x: number; y: number } | null;
  getEntityCardClass: (entityId: string) => string;
  endpointBadge: (endpoint: EndpointOption) => string;
  onStartNodeDrag: (entityId: string, event: { clientX: number; clientY: number }) => void;
  onStartEndpointDrag: (endpointId: string) => void;
  onFinishEndpointDrag: (endpointId: string) => void;
  onDisconnectFusion: (fusionId: string) => void;
  onLayoutSync: () => void;
  onRemoveEntity: (entityId: string) => void;
}

export function FusionBoardCanvas({
  isFullscreen,
  entityOptions,
  entityPositions,
  endpointsByEntity,
  endpointById,
  boardConnections,
  dragState,
  layoutTick,
  zoom,
  sceneSize,
  fusionBoardRef,
  fusionSceneRef,
  endpointRefs,
  getEndpointPosition,
  getEntityCardClass,
  endpointBadge,
  onStartNodeDrag,
  onStartEndpointDrag,
  onFinishEndpointDrag,
  onDisconnectFusion,
  onLayoutSync,
  onRemoveEntity,
}: FusionBoardCanvasProps) {
  const buildFlexiblePath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const bend = Math.max(30, Math.min(160, Math.abs(dx) * 0.55));
    const c1x = x1 + bend;
    const c2x = x2 - bend;
    return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div
      ref={fusionBoardRef}
      className="relative border rounded-xl bg-zinc-100 overflow-auto select-none"
      onScrollCapture={onLayoutSync}
      style={{
        width: '100%',
        height: isFullscreen ? 'calc(100vh - 280px)' : '360px',
        minHeight: '360px',
        userSelect: 'none',
      }}
    >
      <div style={{ width: `${sceneSize.width * zoom}px`, height: `${sceneSize.height * zoom}px` }}>
        <div
          ref={fusionSceneRef}
          className="relative origin-top-left"
          style={{
            width: `${sceneSize.width}px`,
            height: `${sceneSize.height}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {boardConnections.map((fusion) => {
              const start = getEndpointPosition(fusion.fiberAId);
              const end = getEndpointPosition(fusion.fiberBId);
              if (!start || !end) return null;
              const lineColor = endpointById[fusion.fiberAId]?.colorHex || '#2563eb';
              const path = buildFlexiblePath(start.x, start.y, end.x, end.y);
              return (
                <path
                  key={`${fusion.id}-${layoutTick}`}
                  d={path}
                  stroke={lineColor}
                  strokeWidth={3}
                  strokeOpacity={0.95}
                  fill="none"
                  strokeLinecap="round"
                />
              );
            })}
            {dragState && (() => {
              const start = getEndpointPosition(dragState.fromId);
              if (!start) return null;
              const path = buildFlexiblePath(start.x, start.y, dragState.x, dragState.y);
              return (
                <path
                  d={path}
                  stroke={endpointById[dragState.fromId]?.colorHex || '#0ea5e9'}
                  strokeWidth={3}
                  strokeDasharray="7 6"
                  fill="none"
                  strokeLinecap="round"
                />
              );
            })()}
          </svg>

          {boardConnections.map((fusion) => {
            const start = getEndpointPosition(fusion.fiberAId);
            const end = getEndpointPosition(fusion.fiberBId);
            if (!start || !end) return null;
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            return (
              <button
                key={`del-${fusion.id}-${layoutTick}`}
                type="button"
                className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-red-300 bg-white text-red-600 text-[10px] shadow"
                style={{ left: `${midX}px`, top: `${midY}px` }}
                title="Desfazer esta fusao"
                onClick={() => onDisconnectFusion(fusion.id)}
              >
                x
              </button>
            );
          })}

          {entityOptions.map((entity) => {
            const position = entityPositions[entity.id] || { x: 20, y: 20 };
            const entityEndpoints = endpointsByEntity[entity.id] || [];

            if (entity.type === 'splitter') {
              const inputEndpoints = entityEndpoints.filter((endpoint) => endpoint.label.startsWith('IN'));
              const outputEndpoints = entityEndpoints.filter((endpoint) => endpoint.label.startsWith('OUT'));
              return (
                <SplitterFtthNode
                  key={entity.id}
                  entity={entity}
                  position={position}
                  inputEndpoints={inputEndpoints}
                  outputEndpoints={outputEndpoints}
                  endpointRefs={endpointRefs}
                  onStartNodeDrag={onStartNodeDrag}
                  onStartEndpointDrag={onStartEndpointDrag}
                  onFinishEndpointDrag={onFinishEndpointDrag}
                  onDisconnectFusion={onDisconnectFusion}
                  onLayoutSync={onLayoutSync}
                  onRemoveEntity={onRemoveEntity}
                />
              );
            }

            if (entity.type === 'cable') {
              return (
                <CableNode
                  key={entity.id}
                  entity={entity}
                  position={position}
                  endpoints={entityEndpoints}
                  endpointRefs={endpointRefs}
                  onStartNodeDrag={onStartNodeDrag}
                  onStartEndpointDrag={onStartEndpointDrag}
                  onFinishEndpointDrag={onFinishEndpointDrag}
                  onDisconnectFusion={onDisconnectFusion}
                  onRemoveEntity={onRemoveEntity}
                />
              );
            }

            return (
              <EntityNode
                key={entity.id}
                entity={entity}
                position={position}
                entityEndpoints={entityEndpoints}
                endpointRefs={endpointRefs}
                getEntityCardClass={getEntityCardClass}
                endpointBadge={endpointBadge}
                onStartNodeDrag={onStartNodeDrag}
                onStartEndpointDrag={onStartEndpointDrag}
                onFinishEndpointDrag={onFinishEndpointDrag}
                onDisconnectFusion={onDisconnectFusion}
                onLayoutSync={onLayoutSync}
                onRemoveEntity={onRemoveEntity}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
