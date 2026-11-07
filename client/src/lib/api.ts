import { ApiResponse } from "@/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

let cachedCsrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/csrf`, {
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
  }
  return "";
}

export function resetCsrfToken() {
  cachedCsrfToken = null;
}

interface RequestOptions extends RequestInit {
  data?: unknown;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { data, headers: customHeaders, method = "GET", ...customConfig } = options;
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(
    method.toUpperCase()
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (isStateChanging) {
    const csrfToken = await getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const config: RequestInit = {
    method,
    headers,
    credentials: "include",
    ...customConfig,
  };

  if (data !== undefined) {
    config.body = JSON.stringify(data);
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

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

