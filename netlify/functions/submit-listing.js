// Writes a new business submission into Airtable as Status: Pending.
// Keeps the Airtable API key on the server side only.

// ---- Phone and possible-duplicate helpers ----
// Splits "(414) 348-0307 ext. 2", "414-348-0307 x2", "4143480307" etc. into the 10-digit main number and an extension.
function splitPhone(p) {
  const raw = String(p || '').trim();
  const i = raw.search(/ext(?:ension)?\.?|[x#,]/i);
  const mainPart = i >= 0 ? raw.slice(0, i) : raw;
  const ext = i >= 0 ? raw.slice(i).replace(/\D/g, '') : '';
  let d = mainPart.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return { main: d.length === 10 ? d : '', ext };
}

// When a number has an extension, save it in one consistent shape: 414-348-0307 x2
function cleanPhoneForSave(p) {
  const { main, ext } = splitPhone(p);
  if (main && ext) return `${main.slice(0, 3)}-${main.slice(3, 6)}-${main.slice(6)} x${ext}`;
  return String(p || '').trim();
}

// Makes text safe to place inside a single-quoted Airtable formula string.
function formulaText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Looks for existing rows with the same email, or the same phone number AND extension.
// The same main number with a different extension is treated as a different business.
async function findPossibleDuplicates({ baseId, apiKey, table, email, phone }) {
  const conditions = [];
  const e = String(email || '').trim().toLowerCase();
  if (e) conditions.push(`LOWER(TRIM({Contact Email}))='${formulaText(e)}'`);
  const mine = splitPhone(phone);
  if (mine.main) {
    const stripped = `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({Phone}&'','(',''),')',''),'-',''),' ',''),'.',''),'+','')`;
    conditions.push(`FIND('${mine.main}',${stripped})>0`);
  }
  if (!conditions.length) return [];

  const formula = conditions.length > 1 ? `OR(${conditions.join(',')})` : conditions[0];
  const fieldParams = ['Business Name', 'Status', 'Phone', 'Contact Email']
    .map(f => `&fields%5B%5D=${encodeURIComponent(f)}`).join('');
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}` +
    `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=10${fieldParams}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return [];
  const data = await res.json();

  const matches = [];
  for (const r of data.records || []) {
    const theirEmail = String(r.fields['Contact Email'] || '').trim().toLowerCase();
    const theirs = splitPhone(r.fields['Phone']);
    const sameEmail = !!e && theirEmail === e;
    const samePhone = !!mine.main && theirs.main === mine.main && theirs.ext === mine.ext;
    if (sameEmail || samePhone) {
      matches.push({
        id: r.id,
        name: r.fields['Business Name'] || '(no name)',
        status: r.fields['Status'] || 'no status',
        why: sameEmail && samePhone ? 'email and phone' : (sameEmail ? 'email' : 'phone')
      });
    }
  }
  return matches;
}

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
    'Phone': cleanPhoneForSave(data.phone),
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

  // --- Possible duplicate check ---
  // This never blocks a submission: a lookup problem is ignored, and a match only adds a flag for you to review.
  // The owner is not told whether a match was found (that would reveal who is already listed).
  const duplicateFields = {};
  try {
    const dups = await findPossibleDuplicates({ baseId, apiKey, table, email: data.email, phone: data.phone });
    if (dups.length) {
      duplicateFields['Possible Duplicate'] = true;
      duplicateFields['Duplicate Note'] = 'Possible match: ' + dups.map(d => `${d.name} (${d.status}), same ${d.why}, ${d.id}`).join('; ');
    }
  } catch (err) {
    // ignore, carry on with the submission
  }

  const createRecord = (f) => fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: f, typecast: true })
  });

  try {
    let res = await createRecord({ ...fields, ...duplicateFields });
    let result = await res.json();

    // If the two flag columns haven't been added in Airtable yet, save the listing without them rather than lose it.
    if (!res.ok && res.status === 422 && Object.keys(duplicateFields).length) {
      res = await createRecord(fields);
      result = await res.json();
    }

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
