// Minimal ambient types for the Sign in with Apple JS library, loaded at runtime
// from https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js.
// We only declare the slice of the `window.AppleID.auth` surface the sign-in
// button uses (init + a popup signIn).

export {};

declare global {
  interface AppleIdAuthConfig {
    /** The Apple "Services ID" registered as the web OAuth client. */
    clientId: string;
    /** Space-delimited scopes, e.g. "name email". */
    scope: string;
    /** Must exactly match a Return URL configured on the Services ID. */
    redirectURI: string;
    /** Opaque value echoed back in the response; used for CSRF protection. */
    state?: string;
    /** A nonce bound into the issued ID token. */
    nonce?: string;
    /** When true, signIn() resolves with the result instead of redirecting. */
    usePopup?: boolean;
  }

  /** The user's name + email — present only on the first authorization. */
  interface AppleIdSignInUser {
    name?: { firstName?: string; lastName?: string };
    email?: string;
  }

  interface AppleIdSignInResponse {
    authorization: {
      /** The Apple-issued ID token (a signed JWT) to POST to the API. */
      id_token: string;
      code: string;
      state?: string;
    };
    user?: AppleIdSignInUser;
  }

  interface Window {
    AppleID?: {
      auth: {
        init: (config: AppleIdAuthConfig) => void;
        signIn: () => Promise<AppleIdSignInResponse>;
      };
    };
  }
}
