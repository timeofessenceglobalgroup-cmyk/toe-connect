// Fetches one approved business's full profile by its Airtable record ID.

exports.handler = async function (event) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const table = 'Businesses';
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id parameter' }) };
  }
  if (!baseId || !apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is missing Airtable configuration.' })
    };
  }

  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const record = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: record }) };
    }

    // Only ever return approved listings, regardless of what's requested.
    if (record.fields['Status'] !== 'Approved') {
      return { statusCode: 404, body: JSON.stringify({ error: 'Listing not found' }) };
    }

    const business = {
      id: record.id,
      name: record.fields['Business Name'] || '',
      category: record.fields['Category'] || '',
      city: record.fields['City'] || '',
      description: record.fields['Short Description'] || '',
      fullBio: record.fields['Full Bio'] || '',
      website: record.fields['Website / Social'] || '',
      phone: record.fields['Phone'] || '',
      email: record.fields['Email Public'] ? (record.fields['Contact Email'] || '') : '',
      videoUrl: record.fields['Video URL'] || '',
      servesRemotely: !!record.fields['Serves Remotely'],
      mobileService: !!record.fields['Mobile Service'],
      inPersonService: !!record.fields['In-Person Service'],
      supporter: !!record.fields['Supporter'],
      womenOwned: !!record.fields['Women-Owned'],
      businessVerified: !!record.fields['DFI Checked'],
      licenseVerified: !!record.fields['License Checked'],
      ownershipReviewed: !!record.fields['Ownership Reviewed'],
      mbeCertified: !!record.fields['MBE Certified']
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ business })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch business', details: String(err) })
    };
  }
};
