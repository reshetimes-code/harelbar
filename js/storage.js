// ===== DATA STORAGE MODULE — FIREBASE (Multi-Tenant) =====

// Generate a short random event ID (6 chars)
function generateEventId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Get the blessings ref path for an event
function getBlessingsRef(eventId) {
  return 'events/' + eventId + '/blessings';
}

// ===== EVENT MANAGEMENT =====

// Generate 4-digit password for sub-admin
function generateEventPassword() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Create a new event
function createEvent(meta) {
  let eventId = generateEventId();
  meta.createdAt = new Date().toISOString();
  meta.status = 'active';
  var subAdminPassword = generateEventPassword();
  return db.ref('events/' + eventId + '/meta').set(meta).then(function() {
    // Password lives only in the lightweight /passwords path (not readable
    // by clients, and never duplicated into the publicly-readable meta object)
    db.ref('passwords/' + eventId).set(subAdminPassword);
    // Lightweight public index (no PII) so the kiosk screen (index.html) can
    // detect a brand-new event without ever reading the full events tree.
    db.ref('eventIndex/' + eventId).set({ createdAt: meta.createdAt });
    return eventId;
  });
}

// Get event metadata
function getEventMeta(eventId) {
  return db.ref('events/' + eventId + '/meta').once('value').then(snapshot => {
    return snapshot.val();
  });
}

// Get all events (one-time read)
function getAllEvents() {
  return db.ref('events').once('value').then(snapshot => {
    const data = snapshot.val();
    if (!data) return [];
    return Object.keys(data).map(key => ({
      id: key,
      meta: data[key].meta || {},
      blessingCount: data[key].blessings ? Object.keys(data[key].blessings).length : 0
    }));
  });
}

// Listen for events changes in real-time
function onEventsChanged(callback) {
  const ref = db.ref('events');
  ref.on('value', snapshot => {
    const data = snapshot.val();
    if (!data) return callback([]);
    const arr = Object.keys(data).map(key => ({
      id: key,
      meta: data[key].meta || {},
      blessingCount: data[key].blessings ? Object.keys(data[key].blessings).length : 0
    }));
    arr.sort((a, b) => (b.meta.createdAt || '').localeCompare(a.meta.createdAt || ''));
    callback(arr);
  });
  return () => ref.off('value');
}

// Delete an event entirely
function deleteEvent(eventId) {
  return db.ref('events/' + eventId).remove();
}

// ===== BLESSINGS =====

// Get all blessings for an event (one-time read)
function getAllBlessings(eventId) {
  return new Promise((resolve) => {
    db.ref(getBlessingsRef(eventId)).once('value').then(snapshot => {
      const data = snapshot.val();
      if (!data) return resolve([]);
      const arr = Object.keys(data).map(key => ({ ...data[key], id: key }));
      arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      resolve(arr);
    }).catch(() => resolve([]));
  });
}

// Save a new blessing to an event
function saveBlessing(eventId, blessing) {
  const ref = db.ref(getBlessingsRef(eventId)).push();
  blessing.id = ref.key;
  blessing.createdAt = new Date().toISOString();
  ref.set(blessing);
  return blessing;
}

// Delete a single blessing from an event
function deleteBlessing(eventId, id) {
  return db.ref(getBlessingsRef(eventId) + '/' + id).remove();
}

// Clear all blessings for an event
function clearAllBlessings(eventId) {
  return db.ref(getBlessingsRef(eventId)).remove();
}

// Listen for new blessings in real-time (returns unsubscribe function)
function onNewBlessing(eventId, callback) {
  const ref = db.ref(getBlessingsRef(eventId));
  ref.limitToLast(1).on('child_added', snapshot => {
    const blessing = { ...snapshot.val(), id: snapshot.key };
    callback(blessing);
  });
  return () => ref.off('child_added');
}

// Listen for all changes in real-time
function onBlessingsChanged(eventId, callback) {
  const ref = db.ref(getBlessingsRef(eventId));
  ref.on('value', snapshot => {
    const data = snapshot.val();
    if (!data) return callback([]);
    const arr = Object.keys(data).map(key => ({ ...data[key], id: key }));
    arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    callback(arr);
  });
  return () => ref.off('value');
}

// ===== SCREEN CONTROL =====

function getScreenControl(eventId) {
  return db.ref('events/' + eventId + '/screenControl/start');
}

// ===== LEADS (guests interested in hosting their own event) =====

// Save a new lead
function saveLead(lead) {
  const ref = db.ref('leads').push();
  lead.id = ref.key;
  lead.createdAt = Date.now();
  lead.contacted = false;
  ref.set(lead);
  return lead;
}

// Listen for leads changes in real-time (newest first)
function onLeadsChanged(callback) {
  const ref = db.ref('leads');
  ref.on('value', snapshot => {
    const data = snapshot.val();
    if (!data) return callback([]);
    const arr = Object.keys(data).map(key => ({ ...data[key], id: key }));
    arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(arr);
  });
  return () => ref.off('value');
}

// Mark a lead as contacted / not contacted
function setLeadContacted(leadId, contacted) {
  return db.ref('leads/' + leadId + '/contacted').set(contacted);
}

// Delete a lead
function deleteLead(leadId) {
  return db.ref('leads/' + leadId).remove();
}

// ===== UTILITIES =====

