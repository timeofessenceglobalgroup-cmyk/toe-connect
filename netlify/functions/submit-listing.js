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

  // --- Location ---
  const addressModes = { public: 'Public', private: 'Private', none: 'None' };
  const addressMode = addressModes[data.addressMode] ? data.addressMode : null;
  const city = String(data.city || '').trim().replace(/,?\s*(WI|Wisconsin)\.?$/i, '').trim();
  const zip = String(data.zip || '').trim();
  const street = addressMode === 'public' ? String(data.street || '').trim() : '';
  const fullAddress = addressMode === 'public' && street ? `${street}, ${city}, WI ${zip}` : '';

  // --- Hours (stored as one line per day, e.g. "Monday: 9:00 AM - 5:00 PM") ---
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const to12h = (t) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t || ''));
    if (!m) return null;
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  let hoursType = 'Not listed';
  let hoursText = '';
  let hoursInvalid = false;
  if (data.hoursMode === 'appointment') {
    hoursType = 'By appointment';
  } else if (data.hoursMode === 'set') {
    const rows = Array.isArray(data.hours) ? data.hours : [];
    const lines = [];
    for (const day of DAYS) {
      const r = rows.find(x => x && x.day === day) || {};
      if (r.closed) { lines.push(`${day}: Closed`); continue; }
      const o = to12h(r.open);
      const c = to12h(r.close);
      if (!o || !c) { hoursInvalid = true; break; }
      lines.push(`${day}: ${o} - ${c}`);
    }
    if (!hoursInvalid && lines.every(l => l.endsWith('Closed'))) hoursInvalid = true;
    hoursType = 'Set hours';
    hoursText = lines.join('\n');
  }

  // --- Booking link (optional; must be a real https:// link) ---
  const booking = String(data.booking || '').trim();
  const bookingInvalid = booking !== '' && !/^https:\/\/\S+\.\S+$/i.test(booking);

  // Server-side validation — never trust the browser alone.
  const missing = [];
  if (!data.bizname) missing.push('bizname');
  if (!data.category) missing.push('category');
  if (!city) missing.push('city');
  if (!/^\d{5}(-\d{4})?$/.test(zip)) missing.push('zip');
  if (!addressMode) missing.push('addressMode');
  if (addressMode === 'public' && !street) missing.push('street');
  if (hoursInvalid) missing.push('hours');
  if (!data.shortdesc) missing.push('shortdesc');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) missing.push('email');
  if (!data.blackOwned) missing.push('blackOwned');
  if (needsLicense && !data.license) missing.push('license');
  if (bookingInvalid) missing.push('booking');

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
    'City': city,
    'State': 'WI',
    'ZIP': zip,
    // "Address" holds the full public address line (street, city, state, ZIP); it stays empty for home-based
    // and mobile/online-only listings so a private address is never displayed.
    'Address': fullAddress,
    'Address Visibility': addressModes[addressMode],
    'Hours Type': hoursType,
    'Hours': hoursText,
    'Short Description': data.shortdesc,
    'Full Bio': data.fullbio || '',
    'Contact Email': data.email,
    'Email Public': !!data.emailPublic,
    'Phone': data.phone || '',
    'Website / Social': data.website || '',
    'Video URL': data.video || '',
    'Booking Link': booking,
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
