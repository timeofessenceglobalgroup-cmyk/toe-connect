// Fetches approved business listings from Airtable.
// Keeps the Airtable API key on the server side only.

// Hours are stored in Airtable as one line per day: "Monday: 9:00 AM - 5:00 PM".
function parseHours(text) {
  return String(text || '').split('\n').map(line => {
    const i = line.indexOf(':');
    if (i < 1) return null;
    return { day: line.slice(0, i).trim(), hours: line.slice(i + 1).trim() };
  }).filter(row => row && row.hours);
}

// Address and hours fields shared by the listing and profile responses.
// A private (home-based) or mobile/online-only address is never sent to the browser.
function locationFields(f) {
  const visibility = f['Address Visibility'];
  const hidden = visibility === 'Private' || visibility === 'None';
  const hours = parseHours(f['Hours']);
  return {
    address: hidden ? '' : (f['Address'] || ''),
    homeBased: visibility === 'Private',
    hoursType: f['Hours Type'] || (hours.length ? 'Set hours' : 'Not listed'),
    hours
  };
}

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

  const formula = encodeURIComponent("AND({Status}='Approved',{Listing Type}='Black-Owned Business')");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?filterByFormula=${formula}&pageSize=100`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data }) };
    }

    const listings = (data.records || []).map(r => ({
      id: r.id,
      name: r.fields['Business Name'] || '',
      category: r.fields['Category'] || '',
      city: r.fields['City'] || '',
      ...locationFields(r.fields),
      description: r.fields['Short Description'] || '',
      website: r.fields['Website / Social'] || '',
      phone: r.fields['Phone'] || '',
      email: r.fields['Email Public'] ? (r.fields['Contact Email'] || '') : '',
      servesRemotely: !!r.fields['Serves Remotely'],
      mobileService: !!r.fields['Mobile Service'],
      inPersonService: !!r.fields['In-Person Service'],
      supporter: !!r.fields['Supporter'],
      verified: !!r.fields['Verified'],
      womenOwned: !!r.fields['Women-Owned'],
      videoUrl: r.fields['Video URL'] || '',
      logoUrl: (r.fields['Logo/Photo'] && r.fields['Logo/Photo'][0] && r.fields['Logo/Photo'][0].url) || '',
      businessVerified: !!r.fields['DFI Checked'],
      licenseVerified: !!r.fields['License Checked'],
      ownershipReviewed: !!r.fields['Ownership Reviewed'],
      mbeCertified: !!r.fields['MBE Certified']
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ listings })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch listings', details: String(err) })
    };
  }
};
