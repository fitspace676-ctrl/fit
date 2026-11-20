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
});
