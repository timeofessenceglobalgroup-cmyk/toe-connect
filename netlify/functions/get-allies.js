// Fetches approved Community Ally listings from Airtable — separate from the
// main Black-owned directory (filtered by Listing Type).

exports.handler = async function (event) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const table = 'Businesses';

  if (!baseId || !apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is missing Airtable configuration.' })
    };
  }

  const formula = encodeURIComponent("AND({Status}='Approved',{Listing Type}='Ally / Supporter')");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?filterByFormula=${formula}&pageSize=100`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data }) };
    }

    const allies = (data.records || []).map(r => ({
      id: r.id,
      name: r.fields['Business Name'] || '',
      category: r.fields['Category'] || '',
      city: r.fields['City'] || '',
      description: r.fields['Short Description'] || ''
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ allies })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch allies', details: String(err) })
    };
  }
};
