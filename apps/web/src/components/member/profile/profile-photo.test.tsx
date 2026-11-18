import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { ProfilePhoto } from './profile-photo';

const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
  save: vi.fn(),
  refresh: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/app/actions/profile-photo', () => ({
  createProfilePhotoUpload: mocks.sign,
  setProfilePhoto: mocks.save,
}));
vi.mock('@/src/i18n/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

function show(photoUrl: string | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ProfilePhoto name="Ana Beridze" photoUrl={photoUrl} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.sign.mockResolvedValue({
    ok: true,
    data: {
      url: 'https://upload.example/signed',
      publicUrl: 'https://images.example/new.jpg',
      contentType: 'image/jpeg',
    },
  });
  mocks.fetch.mockResolvedValue({ ok: true });
  mocks.save.mockResolvedValue({ ok: true, data: { photoUrl: null } });
});

afterEach(() => vi.unstubAllGlobals());

describe('ProfilePhoto', () => {
  it('shows initials when no photo exists', () => {
    show();
    expect(screen.getByText('AB')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  });
  it('uploads bytes before attaching the issued URL', async () => {
    show();
    const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Upload photo'), { target: { files: [file] } });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('https://images.example/new.jpg'));
    expect(mocks.sign).toHaveBeenCalledWith({ contentType: file.type, contentLength: file.size });
    expect(mocks.fetch).toHaveBeenCalledWith('https://upload.example/signed', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: file,
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it('does not save a failed R2 upload', async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    show();
    fireEvent.change(screen.getByLabelText('Upload photo'), {
      target: { files: [new File(['image'], 'photo.jpg', { type: 'image/jpeg' })] },
    });
    await screen.findByRole('alert');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('removes a photo without signing an upload', async () => {
    show('https://images.example/old.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(null));
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('rejects unsupported files before requesting an upload', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Upload photo'), {
      target: { files: [new File(['svg'], 'photo.svg', { type: 'image/svg+xml' })] },
    });
    await screen.findByRole('alert');
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
