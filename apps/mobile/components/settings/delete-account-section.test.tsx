import { fireEvent, waitFor } from '@testing-library/react-native';
import { DeleteAccountSection } from './delete-account-section';
import { renderScreen } from '../../test-support/render-screen';

const ROW = 'profile-delete-account';
const CONFIRM = `${ROW}-confirm-confirm`;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('requires confirmation, then deletes and leaves the profile', async () => {
  const onDelete = jest.fn(() => Promise.resolve());
  const onDeleted = jest.fn();
  const screen = renderScreen(<DeleteAccountSection onDelete={onDelete} onDeleted={onDeleted} />);
  fireEvent.press(screen.getByTestId(ROW));
  expect(onDelete).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTestId(CONFIRM)).toBeTruthy());
  fireEvent.press(screen.getByTestId(CONFIRM));
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  expect(onDelete).toHaveBeenCalledTimes(1);
});

it('cancel leaves the account alone', async () => {
  const onDelete = jest.fn(() => Promise.resolve());
  const screen = renderScreen(<DeleteAccountSection onDelete={onDelete} onDeleted={jest.fn()} />);
  fireEvent.press(screen.getByTestId(ROW));
  await waitFor(() => expect(screen.getByTestId(`${ROW}-confirm-cancel`)).toBeTruthy());
  fireEvent.press(screen.getByTestId(`${ROW}-confirm-cancel`));
  expect(onDelete).not.toHaveBeenCalled();
});

it('shows a refusal and keeps the session', async () => {
  const onDelete = jest.fn(() =>
    Promise.reject(new Error('Staff accounts must be removed by the gym')),
  );
  const onDeleted = jest.fn();
  const screen = renderScreen(<DeleteAccountSection onDelete={onDelete} onDeleted={onDeleted} />);
  fireEvent.press(screen.getByTestId(ROW));
  await waitFor(() => expect(screen.getByTestId(CONFIRM)).toBeTruthy());
  fireEvent.press(screen.getByTestId(CONFIRM));
  await waitFor(() =>
    expect(screen.getByText('Staff accounts must be removed by the gym')).toBeTruthy(),
  );
  expect(onDeleted).not.toHaveBeenCalled();
});
