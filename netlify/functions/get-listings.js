// Fetches approved business listings from Airtable.
// Keeps the Airtable API key on the server side only.

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
      address: r.fields['Address'] || '',
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
