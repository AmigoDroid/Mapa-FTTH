import type { MutableRefObject } from 'react';
import type { EndpointOption, EntityOption, EntityPosition } from './types';

interface BoxNodeProps {
  entity: EntityOption;
  position: EntityPosition;
  endpoints: EndpointOption[];
  endpointRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onStartNodeDrag: (entityId: string, event: { clientX: number; clientY: number }) => void;
  onStartEndpointDrag: (endpointId: string) => void;
  onFinishEndpointDrag: (endpointId: string) => void;
  onDisconnectFusion: (fusionId: string) => void;
}

export function BoxNode({
  entity,
  position,
  endpoints,
  endpointRefs,
  onStartNodeDrag,
  onStartEndpointDrag,
  onFinishEndpointDrag,
  onDisconnectFusion,
}: BoxNodeProps) {
  const count = endpoints.length;
  const cols = 1;
  const rows = Math.max(1, Math.ceil(count / cols));
  const nodeWidth = 260;
  const nodeHeight = Math.max(128, 82 + rows * 30);

  return (
    <div className="absolute select-none" style={{ left: position.x, top: position.y, width: `${nodeWidth}px` }}>
      <div
        className="mb-2 px-3 py-1.5 text-sm font-semibold bg-emerald-100 border border-emerald-300 rounded cursor-move"
        onMouseDown={(event) => {
          event.preventDefault();
          onStartNodeDrag(entity.id, event);
        }}
      >
        {entity.label}
      </div>

      <div className="rounded-xl border-2 border-emerald-300 bg-white/95 p-3" style={{ height: `${nodeHeight}px` }}>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {endpoints.map((endpoint, index) => (
            <div key={endpoint.id} className="flex items-center gap-1.5 min-w-0">
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
                className="w-3.5 h-3.5 rounded-full border-2 border-slate-700 shadow shrink-0"
                style={{
                  backgroundColor: endpoint.colorHex,
                  boxShadow: endpoint.fusionId ? '0 0 0 2px #16a34a' : undefined,
                }}
                title={`Fibra ${index + 1} (${endpoint.fusionId ? 'Ligada' : 'Livre'})`}
              />
              <span className="text-[10px] text-slate-700 truncate">{index + 1}</span>
              {endpoint.fusionId && (
                <button
                  type="button"
                  className="w-3.5 h-3.5 leading-none rounded border border-red-300 text-red-600 bg-white text-[9px] shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisconnectFusion(endpoint.fusionId as string);
                  }}
                  title={`Desfazer fusao fibra ${index + 1}`}
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
