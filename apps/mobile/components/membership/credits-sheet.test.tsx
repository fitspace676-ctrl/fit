import { fireEvent } from '@testing-library/react-native';
import { CreditsSheet } from './credits-sheet';
import { renderApp } from '../../test-support/render';

jest.mock('../../hooks/useOnlinePayments', () => ({
  useOnlinePayments: () => ({ enabled: false }),
}));
jest.mock('../../hooks/usePaymentBrowser', () => ({ usePaymentBrowser: () => jest.fn() }));
const mockPurchase = jest.fn();
jest.mock('../../hooks/mutations/useCreditPackMutations', () => ({
  usePurchaseCreditPack: () => ({ mutate: mockPurchase, isPending: false }),
}));
jest.mock('../../hooks/queries/useMembership', () => ({
  usePackCatalogue: () => ({
    data: {
      packs: [
        {
          id: 'pack_1',
          name: 'Five sessions',
          priceAmount: 1000,
          currency: 'GEL',
          sessionCount: 5,
          validityDays: 30,
        },
      ],
    },
    isPending: false,
    isError: false,
  }),
}));

it('keeps purchases disabled and explains front-desk payment when Flitt is off', () => {
  const screen = renderApp(<CreditsSheet open onClose={() => undefined} />);
  expect(
    screen.getByText('Online payment is unavailable. Please pay at the front desk.'),
  ).toBeTruthy();
  fireEvent.press(screen.getByTestId('credits-sheet-pack-pack_1'));
  fireEvent.press(screen.getByTestId('credits-sheet-confirm'));
  expect(mockPurchase).not.toHaveBeenCalled();
});
