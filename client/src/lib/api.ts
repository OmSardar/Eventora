import { ApiResponse } from "@/types";
import { getApiBaseUrl } from "./env";

export { getApiBaseUrl };

let cachedCsrfToken: string | null = null;
let fetchingCsrfPromise: Promise<string> | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  if (fetchingCsrfPromise) return fetchingCsrfPromise;

  fetchingCsrfPromise = (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/csrf`, {
        method: "GET",
        credentials: "include",
      });
      const json: ApiResponse<{ csrfToken: string }> = await res.json();
      if (json.data?.csrfToken) {
        cachedCsrfToken = json.data.csrfToken;
        return cachedCsrfToken;
      }
    } catch (err) {
      console.error("Failed to retrieve CSRF token:", err);
    } finally {
      fetchingCsrfPromise = null;
    }
    return "";
  })();

  return fetchingCsrfPromise;
}

export function resetCsrfToken() {
  cachedCsrfToken = null;
  fetchingCsrfPromise = null;
}

interface RequestOptions extends RequestInit {
  data?: unknown;
  _retriedCsrf?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { data, headers: customHeaders, method = "GET", ...customConfig } = options;
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(
    method.toUpperCase()
  );

  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    Accept: "application/json",
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (isStateChanging) {
    try {
      const csrfToken = await getCsrfToken();
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }
    } catch {
      // Fallback: Proceed with trusted Origin header
    }
  }

  const config: RequestInit = {
    method,
    headers,
    credentials: "include",
    ...customConfig,
  };

  if (isFormData) {
    config.body = data as FormData;
  } else if (data !== undefined) {
    config.body = JSON.stringify(data);
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${getApiBaseUrl()}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, config);

  // Parse JSON response
  let json: ApiResponse<T>;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Failed to parse response from server (${response.status})`);
  }

  if (!response.ok || !json.success) {
    const errorMessage =
      json.error?.message ||
      json.message ||
      `Request failed with status ${response.status}`;
    const err = new Error(errorMessage) as Error & {
      statusCode?: number;
      details?: Array<{ field: string; message: string }>;
    };
    err.statusCode = response.status;
    err.details = json.error?.details;

    // Auto-recovery: If CSRF token expired or mismatched, refresh token and retry request once
    if (
      response.status === 403 &&
      errorMessage.toLowerCase().includes("csrf") &&
      !options._retriedCsrf
    ) {
      resetCsrfToken();
      const freshToken = await getCsrfToken();
      const retryHeaders = {
        ...((customHeaders as Record<string, string>) || {}),
        ...(freshToken ? { "X-CSRF-Token": freshToken } : {}),
      };
      return apiClient<T>(endpoint, {
        ...options,
        headers: retryHeaders,
        _retriedCsrf: true,
      });
    }

    // Invalidate cached token if CSRF failure
    if (response.status === 403 && errorMessage.toLowerCase().includes("csrf")) {
      resetCsrfToken();
    }

    throw err;
  }

  return (json.data ?? json) as T;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: "GET" }),
  post: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: "POST", data }),
  patch: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: "PATCH", data }),
  delete: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: "DELETE" }),
};

