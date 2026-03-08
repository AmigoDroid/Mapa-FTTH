import { describe, expect, it } from 'vitest';
import type { Fiber, Network } from '@/types/ftth';
import { FIBER_COLORS, resolveDefaultCableModel } from '@/types/ftth';
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
          vlans: undefined,
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
    expect(pon?.gbic.connector).toBe('APC');
    expect(normalized.pops[0]?.vlans).toEqual([]);
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
          vlans: [
            { id: 'vlan-1', vlanId: 100, name: 'Internet', serviceType: 'internet', mode: 'qinq', outerVlan: 2000, status: 'active' },
            { id: 'vlan-2', vlanId: 100, name: 'Duplicada', serviceType: 'iptv', mode: 'access', status: 'active' },
            { id: 'vlan-3', vlanId: 5000, name: 'Fora de faixa', serviceType: 'transport', mode: 'trunk', status: 'active' },
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
    expect(normalized.pops[0]?.vlans).toHaveLength(2);
    expect(normalized.pops[0]?.vlans?.[0]?.vlanId).toBe(100);
    expect(normalized.pops[0]?.vlans?.[1]?.vlanId).toBe(4094);
    expect(normalized.pops[0]?.cables[0]?.type).toBe('pigtail');

    expect(networkCable?.model).toBe(resolveDefaultCableModel('distribution'));
    expect(networkCable?.attachments).toEqual([]);
    expect(networkCable?.fiberCount).toBe(12);
    expect(networkCable?.fibersPerTube).toBe(12);
    expect(networkCable?.looseTubeCount).toBe(1);
    expect(networkCable?.fibers[12]?.tubeNumber).toBe(2);
  });

  it('normalizeImportedNetwork remove vinculo de DIO invalido em PIGTAIL', () => {
    const raw = {
      id: 'net-3',
      name: 'Rede 3',
      cities: [],
      pops: [
        {
          id: 'pop-1',
          cityId: 'city-1',
          name: 'POP 1',
          position: { lat: -15, lng: -47 },
          status: 'active',
          dios: [{ id: 'dio-1', name: 'DIO 1', portCount: 24 }],
          olts: [],
          switches: [],
          routers: [],
          cables: [
            {
              id: 'pop-cab-1',
              name: 'PIGTAIL valido',
              type: 'bigtail',
              fiberCount: 1,
              fibersPerTube: 12,
              looseTubeCount: 1,
              fibers: [makeFiber('pop-fib-1', 1)],
              status: 'active',
              dioId: 'dio-1',
            },
            {
              id: 'pop-cab-2',
              name: 'PIGTAIL invalido',
              type: 'bigtail',
              fiberCount: 1,
              fibersPerTube: 12,
              looseTubeCount: 1,
              fibers: [makeFiber('pop-fib-2', 1)],
              status: 'active',
              dioId: 'dio-inexistente',
            },
          ],
          vlans: [],
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
    const validCable = normalized.pops[0]?.cables.find((cable) => cable.id === 'pop-cab-1');
    const invalidCable = normalized.pops[0]?.cables.find((cable) => cable.id === 'pop-cab-2');

    expect(validCable?.dioId).toBe('dio-1');
    expect(invalidCable?.dioId).toBeUndefined();
    expect(validCable?.type).toBe('pigtail');
    expect(invalidCable?.type).toBe('pigtail');
  });
});
