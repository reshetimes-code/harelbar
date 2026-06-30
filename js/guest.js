// ===== GUEST PAGE LOGIC =====
(function() {
  // Redirect to welcome if no phone
  if (!sessionStorage.getItem('guest_phone')) {
    window.location.href = 'welcome.html';
    return;
  }

  let selectedTemplateId = 1;
  let compressedPhoto = null;
  let currentBlessing = null;
  let cropper = null;

  const form = document.getElementById('blessing-form');
  const nameInput = document.getElementById('guest-name');
  const textInput = document.getElementById('blessing-text');
  const photoInput = document.getElementById('photo-input');
  const photoArea = document.getElementById('photo-area');
  const previewModal = document.getElementById('preview-modal');
  const cardPreview = document.getElementById('card-preview');
  const confirmBtn = document.getElementById('confirm-btn');
  const editBtn = document.getElementById('edit-btn');
  const formContainer = document.getElementById('form-container');
  const successState = document.getElementById('success-state');
  const newBlessingBtn = document.getElementById('new-blessing-btn');

  // Crop modal elements
  const cropModal = document.getElementById('crop-modal');
  const cropImage = document.getElementById('crop-image');
  const cropConfirm = document.getElementById('crop-confirm');
  const cropCancel = document.getElementById('crop-cancel');

  // Photo upload - click
  photoArea.addEventListener('click', function() {
    photoInput.click();
  });

  // Photo upload - drag & drop
  photoArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    photoArea.classList.add('dragover');
  });

  photoArea.addEventListener('dragleave', function() {
    photoArea.classList.remove('dragover');
  });

  photoArea.addEventListener('drop', function(e) {
    e.preventDefault();
    photoArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handlePhotoFile(e.dataTransfer.files[0]);
    }
  });

  photoInput.addEventListener('change', function() {
    if (photoInput.files.length) {
      handlePhotoFile(photoInput.files[0]);
    }
  });

  function handlePhotoFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('נא להעלות קובץ תמונה בלבד');
      return;
    }

    // Read file and open cropper
    const reader = new FileReader();
    reader.onload = function(e) {
      cropImage.src = e.target.result;
      cropModal.classList.add('active');

      // Destroy previous cropper if exists
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }

      // Wait for image to load then init cropper
      cropImage.onload = function() {
        cropper = new Cropper(cropImage, {
          aspectRatio: 1,
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 1,
          cropBoxResizable: true,
          cropBoxMovable: true,
          background: false,
          guides: false,
          center: true,
          highlight: false,
          responsive: true,
        });
      };
    };
    reader.readAsDataURL(file);
  }

  // Crop confirm
  cropConfirm.addEventListener('click', function() {
    if (!cropper) return;

    const canvas = cropper.getCroppedCanvas({
      width: 1200,
      height: 1200,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    compressedPhoto = canvas.toDataURL('image/jpeg', 0.85);

    // Close crop modal
    cropModal.classList.remove('active');
    cropper.destroy();
    cropper = null;

    // Show preview in upload area
    photoArea.classList.add('has-photo');
    photoArea.innerHTML = `
      <img src="${compressedPhoto}" class="photo-preview" alt="תצוגה מקדימה">
      <button type="button" class="remove-photo" onclick="removePhoto(event)">×</button>
    `;
    clearError('photo-group');
  });

  // Crop cancel
  cropCancel.addEventListener('click', function() {
    cropModal.classList.remove('active');
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
  });

  // Close crop modal on backdrop click
  cropModal.addEventListener('click', function(e) {
    if (e.target === cropModal) {
      cropModal.classList.remove('active');
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
    }
  });

  // Remove photo (global for onclick)
  window.removePhoto = function(e) {
    e.stopPropagation();
    compressedPhoto = null;
    photoArea.classList.remove('has-photo');
    photoArea.innerHTML = `
      <input type="file" id="photo-input" accept="image/*">
      <span class="upload-icon">📷</span>
      <span class="upload-text">לחצו כאן להעלאת תמונה</span>
    `;
    const newInput = document.getElementById('photo-input');
    newInput.addEventListener('change', function() {
      if (newInput.files.length) handlePhotoFile(newInput.files[0]);
    });
  };

  // Form submit -> preview
  form.addEventListener('submit', function(e) {
    e.preventDefault();

    if (!validateForm()) return;

    currentBlessing = {
      name: nameInput.value.trim(),
      phone: sessionStorage.getItem('guest_phone') || '',
      text: textInput.value.trim(),
      photoDataUrl: compressedPhoto,
      templateId: selectedTemplateId
    };

    cardPreview.innerHTML = renderCard(currentBlessing);
    previewModal.classList.add('active');
  });

  // Confirm send
  confirmBtn.addEventListener('click', function() {
    if (!currentBlessing) return;

    saveBlessing(currentBlessing);
    previewModal.classList.remove('active');
    formContainer.style.display = 'none';
    successState.classList.add('active');
    resetForm();

    document.dispatchEvent(new Event('blessing-sent'));
    if (window.confettiBurst) {
      setTimeout(() => window.confettiBurst(window.innerWidth / 2, window.innerHeight / 3, 120), 300);
    }
  });

  // Back to edit
  editBtn.addEventListener('click', function() {
    previewModal.classList.remove('active');
  });

  // Close modal on backdrop click
  previewModal.addEventListener('click', function(e) {
    if (e.target === previewModal) {
      previewModal.classList.remove('active');
    }
  });

  // New blessing
  newBlessingBtn.addEventListener('click', function() {
    successState.classList.remove('active');
    formContainer.style.display = 'block';
  });

  // Validation
  function validateForm() {
    let valid = true;

    if (!nameInput.value.trim()) {
      showError('name-group', 'name-error');
      valid = false;
    } else {
      clearError('name-group');
    }

    if (!textInput.value.trim()) {
      showError('text-group', 'text-error');
      valid = false;
    } else {
      clearError('text-group');
    }

    clearError('photo-group');

    return valid;
  }

  function showError(groupId, errorId) {
    document.getElementById(groupId).classList.add('error');
    if (errorId) document.getElementById(errorId).classList.add('show');
  }

  function clearError(groupId) {
    const group = document.getElementById(groupId);
    if (group) {
      group.classList.remove('error');
      const err = group.querySelector('.error-msg');
      if (err) err.classList.remove('show');
    }
  }

  nameInput.addEventListener('input', () => clearError('name-group'));
  textInput.addEventListener('input', () => clearError('text-group'));

  function resetForm() {
    form.reset();
    compressedPhoto = null;
    currentBlessing = null;
    selectedTemplateId = 1;

    photoArea.classList.remove('has-photo');
    photoArea.innerHTML = `
      <input type="file" id="photo-input" accept="image/*">
      <span class="upload-icon">📷</span>
      <span class="upload-text">לחצו כאן להעלאת תמונה</span>
    `;
    const newInput = document.getElementById('photo-input');
    newInput.addEventListener('change', function() {
      if (newInput.files.length) handlePhotoFile(newInput.files[0]);
    });
  }
})();
