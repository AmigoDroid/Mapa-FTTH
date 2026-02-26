import type { Box, Cable, Pop } from './entities';

export interface BoxTypeBehavior {
  type: Box['type'];
  label: string;
  purpose: string;
  hierarchy: number;
  defaultCapacity: number;
  recommendedCapacities: number[];
}

const BOX_TYPE_BEHAVIORS: Record<Box['type'], BoxTypeBehavior> = {
  CTO: {
    type: 'CTO',
    label: 'Caixa de Terminacao Optica',
    purpose: 'Ponto de atendimento de acesso com derivacao para drop.',
    hierarchy: 1,
    defaultCapacity: 16,
    recommendedCapacities: [8, 12, 16, 24, 32],
  },
  CEO: {
    type: 'CEO',
    label: 'Caixa de Emenda Optica',
    purpose: 'Ponto de emenda/derivacao da rede de distribuicao.',
    hierarchy: 3,
    defaultCapacity: 48,
    recommendedCapacities: [24, 36, 48, 72, 96, 144, 288],
  },
  DIO: {
    type: 'DIO',
    label: 'Distribuidor Interno Optico',
    purpose: 'Painel interno de manobra em POP/central.',
    hierarchy: 4,
    defaultCapacity: 144,
    recommendedCapacities: [24, 48, 72, 96, 144, 288],
  },
};

const CABLE_TYPE_BEHAVIORS: Record<
  Cable['type'],
  {
    type: Cable['type'];
    label: string;
    purpose: string;
    fiberCount: number;
    looseTubeCount: number;
    fibersPerTube: number;
  }
> = {
  drop: {
    type: 'drop',
    label: 'Drop',
    purpose: 'Ligacao final entre acesso e assinante.',
    fiberCount: 2,
    looseTubeCount: 1,
    fibersPerTube: 2,
  },
  distribution: {
    type: 'distribution',
    label: 'Distribuicao',
    purpose: 'Distribui fibras entre caixas da malha de acesso.',
    fiberCount: 24,
    looseTubeCount: 2,
    fibersPerTube: 12,
  },
  feeder: {
    type: 'feeder',
    label: 'Feeder',
    purpose: 'Alimenta caixas de acesso a partir da rede principal.',
    fiberCount: 48,
    looseTubeCount: 4,
    fibersPerTube: 12,
  },
  backbone: {
    type: 'backbone',
    label: 'Backbone',
    purpose: 'Transporte principal entre POP, DIO e distribuicao.',
    fiberCount: 96,
    looseTubeCount: 8,
    fibersPerTube: 12,
  },
};

type EndpointDomain = 'core' | 'distribution' | 'access';

const getDomainForBoxType = (type: Box['type']): EndpointDomain => {
  if (type === 'CTO') return 'access';
  if (type === 'CEO') return 'distribution';
  return 'core';
};

const POP_HIERARCHY = 5;

export interface TopologyEndpointProfile {
  id: string;
  name: string;
  kind: 'box' | 'pop';
  domain: EndpointDomain;
  hierarchy: number;
  boxType?: Box['type'];
}

export interface CableTopologyValidation {
  blockers: string[];
  warnings: string[];
}

export interface CableGeometrySuggestion {
  fiberCount: number;
  looseTubeCount: number;
  fibersPerTube: number;
}

export interface EndpointOrientationResult {
  startPoint: string;
  endPoint: string;
  swapped: boolean;
  reason?: string;
}

const formatEndpointLabel = (endpoint?: TopologyEndpointProfile | null): string => {
  if (!endpoint) return 'sem endpoint';
  if (endpoint.kind === 'pop') return `${endpoint.name} (POP)`;
  return `${endpoint.name} (${endpoint.boxType})`;
};

export const getBoxTypeBehavior = (type: Box['type']): BoxTypeBehavior => BOX_TYPE_BEHAVIORS[type];

export const getDefaultBoxCapacity = (type: Box['type']): number =>
  BOX_TYPE_BEHAVIORS[type].defaultCapacity;

export const getRecommendedBoxCapacities = (type: Box['type']): number[] =>
  BOX_TYPE_BEHAVIORS[type].recommendedCapacities;

export const getCableTypeBehavior = (type: Cable['type']) => CABLE_TYPE_BEHAVIORS[type];

export const resolveTopologyEndpointProfile = (
  endpointId: string,
  boxes: Pick<Box, 'id' | 'name' | 'type'>[],
  pops: Pick<Pop, 'id' | 'name'>[]
): TopologyEndpointProfile | null => {
  if (!endpointId) return null;

  const box = boxes.find((item) => item.id === endpointId);
  if (box) {
    const behavior = getBoxTypeBehavior(box.type);
    return {
      id: box.id,
      name: box.name,
      kind: 'box',
      boxType: box.type,
      hierarchy: behavior.hierarchy,
      domain: getDomainForBoxType(box.type),
    };
  }

  const pop = pops.find((item) => item.id === endpointId);
  if (pop) {
    return {
      id: pop.id,
      name: pop.name,
      kind: 'pop',
      hierarchy: POP_HIERARCHY,
      domain: 'core',
    };
  }

  return null;
};

