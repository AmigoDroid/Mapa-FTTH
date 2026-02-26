import type { Network } from '@/types/ftth';

interface MapNetworkSummaryProps {
  network: Network | null;
}

export function MapNetworkSummary({ network }: MapNetworkSummaryProps) {
  if (!network) return null;

  return (
    <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
      <h3 className="font-bold text-sm">{network.name}</h3>
      <div className="text-xs text-gray-600 mt-1">
        <p>Caixas: {network.boxes.length}</p>
        <p>Reservas: {(network.reserves || []).length}</p>
        <p>Cabos: {network.cables.length}</p>
        <p>Fusoes: {network.fusions.length}</p>
      </div>
    </div>
  );
}
