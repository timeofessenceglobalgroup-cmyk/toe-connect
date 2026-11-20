// Fetches one approved business's full profile by its Airtable record ID.

// Hours are stored in Airtable as one line per day: "Monday: 9:00 AM - 5:00 PM".
function parseHours(text) {
  return String(text || '').split('\n').map(line => {
    const i = line.indexOf(':');
    if (i < 1) return null;
    return { day: line.slice(0, i).trim(), hours: line.slice(i + 1).trim() };
  }).filter(row => row && row.hours);
}

// Booking links must be real https:// links; anything else is dropped so it never reaches the page.
function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https:\/\/\S+$/i.test(s) ? s : '';
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


// ---- Map coordinates ----
// Only a public street address is ever mapped. Coordinates are looked up once, then saved
// to the Latitude and Longitude columns in Airtable so later page views are instant.
function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 24 && lat < 50 && lng > -125 && lng < -66;
}

function addressQuery(f) {
  const street = String(f['Address'] || '').trim();
  const city = String(f['City'] || '').trim();
  const state = String(f['State'] || 'WI').trim();
  const zip = String(f['ZIP'] || '').trim();
  if (street && city && street.toLowerCase().includes(city.toLowerCase())) return street;
  return [street, city, `${state} ${zip}`.trim()].filter(Boolean).join(', ');
}

async function fetchJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// U.S. Census geocoder first (free, no key), then OpenStreetMap's Nominatim as a backup.
async function geocode(query) {
  if (!query) return null;
  const census = await fetchJson(
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(query)
  );
  const m = census && census.result && census.result.addressMatches && census.result.addressMatches[0];
  if (m && m.coordinates) {
    const lat = Number(m.coordinates.y), lng = Number(m.coordinates.x);
    if (validCoords(lat, lng)) return { lat, lng };
  }
  const osm = await fetchJson(
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' + encodeURIComponent(query),
    { 'User-Agent': 'TOEConnect/1.0 (toeconnect4@gmail.com)' }
  );
  if (Array.isArray(osm) && osm[0]) {
    const lat = Number(osm[0].lat), lng = Number(osm[0].lon);
    if (validCoords(lat, lng)) return { lat, lng };
  }
  return null;
}

// Returns { lat, lng } for a listing with a public address, or null. Saves new coordinates to Airtable (best effort).
async function mapCoordinates({ fields, recordId, baseId, apiKey, table }) {
  const visibility = fields['Address Visibility'];
  if (visibility === 'Private' || visibility === 'None') return null;
  if (!String(fields['Address'] || '').trim()) return null;

  const savedLat = parseFloat(fields['Latitude']);
  const savedLng = parseFloat(fields['Longitude']);
  if (validCoords(savedLat, savedLng)) return { lat: savedLat, lng: savedLng };

  const found = await geocode(addressQuery(fields));
  if (!found) return null;
  try {
    await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { Latitude: found.lat, Longitude: found.lng }, typecast: true })
    });
  } catch (e) { /* the map still shows; it will just look the address up again next time */ }
  return found;
}

exports.handler = async function (event) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const table = 'Businesses';
  const id = event.queryStringParameters && event.queryStringParameters.id;

  // Airtable record IDs look like "rec" followed by letters and numbers; anything else is rejected.
  if (!id || !/^rec[A-Za-z0-9]{10,20}$/.test(id)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid id parameter' }) };
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

    const coords = await mapCoordinates({ fields: record.fields, recordId: record.id, baseId, apiKey, table });

    const business = {
      id: record.id,
      name: record.fields['Business Name'] || '',
      category: record.fields['Category'] || '',
      city: record.fields['City'] || '',
      ...locationFields(record.fields),
      mapLat: coords ? coords.lat : null,
      mapLng: coords ? coords.lng : null,
      description: record.fields['Short Description'] || '',
      fullBio: record.fields['Full Bio'] || '',
      website: record.fields['Website / Social'] || '',
      phone: record.fields['Phone'] || '',
      email: record.fields['Email Public'] ? (record.fields['Contact Email'] || '') : '',
      videoUrl: safeUrl(record.fields['Video URL']),
      bookingUrl: safeUrl(record.fields['Booking Link']),
      logoUrl: (record.fields['Logo/Photo'] && record.fields['Logo/Photo'][0] && record.fields['Logo/Photo'][0].url) || '',
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
