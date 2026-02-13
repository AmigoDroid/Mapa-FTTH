import type { MutableRefObject } from 'react';
import type { EndpointOption, EntityOption, EntityPosition } from './types';

interface CableNodeProps {
  entity: EntityOption;
  position: EntityPosition;
  endpoints: EndpointOption[];
  endpointRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onStartNodeDrag: (entityId: string, event: { clientX: number; clientY: number }) => void;
  onStartEndpointDrag: (endpointId: string) => void;
  onFinishEndpointDrag: (endpointId: string) => void;
  onDisconnectFusion: (fusionId: string) => void;
  onRemoveEntity: (entityId: string) => void;
}

export function CableNode({
  entity,
  position,
  endpoints,
  endpointRefs,
  onStartNodeDrag,
  onStartEndpointDrag,
  onFinishEndpointDrag,
  onDisconnectFusion,
  onRemoveEntity,
}: CableNodeProps) {
  const slots = Math.max(1, endpoints.length);
  const nodeWidth = 320;
  const boardHeight = Math.min(560, Math.max(170, slots * 18 + 64));
  const bodyWidth = 110;
  const bodyHeight = Math.min(170, Math.max(90, Math.round(boardHeight * 0.62)));
  const bodyX = 56;
  const bodyY = Math.round((boardHeight - bodyHeight) / 2);
  const portX = nodeWidth - 58;
  const wireStartX = bodyX + bodyWidth;
  const wireEndX = nodeWidth - 76;
  const getPortY = (index: number, total: number) => 12 + ((index + 1) * (boardHeight - 24)) / (total + 1);

  return (
    <div className="absolute select-none" style={{ left: position.x, top: position.y, width: `${nodeWidth}px` }}>
      <div className="mb-2 px-2 py-1 text-xs font-semibold bg-sky-100 border border-sky-300 rounded cursor-move flex items-center justify-between">
        <div
          className="flex-1"
          onMouseDown={(event) => {
            event.preventDefault();
            onStartNodeDrag(entity.id, event);
          }}
        >
          {entity.label}
        </div>
        <button
          type="button"
          className="ml-2 w-5 h-5 rounded border border-red-300 bg-white text-red-600 text-[11px] leading-none"
          onClick={() => onRemoveEntity(entity.id)}
          title="Remover cabo"
        >
          x
        </button>
      </div>

      <div className="relative rounded-xl border border-sky-200 bg-white/90 overflow-hidden" style={{ height: `${boardHeight}px` }}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {endpoints.map((_, index) => {
            const y = getPortY(index, slots);
            return <line key={`wire-${index}`} x1={wireStartX} y1={y} x2={wireEndX} y2={y} stroke="#334155" strokeWidth={1.5} />;
          })}
        </svg>

        <div
          className="absolute bg-sky-200 border-2 border-sky-700 rounded-xl flex flex-col items-center justify-center text-[10px] font-bold text-sky-900 shadow-sm"
          style={{ left: `${bodyX}px`, top: `${bodyY}px`, width: `${bodyWidth}px`, height: `${bodyHeight}px` }}
        >
          <span className="text-base leading-none">CABO</span>
          <span className="text-[9px] leading-3 tracking-wide">{endpoints.length} FIBRAS</span>
        </div>

        {endpoints.map((endpoint, index) => (
          <div key={endpoint.id}>
            <button
              ref={(node) => {
                endpointRefs.current[endpoint.id] = node;
              }}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onStartEndpointDrag(endpoint.id);
              }}
              onMouseUp={() => onFinishEndpointDrag(endpoint.id)}
              className="absolute -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-700 shadow"
              style={{
                left: `${portX}px`,
                top: `${getPortY(index, slots)}px`,
                backgroundColor: endpoint.colorHex,
                boxShadow: endpoint.fusionId ? '0 0 0 2px #16a34a' : undefined,
              }}
              title={`Fibra ${index + 1} (${endpoint.fusionId ? 'Ligada' : 'Livre'})`}
            />
            {endpoint.fusionId && (
              <button
                type="button"
                className="absolute -translate-y-1/2 w-4 h-4 leading-none rounded border border-red-300 text-red-600 bg-white text-[10px]"
                style={{ top: `${getPortY(index, slots)}px`, left: `${portX - 24}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDisconnectFusion(endpoint.fusionId as string);
                }}
                title={`Desfazer fusao fibra ${index + 1}`}
              >
                x
              </button>
            )}
            <div className="absolute -translate-y-1/2 text-[10px] text-slate-700 font-medium" style={{ right: '8px', top: `${getPortY(index, slots)}px` }}>
              F{index + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
