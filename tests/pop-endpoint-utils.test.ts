import { describe, expect, it } from 'vitest';
import type { Fiber, Pop, PopCable, PopFusion } from '@/types/ftth';
import { FIBER_COLORS } from '@/types/ftth';
import {
  applyPopFusionToCables,
  buildPopFusion,
  canConnectPopEndpoints,
  clearPopFusionFromCables,
} from '@/store/popEndpointUtils';

const makeFiber = (id: string, number: number): Fiber => ({
  id,
  number,
  color: FIBER_COLORS[(number - 1) % 12],
  status: 'inactive',
});

const makePopCable = (id: string, name: string): PopCable => ({
  id,
  name,
  type: 'pigtail',
  fiberCount: 1,
  looseTubeCount: 1,
  fibersPerTube: 12,
  fibers: [makeFiber(`fiber-${id}`, 1)],
  status: 'active',
});

const makePop = (overrides: Partial<Pop> = {}): Pop => ({
  id: 'pop-1',
  cityId: 'city-1',
  name: 'POP Teste',
  position: { lat: -15.0, lng: -47.0 },
  status: 'active',
  fusionLayout: {},
  dios: [{ id: 'dio-1', name: 'DIO 1', portCount: 24 }],
  olts: [
    {
      id: 'olt-1',
      name: 'OLT 1',
      type: 'compact',
      slots: [
        {
          id: 'slot-1',
          index: 1,
          pons: [
            {
              id: 'pon-1',
              index: 1,
              active: true,
              gbic: { id: 'gbic-1', model: 'C++', connector: 'UPC', txPowerDbm: 3 },
            },
          ],
        },
      ],
      uplinks: [{ id: 'up-1', index: 1, active: true, connector: 'SFP+', speed: '10G' }],
      bootPorts: [{ id: 'boot-1', index: 1, active: true, role: 'BOOT' }],
      consolePorts: [{ id: 'con-1', index: 1, active: true, role: 'CONSOLE' }],
    },
  ],
  switches: [
    {
      id: 'sw-1',
      name: 'SW 1',
      portCount: 24,
      uplinkPortCount: 2,
      ports: [{ id: 'sw-p1', index: 1, active: true, connector: 'RJ45' }],
      uplinks: [{ id: 'sw-u1', index: 1, active: true, connector: 'SFP+' }],
    },
  ],
  routers: [
    {
      id: 'rt-1',
      name: 'RTR 1',
      wanCount: 1,
      lanCount: 1,
      interfaces: [
        { id: 'rt-w1', index: 1, active: true, role: 'WAN', connector: 'SFP+' },
        { id: 'rt-l1', index: 1, active: true, role: 'LAN', connector: 'RJ45' },
      ],
    },
  ],
  cables: [makePopCable('cab-1', 'CAB 1')],
  fusions: [],
  ...overrides,
});

describe('popEndpointUtils', () => {
  it('canConnectPopEndpoints permite cabo para DIO e bloqueia cabo para OLT', () => {
    const pop = makePop();
    expect(canConnectPopEndpoints(pop, 'cable:cab-1:f:1', 'dio:dio-1:p:1')).toBe(true);
    expect(canConnectPopEndpoints(pop, 'cable:cab-1:f:1', 'olt:olt-1:s:1:p:1')).toBe(false);
  });

  it('canConnectPopEndpoints aplica pares realistas do POP', () => {
    const pop = makePop();
    expect(canConnectPopEndpoints(pop, 'dio:dio-1:p:1', 'olt:olt-1:s:1:p:1')).toBe(true);
    expect(canConnectPopEndpoints(pop, 'dio:dio-1:p:1', 'switch:sw-1:p:1')).toBe(false);
    expect(canConnectPopEndpoints(pop, 'dio:dio-1:p:2', 'switch:sw-1:u:1')).toBe(true);
    expect(canConnectPopEndpoints(pop, 'dio:dio-1:p:3', 'router:rt-1:wan:1')).toBe(true);
    expect(canConnectPopEndpoints(pop, 'dio:dio-1:p:4', 'router:rt-1:lan:1')).toBe(false);

    expect(canConnectPopEndpoints(pop, 'olt:olt-1:u:1', 'switch:sw-1:u:1')).toBe(true);
    expect(canConnectPopEndpoints(pop, 'olt:olt-1:u:1', 'dio:dio-1:p:2')).toBe(false);

    expect(canConnectPopEndpoints(pop, 'switch:sw-1:p:1', 'router:rt-1:wan:1')).toBe(false);
    expect(canConnectPopEndpoints(pop, 'switch:sw-1:u:1', 'router:rt-1:wan:1')).toBe(true);
    expect(canConnectPopEndpoints(pop, 'olt:olt-1:b:1', 'router:rt-1:wan:1')).toBe(false);
    expect(canConnectPopEndpoints(pop, 'olt:olt-1:b:1', 'router:rt-1:lan:1')).toBe(true);
  });

  it('canConnectPopEndpoints bloqueia endpoints duplicados e porta inativa', () => {
    const duplicatedFusion: PopFusion = {
      id: 'fus-1',
      endpointAId: 'cable:cab-1:f:1',
      endpointBId: 'dio:dio-1:p:1',
      fusionType: 'fusion',
      attenuation: 0.1,
      dateCreated: new Date().toISOString(),
    };
    const popWithDuplicate = makePop({ fusions: [duplicatedFusion] });
    expect(
      canConnectPopEndpoints(popWithDuplicate, 'dio:dio-1:p:1', 'cable:cab-1:f:1')
    ).toBe(false);

    const popWithInactivePon = makePop({
      olts: [
        {
          ...makePop().olts[0]!,
          slots: [
            {
              id: 'slot-1',
              index: 1,
              pons: [
                {
                  id: 'pon-1',
                  index: 1,
                  active: false,
                  gbic: { id: 'gbic-1', model: 'C++', connector: 'UPC', txPowerDbm: 3 },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(canConnectPopEndpoints(popWithInactivePon, 'olt:olt-1:s:1:p:1', 'dio:dio-1:p:1')).toBe(
      false
    );
  });

  it('applyPopFusionToCables e clearPopFusionFromCables atualizam fibras do cabo', () => {
    const pop = makePop({
      cables: [makePopCable('cab-1', 'CAB 1'), makePopCable('cab-2', 'CAB 2')],
    });
    const fusion = buildPopFusion('cable:cab-1:f:1', 'cable:cab-2:f:1');
    const updated = applyPopFusionToCables(pop, fusion);

    const fiberA = updated[0]?.fibers[0];
    const fiberB = updated[1]?.fibers[0];
    expect(fiberA?.fusionId).toBe(fusion.id);
    expect(fiberB?.fusionId).toBe(fusion.id);
    expect(fiberA?.status).toBe('active');
    expect(fiberB?.status).toBe('active');
    expect(fiberA?.connectedTo).toBe(fiberB?.id);
    expect(fiberB?.connectedTo).toBe(fiberA?.id);

    const cleared = clearPopFusionFromCables(updated, fusion.id);
    expect(cleared[0]?.fibers[0]?.fusionId).toBeUndefined();
    expect(cleared[0]?.fibers[0]?.connectedTo).toBeUndefined();
    expect(cleared[0]?.fibers[0]?.status).toBe('inactive');
    expect(cleared[1]?.fibers[0]?.fusionId).toBeUndefined();
    expect(cleared[1]?.fibers[0]?.connectedTo).toBeUndefined();
    expect(cleared[1]?.fibers[0]?.status).toBe('inactive');
  });
});
