// functions/get-events.js  (Node 18+ has global fetch)
export async function handler(event) {
  try {
    const { timeMin, timeMax } = event.queryStringParameters || {};
    const API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;
    const CAL_ID  = process.env.GOOGLE_CALENDAR_ID;

    if (!API_KEY || !CAL_ID) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars' }) };
    }

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`);
    url.searchParams.set('key', API_KEY);
    url.searchParams.set('singleEvents', 'true');        // expand recurring
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '2500');
    if (timeMin) url.searchParams.set('timeMin', timeMin);
    if (timeMax) url.searchParams.set('timeMax', timeMax);
    // limit payload size
    url.searchParams.set('fields', 'items(id,htmlLink,summary,description,location,start,end,attachments),timeZone');

    const resp = await fetch(url.toString());
    const text = await resp.text();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: 'Google API error', status: resp.status, details: text }) };
    }
    const data = JSON.parse(text);

    const events = (data.items || []).map(item => {
      const allDay = !!item.start?.date;
      const start  = item.start?.dateTime || item.start?.date;
      const end    = item.end?.dateTime   || item.end?.date;

      // Try to surface a flyer URL:
      let flyer = null;
      const desc = item.description || '';
      const urlMatches = desc.match(/https?:\/\/[^\s)'"<>]+/g);
      if (urlMatches) {
        const candidate = urlMatches.find(u => /\.(png|jpe?g|webp|gif|pdf)(\?|$)/i.test(u)) || urlMatches[0];
        if (candidate) flyer = candidate;
      }
      if (item.attachments && item.attachments.length && item.attachments[0].fileUrl) {
        flyer = item.attachments[0].fileUrl; // may require sharing permissions if Drive
      }

      return {
        id: item.id,
        title: item.summary || '(no title)',
        start, end, allDay,
        url: item.htmlLink, // opens the Google event if user clicks the link in the details
        extendedProps: {
          location: item.location || '',
          description: item.description || '',
          flyer
        }
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=60' },
      body: JSON.stringify({ events })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}