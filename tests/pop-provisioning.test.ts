import { describe, expect, it } from 'vitest';
import type { Fiber, Pop } from '@/types/ftth';
import { FIBER_COLORS } from '@/types/ftth';
import { autoTerminateMapCablesAtDio, buildStandardPopProvision } from '@/store/popProvisioning';

const makeFiber = (id: string, number: number): Fiber => ({
  id,
  number,
  color: FIBER_COLORS[(number - 1) % 12],
  status: 'inactive',
});

const makePop = (): Pop => ({
  id: 'pop-1',
  cityId: 'city-1',
  name: 'POP Teste',
  position: { lat: -15, lng: -47 },
  status: 'active',
  vlans: [],
  dios: [{ id: 'dio-1', name: 'DIO 1', portCount: 2 }],
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
              gbic: {
                id: 'gbic-1',
                model: 'C+',
                connector: 'APC',
                txPowerDbm: 3,
              },
            },
          ],
        },
      ],
      uplinks: [{ id: 'up-1', index: 1, active: true, connector: 'SFP+', speed: '10G' }],
      bootPorts: [],
      consolePorts: [],
    },
  ],
  switches: [],
  routers: [],
  cables: [
    {
      id: 'cab-1',
      name: 'CAB MAPA',
      type: 'backbone',
      fiberCount: 3,
      looseTubeCount: 1,
      fibersPerTube: 12,
      fibers: [makeFiber('f-1', 1), makeFiber('f-2', 2), makeFiber('f-3', 3)],
      status: 'active',
      linkedNetworkCableId: 'network-cab-1',
      mapEndpointRole: 'incoming',
    },
  ],
  fusions: [],
});

describe('popProvisioning', () => {
  it('buildStandardPopProvision cria baseline FTTH para novo POP', () => {
    const provision = buildStandardPopProvision('POP Centro');
    expect(provision.dios).toHaveLength(1);
    expect(provision.dios[0]?.portCount).toBe(144);
    expect(provision.olts).toHaveLength(1);
    expect(provision.olts[0]?.slots[0]?.pons).toHaveLength(16);
    expect(provision.switches).toHaveLength(1);
    expect(provision.routers).toHaveLength(1);
    expect(provision.vlans.length).toBeGreaterThanOrEqual(4);
    expect(provision.vlans.some((vlan) => vlan.vlanId === 100)).toBe(true);
  });

  it('autoTerminateMapCablesAtDio termina fibras de cabo de mapa no DIO sem exceder portas', () => {
    const pop = makePop();
    const next = autoTerminateMapCablesAtDio(pop);

    expect(next.fusions).toHaveLength(2);
    expect(
      next.fusions.every(
        (fusion) =>
          (fusion.endpointAId.startsWith('cable:cab-1:') && fusion.endpointBId.startsWith('dio:dio-1:')) ||
          (fusion.endpointBId.startsWith('cable:cab-1:') && fusion.endpointAId.startsWith('dio:dio-1:'))
      )
    ).toBe(true);

    const cable = next.cables[0];
    expect(cable?.fibers[0]?.status).toBe('active');
    expect(cable?.fibers[1]?.status).toBe('active');
    expect(cable?.fibers[2]?.status).toBe('inactive');
  });
});

