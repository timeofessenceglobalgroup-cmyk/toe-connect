// Writes a new business submission into Airtable as Status: Pending.
// Keeps the Airtable API key on the server side only.

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

  const licensedCategories = ['Childcare & daycare', 'Home health & senior care', 'Medical & dental care', 'Mental health & counseling'];
  const needsLicense = licensedCategories.includes(data.category);

  // Server-side validation — never trust the browser alone.
  const missing = [];
  if (!data.bizname) missing.push('bizname');
  if (!data.category) missing.push('category');
  if (!data.city) missing.push('city');
  if (!data.shortdesc) missing.push('shortdesc');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) missing.push('email');
  if (!data.blackOwned) missing.push('blackOwned');
  if (needsLicense && !data.license) missing.push('license');

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
    'Full Bio': data.fullbio || '',
    'Contact Email': data.email,
    'Phone': data.phone || '',
    'Website / Social': data.website || '',
    'Video URL': data.video || '',
    'License/Certification #': data.license || '',
    'In-Person Service': !!data.isInPerson,
    'Serves Remotely': !!data.isRemote,
    'Mobile Service': !!data.isMobile,
    'Donation Amount': donationAmount,
    'Supporter': donationAmount > 0,
    'Black-Owned Confirmed': !!data.blackOwned,
    'Women-Owned': !!data.womenOwned,
    'MBE Certification Number': data.mbeCert || '',
    'Listing Type': 'Black-Owned Business',
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
      body: JSON.stringify({ error: 'Failed to submit listing', details: String(err) })
    };
  }
};
