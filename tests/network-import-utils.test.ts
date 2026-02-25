import { describe, expect, it } from 'vitest';
import type { Fiber, Network } from '@/types/ftth';
import { FIBER_COLORS } from '@/types/ftth';
import { normalizeImportedNetwork } from '@/store/networkImportUtils';

const makeFiber = (id: string, number: number): Fiber => ({
  id,
  number,
  color: FIBER_COLORS[(number - 1) % 12],
  status: 'inactive',
});

describe('networkImportUtils', () => {
  it('normalizeImportedNetwork cria defaults de OLT e normaliza PON', () => {
    const raw = {
      id: 'net-1',
      name: 'Rede 1',
      pops: [
        {
          id: 'pop-1',
          cityId: 'city-1',
          name: 'POP 1',
          position: { lat: -15, lng: -47 },
          status: 'active',
          dios: [],
          olts: [
            {
              id: 'olt-1',
              name: 'OLT 1',
              type: 'compact',
              slots: [
                {
                  id: 'slot-1',
                  pons: [
                    {
                      id: 'pon-1',
                      gbic: {},
                    },
                  ],
                },
              ],
              uplinks: [],
            },
          ],
          switches: [],
          routers: [],
          cables: [],
          fusions: [],
        },
      ],
      boxes: [],
      reserves: [],
      cables: [],
      fusions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Network;

    const normalized = normalizeImportedNetwork(raw);
    const olt = normalized.pops[0]?.olts[0];
    const slot = olt?.slots[0];
    const pon = slot?.pons[0];

    expect(olt?.uplinks).toHaveLength(2);
    expect(olt?.bootPorts).toEqual([]);
    expect(olt?.consolePorts).toEqual([]);
    expect(slot?.index).toBe(1);
    expect(pon?.index).toBe(1);
    expect(pon?.active).toBe(false);
    expect(pon?.gbic.connector).toBe('UPC');
  });

  it('normalizeImportedNetwork preserva uplink existente e saneia cabos', () => {
    const raw = {
      id: 'net-2',
      name: 'Rede 2',
      cities: [],
      pops: [
        {
          id: 'pop-1',
          cityId: 'city-1',
          name: 'POP 1',
          position: { lat: -15, lng: -47 },
          status: 'active',
          dios: [{ id: 'dio-1', name: 'DIO 1', portCount: 24 }],
          olts: [
            {
              id: 'olt-1',
              name: 'OLT 1',
              type: 'compact',
              slots: [],
              uplinks: [{ id: 'up-1', active: false }],
            },
          ],
          switches: [],
          routers: [],
          cables: [
            {
              id: 'pop-cab-1',
              name: 'POP CAB',
              type: 'bigtail',
              fiberCount: 12,
              fibersPerTube: 12,
              looseTubeCount: 1,
              fibers: [makeFiber('pop-fib-1', 1)],
              status: 'active',
            },
          ],
          fusions: [],
        },
      ],
      boxes: [],
      reserves: [],
      cables: [
        {
          id: 'cab-1',
          name: 'CAB 1',
          type: 'distribution',
          model: '',
          fiberCount: 14,
          looseTubeCount: 1,
          fibersPerTube: 12,
          fibers: Array.from({ length: 14 }, (_, idx) => makeFiber(`fib-${idx + 1}`, idx + 1)),
          startPoint: 'box-a',
          endPoint: 'box-b',
          path: [],
          length: 100,
          status: 'active',
          color: '#000000',
        },
      ],
      fusions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Network;

    const normalized = normalizeImportedNetwork(raw);
    const olt = normalized.pops[0]?.olts[0];
    const networkCable = normalized.cables[0];

    expect(olt?.uplinks).toHaveLength(1);
    expect(olt?.uplinks[0]?.active).toBe(false);
    expect(olt?.uplinks[0]?.index).toBe(1);
    expect(olt?.uplinks[0]?.connector).toBe('SFP+');
    expect(olt?.uplinks[0]?.speed).toBe('10G');

    expect(networkCable?.model).toBe('AS-80');
    expect(networkCable?.attachments).toEqual([]);
    expect(networkCable?.fiberCount).toBe(12);
    expect(networkCable?.fibersPerTube).toBe(12);
    expect(networkCable?.looseTubeCount).toBe(1);
    expect(networkCable?.fibers[12]?.tubeNumber).toBe(2);
  });
});
