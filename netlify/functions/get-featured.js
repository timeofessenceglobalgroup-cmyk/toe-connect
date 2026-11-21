// Returns the one business currently shown in "30 Seconds to Connect" on the home page.
// A business is featured when its "30 Seconds Feature" box is checked in Airtable and its Status is Approved.
// If more than one is checked, the one with the newest "30 Seconds Date" is used.
// If none is checked, the home page simply hides the card.

// Links must be real https:// links; anything else is dropped so it never reaches the page.
function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https:\/\/\S+$/i.test(s) ? s : '';
}

function firstAttachmentUrl(v) {
  return (Array.isArray(v) && v[0] && v[0].url) || '';
}

exports.handler = async function () {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const table = 'Businesses';

  if (!baseId || !apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing Airtable configuration.' }) };
  }

  const formula = `AND({Status}='Approved',{30 Seconds Feature})`;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}` +
    `?filterByFormula=${encodeURIComponent(formula)}` +
    `&maxRecords=1` +
    `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent('30 Seconds Date')}&sort%5B0%5D%5Bdirection%5D=desc`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const data = await res.json();

    if (!res.ok) {
      // Most likely the two new Airtable columns haven't been added yet. The home page just hides the card.
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: null })
      };
    }

    const record = (data.records || [])[0];
    if (!record) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        body: JSON.stringify({ featured: null })
      };
    }

    const f = record.fields;
    const visibility = f['Address Visibility'];
    const hidden = visibility === 'Private' || visibility === 'None';

    const featured = {
      id: record.id,
      businessName: f['Business Name'] || '',
      ownerName: f['Spotlight Owner Name'] || '',
      category: f['Category'] || '',
      city: f['City'] || '',
      // A private (home-based) address is never sent to the browser; only the city is shown.
      homeBased: visibility === 'Private',
      addressHidden: hidden,
      description: f['Short Description'] || '',
      answer1: f['Spotlight Answer 1'] || '',
      answer2: f['Spotlight Answer 2'] || '',
      answer3: f['Spotlight Answer 3'] || '',
      photoUrl: firstAttachmentUrl(f['Spotlight Photo']) || firstAttachmentUrl(f['Logo/Photo']),
      photoIsLogo: !firstAttachmentUrl(f['Spotlight Photo']) && !!firstAttachmentUrl(f['Logo/Photo']),
      bookingUrl: safeUrl(f['Booking Link']),
      videoUrl: safeUrl(f['Video URL']),
      websiteUrl: safeUrl(f['Website / Social'])
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify({ featured })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured: null })
    };
  }
};
