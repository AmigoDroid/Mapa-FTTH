import { describe, expect, it } from 'vitest';
import type { Box, Fiber, Fusion, Network, Pop } from '@/types/ftth';
import { FIBER_COLORS } from '@/types/ftth';
import {
  attachFusionToNetwork,
  calculateDistanceMeters,
  calculateGponLoss,
  detachFusionFromNetwork,
  generateFibers,
  getPopEndpointOwner,
  getSplitterPortCount,
} from '@/store/networkUtils';

const makeFiber = (id: string, number: number, status: Fiber['status'] = 'inactive'): Fiber => ({
  id,
  number,
  color: FIBER_COLORS[(number - 1) % 12],
  status,
});

const makeBox = (id: string, fiber: Fiber): Box => ({
  id,
  name: `BOX-${id}`,
  type: 'CTO',
  position: { lat: -15.0, lng: -47.0 },
  capacity: 12,
  fibers: [fiber],
  inputCables: [],
  outputCables: [],
  fusions: [],
  status: 'active',
});

const makeNetwork = (): Network => {
  const boxA = makeBox('box-a', makeFiber('fiber-a', 1));
  const boxB = makeBox('box-b', makeFiber('fiber-b', 1));

  return {
    id: 'net-1',
    name: 'Rede Teste',
    cities: [],
    pops: [],
    boxes: [boxA, boxB],
    reserves: [],
    cables: [],
    fusions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const makeFusion = (): Fusion => ({
  id: 'fus-1',
  fiberAId: 'fiber-a',
  fiberBId: 'fiber-b',
  boxAId: 'box-a',
  boxBId: 'box-b',
  position: { lat: -15.01, lng: -47.01 },
  fusionType: 'fusion',
  dateCreated: new Date().toISOString(),
});

describe('networkUtils', () => {
  it('generateFibers deve criar fibras com cores e tubos corretos', () => {
    const fibers = generateFibers(14, 1, 12);
    expect(fibers).toHaveLength(14);
    expect(fibers[0]?.number).toBe(1);
    expect(fibers[0]?.color.number).toBe(1);
    expect(fibers[11]?.tubeNumber).toBe(1);
    expect(fibers[12]?.tubeNumber).toBe(2);
  });

  it('calculateDistanceMeters deve retornar 0 para pontos iguais', () => {
    const d = calculateDistanceMeters({ lat: -15.79, lng: -47.88 }, { lat: -15.79, lng: -47.88 });
    expect(d).toBeCloseTo(0, 6);
  });

  it('calculateGponLoss deve aplicar o modelo esperado', () => {
    const loss = calculateGponLoss(1000, { emendas: 2, conectores: 1, splitterDb: 1.5 });
    expect(loss).toBeCloseTo(2.15, 6);
  });

  it('attachFusionToNetwork deve conectar fibras e atualizar estado', () => {
    const network = makeNetwork();
    const fusion = makeFusion();
    const next = attachFusionToNetwork(network, fusion);

    expect(next.fusions).toHaveLength(1);
    expect(next.boxes[0]?.fusions).toHaveLength(1);
    expect(next.boxes[1]?.fusions).toHaveLength(1);
    expect(next.boxes[0]?.fibers[0]?.connectedTo).toBe('fiber-b');
    expect(next.boxes[1]?.fibers[0]?.connectedTo).toBe('fiber-a');
    expect(next.boxes[0]?.fibers[0]?.status).toBe('active');
    expect(next.boxes[1]?.fibers[0]?.status).toBe('active');
  });

  it('detachFusionFromNetwork deve desconectar fibras e remover fusao', () => {
    const attached = attachFusionToNetwork(makeNetwork(), makeFusion());
    const next = detachFusionFromNetwork(attached, 'fus-1');

    expect(next.fusions).toHaveLength(0);
    expect(next.boxes[0]?.fusions).toHaveLength(0);
    expect(next.boxes[1]?.fusions).toHaveLength(0);
    expect(next.boxes[0]?.fibers[0]?.connectedTo).toBeUndefined();
    expect(next.boxes[1]?.fibers[0]?.connectedTo).toBeUndefined();
    expect(next.boxes[0]?.fibers[0]?.status).toBe('inactive');
    expect(next.boxes[1]?.fibers[0]?.status).toBe('inactive');
  });

  it('getPopEndpointOwner deve identificar o dono do endpoint POP', () => {
    const pop: Pop = {
      id: 'pop-1',
      cityId: 'city-1',
      name: 'POP-1',
      position: { lat: -15, lng: -47 },
      status: 'active',
      dios: [{ id: 'dio-1', name: 'DIO 1', portCount: 24 }],
      olts: [{ id: 'olt-1', name: 'OLT 1', type: 'compact', slots: [], uplinks: [] }],
      switches: [{ id: 'sw-1', name: 'SW 1', portCount: 24, uplinkPortCount: 4, ports: [], uplinks: [] }],
      routers: [{ id: 'rt-1', name: 'RTR 1', wanCount: 1, lanCount: 4, interfaces: [] }],
      cables: [{ id: 'cab-1', name: 'CAB 1', type: 'bigtail', fiberCount: 1, fibers: [makeFiber('f-pop', 1)], status: 'active' }],
      fusions: [],
    };

    expect(getPopEndpointOwner(pop, 'dio:dio-1:p:1')).toEqual({ kind: 'dio', id: 'dio-1' });
    expect(getPopEndpointOwner(pop, 'olt:olt-1:u:1')).toEqual({ kind: 'olt', id: 'olt-1' });
    expect(getPopEndpointOwner(pop, 'switch:sw-1:p:1')).toEqual({ kind: 'switch', id: 'sw-1' });
    expect(getPopEndpointOwner(pop, 'router:rt-1:wan:1')).toEqual({ kind: 'router', id: 'rt-1' });
    expect(getPopEndpointOwner(pop, 'cable:cab-1:f:1')).toEqual({ kind: 'cable', id: 'cab-1' });
    expect(getPopEndpointOwner(pop, 'dio:desconhecido:p:1')).toBeNull();
  });

  it('getSplitterPortCount deve interpretar proporcao de portas', () => {
    expect(getSplitterPortCount('1x8')).toEqual({ input: 1, output: 8 });
    expect(getSplitterPortCount('2x32')).toEqual({ input: 2, output: 32 });
  });
});
