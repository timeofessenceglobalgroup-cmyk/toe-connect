// Fetches approved tips from the Tips table.

exports.handler = async function (event) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const table = 'Tips';

  if (!baseId || !apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is missing Airtable configuration.' })
    };
  }

  const formula = encodeURIComponent("{Status}='Approved'");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?filterByFormula=${formula}&pageSize=100`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data }) };
    }

    const tips = (data.records || []).map(r => ({
      id: r.id,
      text: r.fields['Tip Text'] || '',
      topic: r.fields['Topic'] || '',
      businessName: r.fields['Business Name'] || '',
      category: r.fields['Business Category'] || ''
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ tips })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch tips', details: String(err) })
    };
  }
};
