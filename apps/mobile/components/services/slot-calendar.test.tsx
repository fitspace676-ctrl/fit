// The slot calendar's offline branch.
//
// It is unreachable from `app/services/[id]`'s tests: the calendar is only
// mounted once the catalogue has landed, and a cold offline start never gets
// that far. So the branch is driven here, through the REAL mechanism —
// `onlineManager` parking the query — rather than through a boolean prop.
import { onlineManager } from '@tanstack/react-query';

import { SlotCalendar } from './slot-calendar';
import { renderScreen } from '../../test-support/render-screen';

const mockListSlots = jest.fn();
jest.mock('../../hooks/queries/useServices', () => ({
  serviceSlotsQueryOptions: (
    gymId: string | null,
    range: { serviceId?: string; from: string; to: string },
  ) => ({
    queryKey: ['serviceSlots', gymId ?? '', range.serviceId ?? 'all', range],
    queryFn: () => mockListSlots() as unknown,
    enabled: gymId !== null,
  }),
}));

beforeEach(() => {
  mockListSlots.mockReset();
  mockListSlots.mockResolvedValue({ slots: [] });
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('§6 state 4', () => {
  it('SAYS the radio is out rather than skeletoning forever', () => {
    // `onlineManager` PAUSES the query (`fetchStatus: 'paused'`, `isError`
    // false), so this branch is where the calendar STAYS with a dead radio.
    // A skeleton there promises times that are never coming.
    // TODO(i18n) `common.offline.title` / `common.offline.body`.
    onlineManager.setOnline(false);
    const view = renderScreen(
      <SlotCalendar gymId="gym_1" serviceId="svc_pt" onPickSlot={() => undefined} />,
    );

    expect(view.getByTestId('slot-calendar-offline')).toBeTruthy();
    expect(view.getByText("You're offline")).toBeTruthy();
    expect(view.getByText('Check your connection and try again.')).toBeTruthy();
    expect(view.queryByTestId('slot-calendar-loading')).toBeNull();
    expect(mockListSlots).not.toHaveBeenCalled();
  });

  it('still skeletons while a request is genuinely in flight', () => {
    const view = renderScreen(
      <SlotCalendar gymId="gym_1" serviceId="svc_pt" onPickSlot={() => undefined} />,
    );
    expect(view.getByTestId('slot-calendar-loading')).toBeTruthy();
    expect(view.queryByTestId('slot-calendar-offline')).toBeNull();
  });
});