// Compress image before upload
function compressImage(file, maxWidth = 1200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getStorageUsage(eventId) {
  return getAllBlessings(eventId).then(blessings => {
    const json = JSON.stringify(blessings);
    const usedKB = Math.round(new Blob([json]).size / 1024);
    return { usedKB, usedMB: (usedKB / 1024).toFixed(2) };
  });
}

// Client-side content check - Hebrew bad words filter
var BAD_WORDS_HE = [
  // קללות וגידופים
  'זונה','שרמוטה','מטומטם','אידיוט','מניאק','חרא','חארה','לעזאזל','תזדיין','זדיין',
  'כוס','כוסית','זין','זיון','תמות','יימח','ימח','בן זונה','בת זונה','מזדיין','מזדיינת',
  'טמבל','דביל','מפגר','סתום','שתוק','מכוער','מכוערת',
  'חמור','פרה','חזיר','חזירה','מסריח','מסריחה',
  'יא אפס','חתיכת אפס','לך מפה','תסתלק',
  'כלבה','שרמוט','מניאקית','פסיכית','פסיכי','משוגע','משוגעת',
  'מגעיל','מגעילה','נאלח','נאלחה','מושחת','מושחתת',
  // בגידות ויחסים
  'בגד','בגדה','בוגד','בוגדת','בגידה','נתפס','נתפסה','תפסו אותו','תפסו אותה',
  'בשירותים','שירותים עם','מאחורי הגב','זוג עם','ישן עם','ישנה עם','שכב עם','שכבה עם',
  'מפרק','מפרקת','קרניים','קרן','עשה לה','עשתה לו','זיין את','זיינה את',
  'מאהב','מאהבת','פילגש','חובב','חובבת',
  'סקס','מיני','מינית','ערום','ערומה','עירום','עירומה',
  // אלימות ואיומים
  'תמות','למות','להרוג','לרצוח','אהרוג','ירצח','סכין','אקדח','נשק',
  'מכה','מכות','אלימות','אלים','אלימה',
  // גזענות
  'ערבי מסריח','כושי','נאצי','היטלר','שואה',
  // השמצות גוף ונכויות
  'שמן','שמנה','שמנמן','פיל','פילה','נכה','נכים','מפגר','מפגרת','מוגבל','מוגבלת',
  'צולע','צולעת','עיוור','עיוורת','חרש','חרשת','גמד','גמדה',
  // אנגלית
  'fuck','shit','bitch','dick','pussy','whore','slut','asshole',
  'idiot','stupid','moron','retard','kill','die','cheat','cheater',
  'sex','naked','nude','porn','fat','cripple','disabled'
];

// Phrases that indicate gossip/betrayal stories
var BAD_PHRASES_HE = [
  'נתפס עם','נתפסה עם','ראו אותו עם','ראו אותה עם',
  'הלך עם','הלכה עם','ברח עם','ברחה עם',
  'שמעתי ש','אומרים ש','כולם יודעים ש',
  'סוד ש','הסוד של','לא יודע ש','לא יודעת ש',
  'מכר סמים','סמים','משתמש ב','מכור ל',
  'ישב בכלא','כלא','מאסר','עבריין','פלילי',
  'גירושין','מתגרש','מתגרשת','עזב את','עזבה את'
];

// Normalize text - remove repeated chars (כּוּוֹסססס -> כוס)
function normalizeText(text) {
  // Remove repeated consecutive characters (more than 2)
  var normalized = text.replace(/(.)\1{2,}/g, '$1$1');
  // Remove spaces between single characters (כ ו ס -> כוס)
  normalized = normalized.replace(/(\S)\s(\S)\s(\S)/g, '$1$2$3');
  normalized = normalized.replace(/(\S)\s(\S)/g, '$1$2');
  return normalized;
}

function checkBlessingClientSide(name, text) {
  var combined = (name + ' ' + text).toLowerCase();
  var normalized = normalizeText(combined);

  // Check bad words in both original and normalized text
  for (var i = 0; i < BAD_WORDS_HE.length; i++) {
    if (combined.indexOf(BAD_WORDS_HE[i]) !== -1 || normalized.indexOf(BAD_WORDS_HE[i]) !== -1) {
      return Promise.resolve({
        approved: false,
        reason: 'הברכה מכילה מילים לא מתאימות לאירוע משפחתי. אנא ערכו את הטקסט.'
      });
    }
  }

  // Check bad phrases
  for (var j = 0; j < BAD_PHRASES_HE.length; j++) {
    if (combined.indexOf(BAD_PHRASES_HE[j]) !== -1 || normalized.indexOf(BAD_PHRASES_HE[j]) !== -1) {
      return Promise.resolve({
        approved: false,
        reason: 'הברכה מכילה תוכן לא מתאים לאירוע. ברכות צריכות להכיל איחולים טובים בלבד.'
      });
    }
  }

  // Check for excessive repeated characters (like סססעעממממקקק)
  if (/(.)\1{4,}/g.test(text)) {
    return Promise.resolve({
      approved: false,
      reason: 'הברכה מכילה תווים חוזרים. אנא כתבו ברכה תקינה.'
    });
  }

  return Promise.resolve({ approved: true, reason: '' });
}

// Extract eventId from URL path (for /e/{eventId} routes)
function getEventIdFromPath() {
  const path = window.location.pathname;
  const match = path.match(/\/e\/([a-z0-9]+)/);
  return match ? match[1] : null;
}

// Extract eventId from query string (?event={eventId})
function getEventIdFromQuery() {
  return new URLSearchParams(window.location.search).get('event');
}
