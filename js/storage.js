// ===== DATA STORAGE MODULE — FIREBASE =====
const BLESSINGS_REF = 'blessings';

// Get all blessings (one-time read)
function getAllBlessings() {
  return new Promise((resolve) => {
    db.ref(BLESSINGS_REF).once('value').then(snapshot => {
      const data = snapshot.val();
      if (!data) return resolve([]);
      const arr = Object.keys(data).map(key => ({ ...data[key], id: key }));
      arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      resolve(arr);
    }).catch(() => resolve([]));
  });
}

// Save a new blessing
function saveBlessing(blessing) {
  const ref = db.ref(BLESSINGS_REF).push();
  blessing.id = ref.key;
  blessing.createdAt = new Date().toISOString();
  ref.set(blessing);
  return blessing;
}

// Delete a single blessing
function deleteBlessing(id) {
  return db.ref(BLESSINGS_REF + '/' + id).remove();
}

// Clear all blessings
function clearAllBlessings() {
  return db.ref(BLESSINGS_REF).remove();
}

// Listen for new blessings in real-time (returns unsubscribe function)
function onNewBlessing(callback) {
  const ref = db.ref(BLESSINGS_REF);
  ref.limitToLast(1).on('child_added', snapshot => {
    const blessing = { ...snapshot.val(), id: snapshot.key };
    callback(blessing);
  });
  return () => ref.off('child_added');
}

// Listen for all changes in real-time
function onBlessingsChanged(callback) {
  const ref = db.ref(BLESSINGS_REF);
  ref.on('value', snapshot => {
    const data = snapshot.val();
    if (!data) return callback([]);
    const arr = Object.keys(data).map(key => ({ ...data[key], id: key }));
    arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    callback(arr);
  });
  return () => ref.off('value');
}

// Compress image before upload
function compressImage(file, maxWidth = 1600, quality = 0.85) {
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

function getStorageUsage() {
  return getAllBlessings().then(blessings => {
    const json = JSON.stringify(blessings);
    const usedKB = Math.round(new Blob([json]).size / 1024);
    return { usedKB, usedMB: (usedKB / 1024).toFixed(2) };
  });
}

function exportDataAsJson() {
  getAllBlessings().then(blessings => {
    const blob = new Blob([JSON.stringify(blessings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blessings_backup.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function importDataFromJson(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (Array.isArray(data)) {
      // Clear and re-import
      return clearAllBlessings().then(() => {
        const promises = data.map(b => {
          const ref = db.ref(BLESSINGS_REF).push();
          b.id = ref.key;
          return ref.set(b);
        });
        return Promise.all(promises).then(() => true);
      });
    }
    return Promise.resolve(false);
  } catch (e) {
    return Promise.resolve(false);
  }
}