export const inferCableTypeFromEndpoints = (
  start?: TopologyEndpointProfile | null,
  end?: TopologyEndpointProfile | null
): Cable['type'] => {
  if (!start && !end) return 'distribution';

  if (!start || !end) {
    const endpoint = start || end;
    if (!endpoint) return 'distribution';
    if (endpoint.kind === 'pop') return 'backbone';
    if (endpoint.boxType === 'CTO') return 'drop';
    if (endpoint.boxType === 'CEO') return 'feeder';
    return 'backbone';
  }

  if (start.kind === 'pop' && end.kind === 'pop') return 'backbone';

  if (start.kind === 'pop' || end.kind === 'pop') {
    const other = start.kind === 'pop' ? end : start;
    if (other.kind === 'box' && other.boxType === 'CTO') return 'feeder';
    return 'backbone';
  }

  const startType = start.boxType!;
  const endType = end.boxType!;

  if (startType === 'CTO' && endType === 'CTO') return 'distribution';
  if (startType === 'CTO' || endType === 'CTO') return 'feeder';
  if (startType === 'DIO' && endType === 'DIO') return 'backbone';
  if (
    (startType === 'DIO' && endType === 'CEO') ||
    (startType === 'CEO' && endType === 'DIO')
  ) {
    return 'backbone';
  }
  return 'distribution';
};

export const validateCableTypeForTopology = (
  type: Cable['type'],
  start?: TopologyEndpointProfile | null,
  end?: TopologyEndpointProfile | null
): CableTopologyValidation => {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (start && end && start.id === end.id) {
    blockers.push('Origem e destino nao podem ser iguais.');
  }

  if (type === 'drop') {
    if (start?.kind === 'pop' || end?.kind === 'pop') {
      blockers.push('Cabo drop nao deve ligar diretamente em POP.');
    }
    if (start && end && start.boxType !== 'CTO' && end.boxType !== 'CTO') {
      blockers.push('Cabo drop deve envolver ao menos uma CTO.');
    }
    if (start?.boxType === 'CTO' && end?.boxType === 'CTO') {
      warnings.push('Ligacao CTO-CTO normalmente usa distribuicao, nao drop.');
    }
  }

  if (type === 'backbone' && (start?.boxType === 'CTO' || end?.boxType === 'CTO')) {
    warnings.push('Backbone chegando em CTO foge do padrao operacional.');
  }

  if (type === 'distribution' && (start?.kind === 'pop' || end?.kind === 'pop')) {
    warnings.push('Distribuicao com POP costuma ser modelada como feeder/backbone.');
  }

  if (type === 'feeder' && start?.kind === 'pop' && end?.kind === 'pop') {
    warnings.push('Ligacao POP-POP costuma ser backbone.');
  }

  if (start && end) {
    const suggested = inferCableTypeFromEndpoints(start, end);
    if (suggested !== type) {
      warnings.push(`Topologia sugere cabo ${suggested} para esta ligacao.`);
    }
  }

  return { blockers, warnings };
};

export const getRecommendedCableGeometry = (
  type: Cable['type'],
  start?: TopologyEndpointProfile | null,
  end?: TopologyEndpointProfile | null
): CableGeometrySuggestion => {
  const base = CABLE_TYPE_BEHAVIORS[type];

  if (type === 'drop') {
    const hasCto = start?.boxType === 'CTO' || end?.boxType === 'CTO';
    return {
      fiberCount: hasCto ? 1 : base.fiberCount,
      looseTubeCount: 1,
      fibersPerTube: 2,
    };
  }

  if (
    type === 'feeder' &&
    (start?.boxType === 'CTO' || end?.boxType === 'CTO') &&
    start?.kind !== 'pop' &&
    end?.kind !== 'pop'
  ) {
    return {
      fiberCount: 24,
      looseTubeCount: 2,
      fibersPerTube: 12,
    };
  }

  return {
    fiberCount: base.fiberCount,
    looseTubeCount: base.looseTubeCount,
    fibersPerTube: base.fibersPerTube,
  };
};

export const orientCableEndpointsByHierarchy = (
  startPoint: string,
  endPoint: string,
  boxes: Pick<Box, 'id' | 'name' | 'type'>[],
  pops: Pick<Pop, 'id' | 'name'>[]
): EndpointOrientationResult => {
  if (!startPoint || !endPoint || startPoint === endPoint) {
    return { startPoint, endPoint, swapped: false };
  }

  const start = resolveTopologyEndpointProfile(startPoint, boxes, pops);
  const end = resolveTopologyEndpointProfile(endPoint, boxes, pops);
  if (!start || !end) {
    return { startPoint, endPoint, swapped: false };
  }

  if (start.hierarchy >= end.hierarchy) {
    return { startPoint, endPoint, swapped: false };
  }

  return {
    startPoint: endPoint,
    endPoint: startPoint,
    swapped: true,
    reason: `Orientacao invertida para manter fluxo de ${formatEndpointLabel(end)} para ${formatEndpointLabel(start)}.`,
  };
};

export const buildCableTopologySummary = (
  start?: TopologyEndpointProfile | null,
  end?: TopologyEndpointProfile | null,
  currentType?: Cable['type'],
  manualControl: boolean = false
): string => {
  const suggested = inferCableTypeFromEndpoints(start, end);
  const fromLabel = formatEndpointLabel(start);
  const toLabel = formatEndpointLabel(end);
  const modeLabel = manualControl ? 'manual' : 'inteligente';

  if (!start && !end) {
    return `Cabo livre | modo ${modeLabel} | sugestao ${suggested}.`;
  }

  if (start && !end) {
    return `Saida em ${fromLabel} | modo ${modeLabel} | sugestao ${suggested}.`;
  }

  if (!start && end) {
    return `Chegada em ${toLabel} | modo ${modeLabel} | sugestao ${suggested}.`;
  }

  if (currentType && currentType !== suggested) {
    return `${fromLabel} -> ${toLabel} | sugestao ${suggested} (atual ${currentType}) | modo ${modeLabel}.`;
  }

  return `${fromLabel} -> ${toLabel} | tipo ${suggested} | modo ${modeLabel}.`;
};

