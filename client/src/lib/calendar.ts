import { getApiBaseUrl } from "./env";

/**
 * Downloads the RFC 5545 .ics calendar pass for an attendee's confirmed event registration.
 *
 * @param registrationId The registration ObjectId
 * @param eventTitle The title of the event to name the downloaded .ics file
 */
export async function downloadRegistrationCalendarIcs(
  registrationId: string,
  eventTitle: string
): Promise<void> {
  const url = `${getApiBaseUrl()}/registrations/${registrationId}/calendar.ics`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "text/calendar, application/json, */*",
    },
  });

  if (!response.ok) {
    let errorMessage = "Failed to download calendar event.";
    try {
      const errorJson = await response.json();
      if (errorJson?.message) {
        errorMessage = errorJson.message;
      }
    } catch {
      // Fallback to HTTP status text if not JSON
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  const slug = (eventTitle || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  anchor.download = `${slug || "event"}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}
