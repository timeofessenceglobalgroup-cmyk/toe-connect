// Fetches published events from the Events table, sorted with soonest first.
// Past events are filtered out client-side against today's date.

exports.handler = async function (event) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const table = 'Events';

  if (!baseId || !apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is missing Airtable configuration.' })
    };
  }

  const formula = encodeURIComponent("{Status}='Published'");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?filterByFormula=${formula}&sort[0][field]=Event Date&sort[0][direction]=asc&pageSize=100`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data }) };
    }

    const events = (data.records || []).map(r => ({
      id: r.id,
      name: r.fields['Event Name'] || '',
      date: r.fields['Event Date'] || '',
      location: r.fields['Location'] || '',
      description: r.fields['Description'] || '',
      rsvpLink: r.fields['RSVP Link'] || ''
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ events })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch events', details: String(err) })
    };
  }
};
