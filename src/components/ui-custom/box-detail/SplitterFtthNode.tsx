import type { MutableRefObject } from 'react';
import type { EndpointOption, EntityOption, EntityPosition } from './types';

interface SplitterFtthNodeProps {
  entity: EntityOption;
  position: EntityPosition;
  inputEndpoints: EndpointOption[];
  outputEndpoints: EndpointOption[];
  endpointRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onStartNodeDrag: (entityId: string, event: { clientX: number; clientY: number }) => void;
  onStartEndpointDrag: (endpointId: string) => void;
  onFinishEndpointDrag: (endpointId: string) => void;
  onDisconnectFusion: (fusionId: string) => void;
  onLayoutSync: () => void;
  onRemoveEntity: (entityId: string) => void;
}

export function SplitterFtthNode({
  entity,
  position,
  inputEndpoints,
  outputEndpoints,
  endpointRefs,
  onStartNodeDrag,
  onStartEndpointDrag,
  onFinishEndpointDrag,
  onDisconnectFusion,
  onLayoutSync,
  onRemoveEntity,
}: SplitterFtthNodeProps) {
  const ratio = entity.label.match(/\((\d+x\d+)\)/)?.[1] || '1x8';
  const [inCountRaw, outCountRaw] = ratio.split('x');
  const inCount = Number.parseInt(inCountRaw, 10) || Math.max(1, inputEndpoints.length || 1);
  const outCount = Number.parseInt(outCountRaw, 10) || Math.max(2, outputEndpoints.length || 2);
  const inSlots = Math.max(inCount, inputEndpoints.length);
  const outSlots = Math.max(outCount, outputEndpoints.length);

  const nodeWidth = outSlots >= 16 ? 360 : outSlots >= 8 ? 340 : 320;
  const boardHeight = Math.min(560, Math.max(170, outSlots * 18 + 64));
  const bodyWidth = outSlots >= 16 ? 110 : 100;
  const bodyHeight = Math.min(170, Math.max(90, Math.round(boardHeight * 0.62)));
  const bodyX = Math.round((nodeWidth - bodyWidth) / 2 - 18);
  const bodyY = Math.round((boardHeight - bodyHeight) / 2);
  const leftPortX = 10;
  const rightPortX = nodeWidth - 58;
  const inWireEndX = bodyX;
  const outWireStartX = bodyX + bodyWidth;
  const outWireEndX = nodeWidth - 76;
  const getPortY = (index: number, total: number) => 12 + ((index + 1) * (boardHeight - 24)) / (total + 1);

  return (
    <div className="absolute select-none" style={{ left: position.x, top: position.y, width: `${nodeWidth}px` }}>
      <div className="mb-2 px-2 py-1 text-xs font-semibold bg-slate-100 border border-slate-300 rounded cursor-move flex items-center justify-between">
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
          title="Remover splitter"
        >
          x
        </button>
      </div>

      <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden" style={{ height: `${boardHeight}px` }} onScroll={onLayoutSync}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {Array.from({ length: inSlots }).map((_, index) => {
            const y = getPortY(index, inSlots);
            return (
              <line key={`in-wire-${index}`} x1={leftPortX + 14} y1={y} x2={inWireEndX} y2={y} stroke="#334155" strokeWidth={1.5} />
            );
          })}
          {Array.from({ length: outSlots }).map((_, index) => {
            const y = getPortY(index, outSlots);
            return (
              <line key={`out-wire-${index}`} x1={outWireStartX} y1={y} x2={outWireEndX} y2={y} stroke="#334155" strokeWidth={1.5} />
            );
          })}
        </svg>

        <div
          className="absolute bg-slate-200 border-2 border-slate-700 rounded-xl flex flex-col items-center justify-center text-[10px] font-bold text-slate-800 shadow-sm"
          style={{ left: `${bodyX}px`, top: `${bodyY}px`, width: `${bodyWidth}px`, height: `${bodyHeight}px` }}
        >
          <span className="text-lg leading-none">{ratio}</span>
          <span className="text-[9px] leading-3 tracking-wide">BALANCED</span>
          <span className="text-[9px] leading-3 tracking-wide text-slate-500">CONAPC</span>
        </div>

        {Array.from({ length: inSlots }).map((_, index) => {
          const endpoint = inputEndpoints[index];
          if (!endpoint) {
            return (
              <div
                key={`in-placeholder-${index}`}
                className="absolute -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-600 bg-white/70"
                style={{ left: `${leftPortX}px`, top: `${getPortY(index, inSlots)}px` }}
                title={`IN ${index + 1}`}
              />
            );
          }
          return (
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
                className="absolute -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-700 bg-white shadow"
                style={{
                  left: `${leftPortX}px`,
                  top: `${getPortY(index, inSlots)}px`,
                  boxShadow: endpoint.fusionId ? '0 0 0 2px #16a34a' : undefined,
                }}
                title={`IN ${index + 1} (${endpoint.fusionId ? 'Ligada' : 'Livre'})`}
              />
              {endpoint.fusionId && (
                <button
                  type="button"
                  className="absolute -translate-y-1/2 w-4 h-4 leading-none rounded border border-red-300 text-red-600 bg-white text-[10px]"
                  style={{ left: `${leftPortX + 24}px`, top: `${getPortY(index, inSlots)}px` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisconnectFusion(endpoint.fusionId as string);
                  }}
                  title={`Desfazer fusao IN ${index + 1}`}
                >
                  x
                </button>
              )}
            </div>
          );
        })}

        {Array.from({ length: outSlots }).map((_, index) => {
          const endpoint = outputEndpoints[index];
          if (!endpoint) {
            return (
              <div
                key={`out-placeholder-${index}`}
                className="absolute -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-600 bg-white/70"
                style={{ left: `${rightPortX}px`, top: `${getPortY(index, outSlots)}px` }}
                title={`OUT ${index + 1}`}
              />
            );
          }
          return (
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
                  left: `${rightPortX}px`,
                  top: `${getPortY(index, outSlots)}px`,
                  backgroundColor: endpoint.colorHex,
                  boxShadow: endpoint.fusionId ? '0 0 0 2px #16a34a' : undefined,
                }}
                title={`OUT ${index + 1} (${endpoint.fusionId ? 'Ligada' : 'Livre'})`}
              />
              {endpoint.fusionId && (
                <button
                  type="button"
                  className="absolute -translate-y-1/2 w-4 h-4 leading-none rounded border border-red-300 text-red-600 bg-white text-[10px]"
                  style={{ top: `${getPortY(index, outSlots)}px`, left: `${rightPortX - 24}px` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisconnectFusion(endpoint.fusionId as string);
                  }}
                  title={`Desfazer fusao OUT ${index + 1}`}
                >
                  x
                </button>
              )}
            </div>
          );
        })}

        {Array.from({ length: outSlots }).map((_, index) => (
          <div
            key={`out-label-${index}`}
            className="absolute -translate-y-1/2 text-[10px] text-slate-700 font-medium"
            style={{ left: `${nodeWidth - 18}px`, top: `${getPortY(index, outSlots)}px` }}
          >
            L{index + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
