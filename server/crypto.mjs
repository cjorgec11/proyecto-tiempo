const encoder = new TextEncoder();
export const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
export const unhex = value => Uint8Array.from(value.match(/../g) || [], byte => Number.parseInt(byte, 16));
export const digest = async text => hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));

export async function passwordHash(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${salt}$${hex(hash)}`;
}
