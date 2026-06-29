// ===== DATA STORAGE MODULE =====
const STORAGE_KEY = 'hareli_blessings';

function getAllBlessings() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error reading blessings:', e);
    return [];
  }
}

function saveBlessing(blessing) {
  const blessings = getAllBlessings();
  blessing.id = crypto.randomUUID();
  blessing.createdAt = new Date().toISOString();
  blessings.push(blessing);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blessings));
  return blessing;
}

function deleteBlessing(id) {
  const blessings = getAllBlessings().filter(b => b.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blessings));
}

function clearAllBlessings() {
  localStorage.removeItem(STORAGE_KEY);
}

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
  const data = localStorage.getItem(STORAGE_KEY) || '';
  const usedKB = Math.round(new Blob([data]).size / 1024);
  return { usedKB, usedMB: (usedKB / 1024).toFixed(2) };
}

function exportDataAsJson() {
  const blessings = getAllBlessings();
  const blob = new Blob([JSON.stringify(blessings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'blessings_backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importDataFromJson(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (Array.isArray(data)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    }
    return false;
  } catch (e) {
    console.error('Import error:', e);
    return false;
  }
}
