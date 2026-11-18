import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { apiJson } from '../../lib/http/api-client';
import { renderApp } from '../../test-support/render';
import { ProfilePhoto } from './profile-photo';

jest.mock('../../hooks/useActiveGym', () => ({ useGymId: () => 'gym_1' }));
jest.mock('../../lib/http/api-client', () => ({ apiJson: jest.fn() }));

const request = jest.mocked(apiJson);
const picker = jest.mocked(ImagePicker.launchImageLibraryAsync);
const originalFetch = global.fetch;
const fetchMock = jest.fn();
let menu: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  menu = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  picker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cropped.jpg', mimeType: 'image/jpeg', width: 100, height: 100 }],
  });
  fetchMock.mockReset();
  fetchMock.mockResolvedValueOnce({
    blob: () => Promise.resolve({ size: 123, type: 'image/jpeg' }),
  });
  fetchMock.mockResolvedValueOnce({ ok: true });
  request.mockReset();
  request.mockResolvedValueOnce({
    url: 'https://r2.example/signed',
    publicUrl: 'https://cdn.example/photo.jpg',
    contentType: 'image/jpeg',
  });
  request.mockResolvedValueOnce({ photoUrl: 'https://cdn.example/photo.jpg' });
});
afterEach(() => {
  global.fetch = originalFetch;
  menu.mockRestore();
});

function action(label: string) {
  const buttons = menu.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
  const button = buttons.find((item) => item.text === label);
  expect(button).toBeDefined();
  act(() => {
    button?.onPress?.();
  });
}

it('picks, signs the cropped bytes, uploads, then saves the photo', async () => {
  const screen = renderApp(<ProfilePhoto name="Nino Test" />);
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  action('Choose photo');
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(picker).toHaveBeenCalledWith({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  expect(request).toHaveBeenNthCalledWith(1, '/me/profile/photo/upload', {
    method: 'POST',
    json: { contentType: 'image/jpeg', contentLength: 123 },
  });
  expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://r2.example/signed', {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: { size: 123, type: 'image/jpeg' },
  });
  expect(request).toHaveBeenNthCalledWith(2, '/me/profile/photo', {
    method: 'PATCH',
    json: { photoUrl: 'https://cdn.example/photo.jpg' },
  });
  await waitFor(() => expect(screen.queryByTestId('profile-photo-progress')).toBeNull());
});

it('canceling the picker does not upload', async () => {
  picker.mockResolvedValue({ canceled: true, assets: null });
  const screen = renderApp(<ProfilePhoto name="Nino" />);
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  action('Choose photo');
  await waitFor(() => expect(screen.queryByTestId('profile-photo-progress')).toBeNull());
  expect(request).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('canceling the menu does nothing and a missing photo has no remove action', () => {
  const screen = renderApp(<ProfilePhoto name="Nino" />);
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  action('Cancel');
  expect(menu.mock.calls[0]?.[2]).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ text: 'Remove photo' })]),
  );
  expect(picker).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it('removes an existing photo through DELETE', async () => {
  request.mockReset().mockResolvedValue({ photoUrl: null });
  const screen = renderApp(<ProfilePhoto name="Nino" photoUrl="https://cdn.example/old.jpg" />);
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  action('Remove photo');
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/me/profile/photo', { method: 'DELETE' }),
  );
  expect(picker).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByTestId('profile-photo-progress')).toBeNull());
});

it.each(['sign', 'upload', 'save', 'picker'])('shows a toast on %s failure', async (stage) => {
  if (stage === 'sign') request.mockReset().mockRejectedValue(new Error('sign'));
  if (stage === 'upload') {
    fetchMock
      .mockReset()
      .mockResolvedValueOnce({ blob: () => Promise.resolve({ size: 123, type: 'image/jpeg' }) })
      .mockResolvedValueOnce({ ok: false });
  }
  if (stage === 'save')
    request
      .mockReset()
      .mockResolvedValueOnce({
        url: 'https://r2.example/signed',
        publicUrl: 'https://cdn.example/photo.jpg',
        contentType: 'image/jpeg',
      })
      .mockRejectedValueOnce(new Error('save'));
  if (stage === 'picker') picker.mockRejectedValueOnce(new Error('picker'));
  const screen = renderApp(<ProfilePhoto name="Nino" />);
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  action('Choose photo');
  await waitFor(() =>
    expect(
      screen.getByText('The photo could not be saved. Try a smaller image or try again.'),
    ).toBeTruthy(),
  );
  expect(screen.queryByTestId('profile-photo-progress')).toBeNull();
  if (stage === 'upload') expect(request).toHaveBeenCalledTimes(1);
});

it('offers Georgian actions with the light theme', () => {
  const screen = renderApp(<ProfilePhoto name="ნინო" photoUrl="https://cdn.example/old.jpg" />, {
    locale: 'ka',
    appearance: 'light',
  });
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  expect(menu.mock.calls[0]?.[2]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: 'ფოტოს არჩევა' }),
      expect.objectContaining({ text: 'ფოტოს წაშლა' }),
    ]),
  );
});

it('shows a toast when removal fails and keeps the photo', async () => {
  request.mockReset().mockRejectedValue(new Error('delete'));
  const screen = renderApp(<ProfilePhoto name="Nino" photoUrl="https://cdn.example/old.jpg" />);
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  action('Remove photo');
  await waitFor(() =>
    expect(
      screen.getByText('The photo could not be saved. Try a smaller image or try again.'),
    ).toBeTruthy(),
  );
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  expect(menu.mock.calls[1]?.[2]).toEqual(
    expect.arrayContaining([expect.objectContaining({ text: 'Remove photo' })]),
  );
});

it('rejects unsupported image types before requesting a signed URL', async () => {
  fetchMock
    .mockReset()
    .mockResolvedValue({ blob: () => Promise.resolve({ size: 123, type: 'image/gif' }) });
  const screen = renderApp(<ProfilePhoto name="Nino" />);
  fireEvent.press(screen.getByTestId('profile-photo-manage'));
  action('Choose photo');
  await waitFor(() => expect(screen.getByText('Choose a JPEG, PNG or WebP image.')).toBeTruthy());
  expect(request).not.toHaveBeenCalled();
});
