// Writes a new tip into the Tips table as Status: Pending.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const table = 'Tips';

  if (!baseId || !apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is missing Airtable configuration.' })
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const missing = [];
  if (!data.tipText) missing.push('tipText');
  if (!data.topic) missing.push('topic');
  if (!data.businessName) missing.push('businessName');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) missing.push('email');

  if (missing.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing or invalid fields', missing })
    };
  }

  const fields = {
    'Tip Text': data.tipText,
    'Topic': data.topic,
    'Business Name': data.businessName,
    'Business Category': data.category || '',
    'Contact Email': data.email,
    'Status': 'Pending'
  };

  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields, typecast: true })
    });
    const result = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: result }) };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: true, id: result.id })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to submit tip', details: String(err) })
    };
  }
};
