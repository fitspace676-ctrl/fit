import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Permission } from '@fit/types';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permissions: vi.fn(),
  own: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@/lib/session', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/permissions-server', () => ({ getConsolePermissions: mocks.permissions }));
vi.mock('@/lib/active-location-server', () => ({
  getActiveLocationId: () => Promise.resolve(undefined),
}));
vi.mock('@/lib/gym-time', () => ({
  gymCalendarContext: () => Promise.resolve({ timeZone: 'UTC', openHour: 6, closeHour: 23 }),
}));
vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  fetchMyScheduleTrainer: mocks.own,
  fetchSchedule: mocks.schedule,
}));
vi.mock('@/components/classes-tabs', () => ({ ClassesTabs: () => null }));
vi.mock('./options', () => ({ loadScheduleFilters: () => Promise.resolve({ trainers: [] }) }));
vi.mock('../options', () => ({ loadRelationOptions: () => Promise.resolve(null) }));
vi.mock('./schedule-board', () => ({
  ScheduleBoard: ({
    trainerId,
    ownTrainerId,
    canManageOwn,
  }: {
    trainerId: string;
    ownTrainerId: string;
    canManageOwn: boolean;
  }) => <div data-testid="board">{JSON.stringify({ trainerId, ownTrainerId, canManageOwn })}</div>,
}));
const { default: Page } = await import('./page');
beforeEach(() => {
  mocks.session.mockResolvedValue({ role: 'TRAINER' });
  mocks.permissions.mockResolvedValue({
    grants: [Permission.ClassRead, Permission.ClassManageOwn],
  });
  mocks.own.mockResolvedValue({ trainerId: 'tr-own' });
  mocks.schedule.mockResolvedValue({ instances: [] });
});
describe('My classes toggle', () => {
  it('opens a trainer on all classes by default', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId('board')).toHaveTextContent('"trainerId":""');
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ trainerId: undefined }));
  });
  it("narrows to the coach's own classes with ?trainerId=mine", async () => {
    render(await Page({ searchParams: Promise.resolve({ trainerId: 'mine' }) }));
    expect(screen.getByTestId('board')).toHaveTextContent('"trainerId":"mine"');
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ trainerId: 'tr-own' }));
  });
  it('keeps a manager default at all classes even with a coach profile', async () => {
    mocks.session.mockResolvedValue({ role: 'MANAGER' });
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ trainerId: undefined }));
  });
});
