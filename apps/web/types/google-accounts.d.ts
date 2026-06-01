// Minimal ambient types for the Google Identity Services (GIS) client library,
// loaded at runtime from https://accounts.google.com/gsi/client. We only declare
// the slice of the `window.google.accounts.id` surface the sign-in button uses.

export {};

declare global {
  interface GoogleCredentialResponse {
    /** The Google-issued ID token (a signed JWT) to POST to the API. */
    credential: string;
  }

  interface GoogleIdConfiguration {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
  }

  interface GoogleButtonOptions {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'small' | 'medium' | 'large';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    width?: number;
  }

  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
          prompt: () => void;
        };
      };
    };
  }
}
