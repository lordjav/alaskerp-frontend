import { callbackUrl, config } from "./config";
import type { Role } from "../models";

const ACCESS = "alaskerp.access";
const REFRESH = "alaskerp.refresh";
const VERIFIER = "alaskerp.pkce.verifier";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return base64Url(bytes);
}

async function challenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  return JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/")));
}

export function accessToken(): string | null { return sessionStorage.getItem(ACCESS); }
export function roles(): Role[] { return (accessToken() ? (decodeJwt(accessToken()!) ["cognito:groups"] as Role[] | undefined) : []) ?? []; }
export function username(): string { const token = accessToken(); if (!token) return ""; const claims = decodeJwt(token); return (claims["username"] ?? claims["cognito:username"] ?? claims["email"] ?? "") as string; }
export function isAuthenticated(): boolean { return Boolean(accessToken()); }
export function logout(): void { sessionStorage.removeItem(ACCESS); sessionStorage.removeItem(REFRESH); window.location.assign(`${config.cognitoDomain}/logout?client_id=${encodeURIComponent(config.cognitoClientId)}&logout_uri=${encodeURIComponent(callbackUrl())}`); }

export async function refreshSession(): Promise<boolean> {
  const refreshToken = sessionStorage.getItem(REFRESH);
  if (!refreshToken) return false;
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: config.cognitoClientId, refresh_token: refreshToken });
  const response = await fetch(`${config.cognitoDomain}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) return false;
  const tokens = await response.json() as { access_token: string };
  sessionStorage.setItem(ACCESS, tokens.access_token);
  return true;
}

export async function login(): Promise<void> {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER, verifier);
  const url = new URL(`${config.cognitoDomain}/oauth2/authorize`);
  url.search = new URLSearchParams({ response_type: "code", client_id: config.cognitoClientId, redirect_uri: callbackUrl(), scope: "openid email profile", code_challenge_method: "S256", code_challenge: await challenge(verifier) }).toString();
  window.location.assign(url);
}

export async function acceptCallback(): Promise<boolean> {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return false;
  const verifier = sessionStorage.getItem(VERIFIER);
  if (!verifier) throw new Error("No se encontró la verificación de inicio de sesión.");
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: config.cognitoClientId, code, redirect_uri: callbackUrl(), code_verifier: verifier });
  const response = await fetch(`${config.cognitoDomain}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("No fue posible completar el inicio de sesión.");
  const tokens = await response.json() as { access_token: string; refresh_token: string };
  sessionStorage.setItem(ACCESS, tokens.access_token);
  sessionStorage.setItem(REFRESH, tokens.refresh_token);
  sessionStorage.removeItem(VERIFIER);
  history.replaceState({}, "", `${config.basePath}${window.location.hash || "#/pos"}`);
  return true;
}
