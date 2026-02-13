import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { FIBER_COLORS, CABLE_COLORS } from '@/types/ftth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FiberColorLegendProps {
  compact?: boolean;
}

export function FiberColorLegend({ compact = false }: FiberColorLegendProps) {
  const [showLegend, setShowLegend] = useState(!compact);
  const [activeTab, setActiveTab] = useState<'fibers' | 'cables'>('fibers');

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowLegend(!showLegend)}
              className="fixed bottom-4 right-4 z-[1000] shadow-lg"
            >
              <Info className="w-4 h-4 mr-1" />
              Cores
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Mostrar legenda de cores</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-[1000] shadow-lg w-80">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Legenda de Cores</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowLegend(false)}>
            <span className="sr-only">Fechar</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>
        <div className="flex gap-2 mt-2">
          <Button 
            variant={activeTab === 'fibers' ? 'default' : 'outline'} 
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setActiveTab('fibers')}
          >
            Fibras
          </Button>
          <Button 
            variant={activeTab === 'cables' ? 'default' : 'outline'} 
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setActiveTab('cables')}
          >
            Cabos
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === 'fibers' ? (
          <div className="space-y-1">
            <p className="text-xs text-gray-500 mb-2">Padrão TIA/EIA-598</p>
            <div className="grid grid-cols-2 gap-1">
              {FIBER_COLORS.map((color) => (
                <div 
                  key={color.number} 
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50"
                >
                  <div 
                    className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{color.number}. {color.name}</span>
                    <span className="text-[10px] text-gray-400">{color.code}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t text-xs text-gray-500">
              <p><strong>Nota:</strong> A cada 12 fibras, o padrão se repete com identificação de tubo diferente.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-2">Cores por tipo de cabo</p>
            {CABLE_COLORS.map((color) => (
              <div 
                key={color.name} 
                className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
              >
                <div 
                  className="w-6 h-6 rounded border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: color.hex }}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium">{color.name}</span>
                  <span className="text-[10px] text-gray-500 capitalize">{color.type}</span>
                </div>
              </div>
            ))}
            <div className="mt-3 pt-2 border-t text-xs text-gray-500">
              <p><strong>Dica:</strong> O tipo de cabo determina sua aplicação na rede FTTH.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Componente para mostrar a cor da fibra com tooltip
interface FiberColorIndicatorProps {
  color: typeof FIBER_COLORS[0];
  number: number;
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function FiberColorIndicator({ 
  color, 
  number, 
  showName = false,
  size = 'md' 
}: FiberColorIndicatorProps) {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <div 
              className={`${sizeClasses[size]} rounded-full border border-gray-300`}
              style={{ backgroundColor: color.hex }}
            />
            {showName && (
              <span className="text-xs">{color.name}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p className="font-semibold">Fibra {number}</p>
            <p>{color.name} ({color.code})</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Componente para visualização de tubo de fibra
interface FiberTubeProps {
  tubeNumber: number;
  fibers: typeof FIBER_COLORS;
}

export function FiberTube({ tubeNumber, fibers }: FiberTubeProps) {
  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600">Tubo {tubeNumber}</span>
        <span className="text-[10px] text-gray-400">12 fibras</span>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {fibers.map((color, index) => (
          <FiberColorIndicator 
            key={index} 
            color={color} 
            number={(tubeNumber - 1) * 12 + index + 1}
            size="sm"
          />
        ))}
      </div>
    </div>
  );
}
