// Writes a new Community Ally submission into Airtable as Status: Pending.
// No Black-owned confirmation required — tagged with Listing Type so it
// never shows up in the main directory query.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const table = 'Businesses';

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
  if (!data.bizname) missing.push('bizname');
  if (!data.category) missing.push('category');
  if (!data.city) missing.push('city');
  if (!data.shortdesc) missing.push('shortdesc');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) missing.push('email');

  if (missing.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing or invalid fields', missing })
    };
  }

  const donationAmount = Number(data.donationAmount) || 0;

  const fields = {
    'Business Name': data.bizname,
    'Category': data.category,
    'City': data.city,
    'Short Description': data.shortdesc,
    'Contact Email': data.email,
    'Website / Social': data.website || '',
    'Donation Amount': donationAmount,
    'Supporter': donationAmount > 0,
    'Listing Type': 'Ally / Supporter',
    'Status': 'Pending'
  };

  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
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
      body: JSON.stringify({ error: 'Failed to submit ally listing', details: String(err) })
    };
  }
};
