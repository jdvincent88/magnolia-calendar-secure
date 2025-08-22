// Netlify Function: get-events
// Uses Node 18's built-in fetch (no node-fetch).
// Reads GOOGLE_CALENDAR_API_KEY and GOOGLE_CALENDAR_ID from Netlify env vars.

export async function handler(event) {
  const API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;
  const GCAL_ID = process.env.GOOGLE_CALENDAR_ID;

  if (!API_KEY || !GCAL_ID) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Server not configured: missing GOOGLE_CALENDAR_API_KEY or GOOGLE_CALENDAR_ID" }),
    };
  }

  // Optional range from FullCalendar
  const qs = new URLSearchParams(event.queryStringParameters || {});
  const timeMin = qs.get("timeMin");
  const timeMax = qs.get("timeMax");

  // Defaults: last 6 months to next 12 months
  const now = new Date();
  const defaultMin = new Date(now); defaultMin.setMonth(now.getMonth() - 6);
  const defaultMax = new Date(now); defaultMax.setMonth(now.getMonth() + 12);

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
    timeMin: (timeMin ? new Date(timeMin) : defaultMin).toISOString(),
    timeMax: (timeMax ? new Date(timeMax) : defaultMax).toISOString(),
    key: API_KEY,
  });

  const calId = encodeURIComponent(GCAL_ID);
  const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params.toString()}`;

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: res.status,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Google API error", status: res.status, details: text }),
      };
    }
    const data = await res.json();

    // Convert Google items -> FullCalendar event objects
    const events = (data.items || []).map((item) => ({
      id: item.id,
      title: item.summary || "Untitled",
      start: item.start?.dateTime || item.start?.date,
      end: item.end?.dateTime || item.end?.date,
      location: item.location || undefined,
      url: item.htmlLink || undefined,
      description: (item.description || "").slice(0, 1000),
      allDay: Boolean(item.start?.date && !item.start?.dateTime),
    }));

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
      body: JSON.stringify({ events }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Server fetch failed", details: String(err) }),
    };
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
