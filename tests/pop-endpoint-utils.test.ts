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
  type: 'bigtail',
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
  switches: [],
  routers: [],
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
