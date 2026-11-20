import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { Permission } from '@fit/types';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { IntegrationsController } from './integrations.controller';
import type { IntegrationsService } from './integrations.service';

describe('IntegrationsController', () => {
  it('declares GymManage on every endpoint through class metadata', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, IntegrationsController)).toEqual([
      Permission.GymManage,
    ]);
  });
  it('validates bodies without echoing secrets in errors', () => {
    const connect = vi.fn();
    const controller = new IntegrationsController({ connect } as unknown as IntegrationsService);
    expect(() => controller.connect({ merchantId: 'bad', secretKey: 'private' })).toThrow(
      'Invalid integration parameters',
    );
    expect(connect).not.toHaveBeenCalled();
    void controller.connect({ merchantId: '1549901', secretKey: ' test ' });
    expect(connect).toHaveBeenCalledWith({ merchantId: '1549901', secretKey: 'test' });
  });
  it('validates and routes Sender actions with the real provider', () => {
    const service = {
      connectSender: vi.fn(),
      testSender: vi.fn(),
      setEnabled: vi.fn(),
      disconnect: vi.fn(),
      sendTestSms: vi.fn(),
    };
    const controller = new IntegrationsController(service as unknown as IntegrationsService);
    expect(() => controller.connectSender({ apiKey: '' })).toThrow(
      'Invalid integration parameters',
    );
    void controller.connectSender({ apiKey: ' private ' });
    expect(service.connectSender).toHaveBeenCalledWith({ apiKey: 'private' });
    void controller.testSender();
    expect(service.testSender).toHaveBeenCalledOnce();
    void controller.setSenderEnabled({ enabled: true });
    expect(service.setEnabled).toHaveBeenCalledWith(true, 'sender');
    void controller.disconnectSender();
    expect(service.disconnect).toHaveBeenCalledWith('sender');
    void controller.sendTestSms({ phone: '599123456' });
    expect(service.sendTestSms).toHaveBeenCalledWith('599123456');
    expect(() => controller.sendTestSms({ phone: '' })).toThrow('Invalid integration parameters');
  });
});
