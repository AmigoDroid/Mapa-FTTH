interface MapPointPickHintProps {
  active: boolean;
}

export function MapPointPickHint({ active }: MapPointPickHintProps) {
  if (!active) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1200] bg-blue-600 text-white px-3 py-2 rounded-md shadow">
      Clique no mapa para selecionar a posicao
    </div>
  );
}
