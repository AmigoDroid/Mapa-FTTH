import { describe, expect, it } from 'vitest';
import type { Box, Pop } from '@/types/ftth';
import {
  buildCableTopologySummary,
  getDefaultBoxCapacity,
  getRecommendedCableGeometry,
  inferCableTypeFromEndpoints,
  orientCableEndpointsByHierarchy,
  resolveTopologyEndpointProfile,
  validateCableTypeForTopology,
} from '@/types/ftth/rules';

const boxes: Array<Pick<Box, 'id' | 'name' | 'type'>> = [
  { id: 'cto-1', name: 'CTO 1', type: 'CTO' },
  { id: 'ceo-1', name: 'CEO 1', type: 'CEO' },
  { id: 'dio-1', name: 'DIO 1', type: 'DIO' },
];

const pops: Array<Pick<Pop, 'id' | 'name'>> = [{ id: 'pop-1', name: 'POP 1' }];

const profile = (id: string) => resolveTopologyEndpointProfile(id, boxes, pops);

describe('ftth rules', () => {
  it('inferCableTypeFromEndpoints sugere feeder para POP -> CTO', () => {
    const suggested = inferCableTypeFromEndpoints(profile('pop-1'), profile('cto-1'));
    expect(suggested).toBe('feeder');
  });

  it('validateCableTypeForTopology bloqueia drop em ligacao com POP', () => {
    const validation = validateCableTypeForTopology('drop', profile('pop-1'), profile('cto-1'));
    expect(validation.blockers.length).toBeGreaterThan(0);
  });

  it('orientCableEndpointsByHierarchy inverte fluxo CTO -> POP para POP -> CTO', () => {
    const orientation = orientCableEndpointsByHierarchy('cto-1', 'pop-1', boxes, pops);
    expect(orientation.swapped).toBe(true);
    expect(orientation.startPoint).toBe('pop-1');
    expect(orientation.endPoint).toBe('cto-1');
  });

  it('getRecommendedCableGeometry retorna geometria de drop enxuta', () => {
    const geometry = getRecommendedCableGeometry('drop', profile('cto-1'), null);
    expect(geometry.looseTubeCount).toBe(1);
    expect(geometry.fibersPerTube).toBe(2);
    expect(geometry.fiberCount).toBe(1);
  });

  it('buildCableTopologySummary descreve modo e topologia', () => {
    const summary = buildCableTopologySummary(profile('ceo-1'), profile('cto-1'), 'distribution', false);
    expect(summary).toContain('modo inteligente');
    expect(summary).toContain('sugestao feeder');
  });

  it('getDefaultBoxCapacity retorna defaults por tipo', () => {
    expect(getDefaultBoxCapacity('CTO')).toBe(16);
    expect(getDefaultBoxCapacity('CEO')).toBe(48);
    expect(getDefaultBoxCapacity('DIO')).toBe(144);
  });
});

