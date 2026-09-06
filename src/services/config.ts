function normalizeHttpsUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed.replace(/\/$/, "") : `https://${trimmed}`;
}

export const config = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  cognitoDomain: normalizeHttpsUrl(import.meta.env.VITE_COGNITO_DOMAIN as string | undefined),
  cognitoClientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
  basePath: import.meta.env.BASE_URL,
};

export const authConfigured = Boolean(
  config.apiUrl && config.cognitoDomain && config.cognitoClientId,
);

export function callbackUrl(): string {
  return `${window.location.origin}${config.basePath}`;
}
