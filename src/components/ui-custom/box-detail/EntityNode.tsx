import type { MutableRefObject } from 'react';
import type { EndpointOption, EntityOption, EntityPosition } from './types';

interface EntityNodeProps {
  entity: EntityOption;
  position: EntityPosition;
  entityEndpoints: EndpointOption[];
  endpointRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  getEntityCardClass: (entityId: string) => string;
  endpointBadge: (endpoint: EndpointOption) => string;
  onStartNodeDrag: (entityId: string, event: { clientX: number; clientY: number }) => void;
  onStartEndpointDrag: (endpointId: string) => void;
  onFinishEndpointDrag: (endpointId: string) => void;
  onDisconnectFusion: (fusionId: string) => void;
  onLayoutSync: () => void;
  onRemoveEntity: (entityId: string) => void;
}

export function EntityNode({
  entity,
  position,
  entityEndpoints,
  endpointRefs,
  getEntityCardClass,
  endpointBadge,
  onStartNodeDrag,
  onStartEndpointDrag,
  onFinishEndpointDrag,
  onDisconnectFusion,
  onLayoutSync,
  onRemoveEntity,
}: EntityNodeProps) {
  return (
    <div className={`absolute w-64 border-2 rounded-lg shadow ${getEntityCardClass(entity.id)}`} style={{ left: position.x, top: position.y }}>
      <div className="px-3 py-2 border-b border-black/10 font-semibold text-sm cursor-move select-none flex items-center justify-between">
        <div
          className="flex-1"
          onMouseDown={(event) => {
            event.preventDefault();
            onStartNodeDrag(entity.id, event);
          }}
        >
          {entity.label}
        </div>
        {entity.type === 'cable' && (
          <button
            type="button"
            className="ml-2 w-5 h-5 rounded border border-red-300 bg-white text-red-600 text-[11px] leading-none"
            onClick={() => onRemoveEntity(entity.id)}
            title="Remover cabo"
          >
            x
          </button>
        )}
      </div>
      <div className="p-2 max-h-36 overflow-y-auto space-y-1 bg-white/80" onScroll={onLayoutSync}>
        {entityEndpoints.length === 0 ? (
          <div className="text-xs text-gray-500">Sem fibras</div>
        ) : (
          entityEndpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              ref={(node) => {
                endpointRefs.current[endpoint.id] = node as HTMLButtonElement | null;
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                onStartEndpointDrag(endpoint.id);
              }}
              onMouseUp={() => onFinishEndpointDrag(endpoint.id)}
              className={`w-full flex items-center justify-between text-left px-2 py-1 rounded border cursor-pointer ${endpointBadge(endpoint)}`}
            >
              <span className="text-xs flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: endpoint.colorHex, borderColor: '#555' }} />
                {endpoint.label}
              </span>
              <span className="text-[10px] flex items-center gap-1">
                {endpoint.fusionId ? 'Ligada' : 'Livre'}
                {endpoint.fusionId && (
                  <button
                    type="button"
                    className="w-4 h-4 leading-none rounded border border-red-300 text-red-600 bg-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnectFusion(endpoint.fusionId as string);
                    }}
                    title="Desfazer fusao desta fibra"
                  >
                    x
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
