/**
 * Dynamic Environment & URL Resolution Utility
 * Eliminates hardcoded URLs and ensures consistent resolution across
 * development, testing, preview deployments, and production environments.
 */

/**
 * Returns the API base URL (e.g. "https://eventora-server-omslabs.onrender.com/api/v1")
 * Resolves from NEXT_PUBLIC_API_URL or dynamically derives from the current host.
 */
export function getApiBaseUrl(): string {
  // If in browser runtime:
  if (typeof window !== "undefined" && window.location) {
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      return `${window.location.protocol}//${window.location.hostname}:5000/api/v1`;
    }
    // On deployed production host (e.g. Vercel), use relative path to route through Next.js rewrites.
    // This provides 100% first-party cookie and CSRF compatibility even in strict Incognito mode.
    return "/api/v1";
  }

  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  // Default fallback for development
  return "http://localhost:5000/api/v1";
}

/**
 * Returns the internal/server-side API URL for Next.js SSR / Metadata generation.
 */
export function getInternalApiUrl(): string {
  const internal = process.env.INTERNAL_API_URL;
  if (internal && internal.trim()) {
    return internal.trim().replace(/\/+$/, "");
  }
  return getApiBaseUrl();
}

/**
 * Returns the public website URL for canonical tags, OpenGraph, sitemap, and metadata.
 */
export function getSiteUrl(): string {
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envSiteUrl && envSiteUrl.trim()) {
    return envSiteUrl.trim().replace(/\/+$/, "");
  }

  // Automatic Vercel deployment URL
  const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercelUrl && vercelUrl.trim()) {
    const cleanUrl = vercelUrl.trim().replace(/\/+$/, "");
    return cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`;
  }

  // If in browser runtime
  if (typeof window !== "undefined" && window.location) {
    return window.location.origin;
  }

  // Development fallback
  return "http://localhost:3000";
}

