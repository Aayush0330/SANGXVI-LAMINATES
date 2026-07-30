export const SESSION_COOKIE_NAME = "sangxvi_session";
export const FORCE_PASSWORD_CHANGE_COOKIE_NAME =
  "sangxvi_force_password_change";
export const LEGACY_USER_COOKIE_NAME = "sangxvi_legacy_user";

// A session survives browser/PWA restarts and expires only after 90 days of
// inactivity. Active sessions are renewed before they approach expiry.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
export const SESSION_RENEWAL_WINDOW_SECONDS = 60 * 60 * 24 * 30;
