export function readStorage(key, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue === null ? fallback : JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  // Storage can be full or blocked (private mode, site data disabled): the app keeps working
  // without persistence.
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key}`, error);
  }
}

export function readCookie(name) {
  if (typeof document === "undefined") {
    return "";
  }

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function writeCookie(name, value, days = 365) {
  if (typeof document === "undefined") {
    return;
  }

  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
