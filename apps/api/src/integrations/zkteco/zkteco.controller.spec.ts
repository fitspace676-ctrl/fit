import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { Permission } from '@fit/types';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ZktecoController } from './zkteco.controller';
import type { ZktecoIntegrationService } from './zkteco-integration.service';

function setup() {
  const service = {
    get: vi.fn(),
    connect: vi.fn(),
    test: vi.fn(),
    setEnabled: vi.fn(),
    updateSettings: vi.fn(),
    disconnect: vi.fn(),
    resources: vi.fn(),
    requestSync: vi.fn(),
    status: vi.fn(),
    openDoor: vi.fn(),
    inside: vi.fn(),
    setMemberCard: vi.fn(),
  };
  const controller = new ZktecoController(service as unknown as ZktecoIntegrationService);
  return { service, controller };
}

describe('ZktecoController', () => {
  it('guards configuration with GymManage and reception actions with their own permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ZktecoController)).toEqual([Permission.GymManage]);
    const proto = ZktecoController.prototype as unknown as Record<string, object>;
    const own: [string, Permission[] | undefined][] = [
      ['openDoor', [Permission.MemberWrite]],
      ['setMemberCard', [Permission.MemberWrite]],
      ['inside', [Permission.MemberCheckinRead]],
      ['connect', undefined],
      ['updateSettings', undefined],
      ['disconnect', undefined],
      ['resources', undefined],
      ['sync', undefined],
    ];
    for (const [method, permissions] of own) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[method]!), method).toEqual(permissions);
    }
  });
  it('validates the connect body per connection type without echoing the token', () => {
    const { service, controller } = setup();
    expect(() =>
      controller.connect({
        connectionType: 'zkbio',
        baseUrl: 'not a url',
        apiToken: 'secret-token',
      }),
    ).toThrow('Invalid integration parameters');
    expect(() => controller.connect({ connectionType: 'device', host: '' })).toThrow(
      'Invalid integration parameters',
    );
    expect(service.connect).not.toHaveBeenCalled();
    void controller.connect({ connectionType: 'device', host: ' 203.0.113.10 ' });
    expect(service.connect).toHaveBeenCalledWith({
      connectionType: 'device',
      host: '203.0.113.10',
      port: 4370,
      deviceNumber: 1,
      commKey: 0,
    });
  });
  it('routes the remaining actions with parsed input', () => {
    const { service, controller } = setup();
    void controller.setEnabled({ enabled: true });
    expect(service.setEnabled).toHaveBeenCalledWith(true);
    void controller.updateSettings({ importEvents: false });
    expect(service.updateSettings).toHaveBeenCalledWith({ importEvents: false });
    expect(() => controller.updateSettings({ onExpiry: 'explode' })).toThrow();
    void controller.openDoor(undefined);
    expect(service.openDoor).toHaveBeenCalledWith(undefined);
    void controller.openDoor({ target: { kind: 'gate', id: 'G1' } });
    expect(service.openDoor).toHaveBeenLastCalledWith({ kind: 'gate', id: 'G1' });
    void controller.inside({ zone: 'Z1' });
    expect(service.inside).toHaveBeenCalledWith('Z1');
    void controller.setMemberCard('m1', { cardNumber: '00123' });
    expect(service.setMemberCard).toHaveBeenCalledWith('m1', '00123');
    expect(() => controller.setMemberCard('m1', { cardNumber: '12a' })).toThrow();
    void controller.sync();
    expect(service.requestSync).toHaveBeenCalledOnce();
  });
});
