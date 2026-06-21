// Form State & Storage keys
let currentStep = 1;
const STORAGE_KEY_SESSION = 'tracker_session_id';
const STORAGE_KEY_FORM_DATA = 'tracker_form_data';

// Program ID mappings for auto-selecting on Pegasus payment link
const PROGRAM_ID_MAP = {
    "Association of Chartered Certified Accountants (ACCA)": "642c16c518696f4c68996c05",
    "Chartered Financial Analyst (CFA) - Level 1": "6565d97a8ac911285fa460f2",
    "Chartered Financial Analyst (CFA)": "659fad234e1737d7d027eb9b",
    "Certified Investment Banking Operations Professional": "65e715a3a92aed9a28442fa4",
    "Financial Risk Manager - FRM": "67e0fcec35f7a9574927539b",
    "Certification in Data Analytics with Gen AI": "6819df0a9456eeff7edcad0e",
    "Certified Management Accountant Offline - CMA Off": "691c0612c071fb6c7c76774f",
    "Association of Chartered Certified Accountants Offline- ACCA Off": "691c0a4319a4cdd5cd59bbfc",
    "Financial Modeling & Valuations Analyst (FMVA)": "6a1833819f3c776c6c54761f",
    "Certified FinTech Operations Program (CFOP)": "6a1834621143fccbbc79c752",
    "Certification in Artificial Intelligence and Machine Learning": "62c52c7dc910112f702464b9",
    "Post Graduate Program In Banking And Finance": "6273a1b3bf8cd20ebb4f4a4f",
    "Financial Analysis Prodegree": "62692de23a7e894499825ba1",
    "Postgraduate Program in Data Science and Analytics": "63a4437c19495e23014fb43a",
    "Post Graduate Program in Financial Analysis": "642d6043c9b6d856751c2cfa",
    "Certified Public Accountant (CPA)": "64c7bcce00c336436a5094f7"
};

// Server base URL (dynamic based on current host)
const API_URL = `${window.location.origin}/api/session/update`;

// Dom elements
const form = document.getElementById('registration-form');
const btnBack = document.getElementById('btn-back');
const btnNext = document.getElementById('btn-next');
const successPanel = document.getElementById('success-panel');
const formCardPanel = document.getElementById('form-card-panel');

// Get stored data on load
let sessionId = localStorage.getItem(STORAGE_KEY_SESSION) || '';
let formData = JSON.parse(localStorage.getItem(STORAGE_KEY_FORM_DATA)) || {};

// Initialize application on load
window.addEventListener('DOMContentLoaded', () => {
    populateForm();
    setupAutosave();
    setupPaymentTracking();
    setupScreenshotUpload();
    navigateToStep(currentStep, false);
});

function setupPaymentTracking() {
    const paymentBtn = document.getElementById('payment-link-btn');
    if (paymentBtn) {
        paymentBtn.addEventListener('click', () => {
            formData['payment_status'] = 'Clicked Payment Link';
            localStorage.setItem(STORAGE_KEY_FORM_DATA, JSON.stringify(formData));
            syncWithBackend();
        });
    }
}

// Fill fields with stored values
function populateForm() {
    Object.keys(formData).forEach(key => {
        const input = form.elements[key];
        if (input) {
            if (input.type === 'file') {
                if (formData[key]) {
                    showScreenshotPreview(formData[key]);
                }
            } else if (input.type === 'checkbox') {
                input.checked = formData[key];
            } else {
                input.value = formData[key];
            }
        }
    });
}

// Watch inputs and save state on field change/blur
function setupAutosave() {
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        // Trigger auto save and API sync on blur or change
        input.addEventListener('blur', () => {
            saveField(input);
            syncWithBackend();
        });
        input.addEventListener('change', () => {
            saveField(input);
            syncWithBackend();
        });
    });
}

function saveField(input) {
    if (input.type === 'file') return; // Skip file inputs, handled separately
    if (input.type === 'checkbox') {
        formData[input.name] = input.checked;
    } else {
        formData[input.name] = input.value;
    }
    localStorage.setItem(STORAGE_KEY_FORM_DATA, JSON.stringify(formData));
}

function setupScreenshotUpload() {
    const card = document.getElementById('screenshot-upload-card');
    const fileInput = document.getElementById('paymentScreenshot');
    const removeBtn = document.getElementById('btn-remove-screenshot');
    
    if (!card || !fileInput || !removeBtn) return;
    
    // Trigger file input click when card is clicked
    card.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Drag & Drop event listeners
    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.style.borderColor = 'var(--primary)';
        card.style.background = 'rgba(15, 23, 42, 0.6)';
    });
    
    card.addEventListener('dragleave', () => {
        card.style.borderColor = '';
        card.style.background = '';
    });
    
    card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.style.borderColor = '';
        card.style.background = '';
        
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    });
    
    // File input change listener
    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    });
    
    // Remove button listener
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeScreenshot();
    });
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file (PNG, JPG, JPEG).');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Data = e.target.result;
        
        // Save in state
        formData['paymentScreenshot'] = base64Data;
        localStorage.setItem(STORAGE_KEY_FORM_DATA, JSON.stringify(formData));
        
        // Show preview
        showScreenshotPreview(base64Data);
        
        // Clear validation style
        const card = document.getElementById('screenshot-upload-card');
        if (card) {
            card.style.borderColor = '';
        }
        
        // Sync with backend
        syncWithBackend();
    };
    reader.readAsDataURL(file);
}

function showScreenshotPreview(base64Data) {
    const card = document.getElementById('screenshot-upload-card');
    const container = document.getElementById('screenshot-preview-container');
    const img = document.getElementById('screenshot-preview-img');
    
    if (img && card && container) {
        img.src = base64Data;
        card.style.display = 'none';
        container.style.display = 'flex';
    }
}

function removeScreenshot() {
    const card = document.getElementById('screenshot-upload-card');
    const container = document.getElementById('screenshot-preview-container');
    const img = document.getElementById('screenshot-preview-img');
    const fileInput = document.getElementById('paymentScreenshot');
    
    if (img && card && container && fileInput) {
        img.src = '';
        card.style.display = 'flex';
        container.style.display = 'none';
        fileInput.value = '';
    }
    
    delete formData['paymentScreenshot'];
    localStorage.setItem(STORAGE_KEY_FORM_DATA, JSON.stringify(formData));
    syncWithBackend();
}

// Synchronize user progress to server
async function syncWithBackend() {
    // Only sync if they have filled at least the name or mobile in segment 1 (to prevent spamming blank sessions)
    const nameVal = formData['name'] || '';
    const mobileVal = formData['mobile'] || '';
    if (!nameVal && !mobileVal) return;

    const payload = {
        sessionId: sessionId,
        segment: currentStep,
        fields: formData
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.sessionId) {
                sessionId = data.sessionId;
                localStorage.setItem(STORAGE_KEY_SESSION, sessionId);
            }
        }
    } catch (err) {
        console.error('Progress sync error:', err);
    }
}

// Navigating steps
function navigateToStep(step, runValidation = true) {
    // If going forward, validate current step before letting user proceed
    if (runValidation && step > currentStep) {
        if (!validateStep(currentStep)) return;
    }

    currentStep = step;

    // Toggle segment elements visibility
    const segments = document.querySelectorAll('.form-segment');
    segments.forEach((seg, index) => {
        if (index + 1 === step) {
            seg.classList.add('active');
        } else {
            seg.classList.remove('active');
        }
    });

    // Update progress stepper circles/labels in UI
    const steps = document.querySelectorAll('.step-node');
    steps.forEach((node, index) => {
        const nodeStep = index + 1;
        node.classList.remove('active', 'completed');
        if (nodeStep === step) {
            node.classList.add('active');
        } else if (nodeStep < step) {
            node.classList.add('completed');
        }
    });

    // Update progress connection line length
    const progressFill = document.getElementById('step-progress-line');
    const fillPercent = ((step - 1) / 3) * 100;
    progressFill.style.width = `${fillPercent}%`;

    // Configure Back button disabled state
    if (step === 1) {
        btnBack.classList.add('btn-disabled');
    } else {
        btnBack.classList.remove('btn-disabled');
    }

    // Configure Next button text (Next Step vs Submit)
    if (step === 4) {
        btnNext.innerHTML = '📋 Submit Application and Fill Basic Enrollment details';
        btnNext.className = 'btn btn-primary';

        // Pre-fill parameters on the external payment URL
        const paymentBtn = document.getElementById('payment-link-btn');
        if (paymentBtn) {
            const name = encodeURIComponent(formData.name || '');
            const email = encodeURIComponent(formData.email || '');
            const mobile = encodeURIComponent(formData.mobile || '');
            
            let paymentUrl = `https://pegasus.imarticus.org/payments/pay/?sessionId=${sessionId}&name=${name}&fullname=${name}&email=${email}&email_id=${email}&phone=${mobile}&mobile=${mobile}&contact=${mobile}&mobileNumber=${mobile}`;
            
            // Auto-select program if a valid program is selected (not NONE OF THE ABOVE)
            const selectedProgram = formData.program;
            if (selectedProgram && selectedProgram !== 'NONE OF THE ABOVE -' && PROGRAM_ID_MAP[selectedProgram]) {
                const programId = PROGRAM_ID_MAP[selectedProgram];
                paymentUrl += `&crs_pg_id=${encodeURIComponent(programId)}`;
            }
            
            paymentBtn.href = paymentUrl;
        }
    } else {
        btnNext.innerHTML = 'Next Step →';
        btnNext.className = 'btn btn-primary';
    }

    // Sync state to backend
    syncWithBackend();
}

function changeStep(offset) {
    const nextStep = currentStep + offset;
    if (nextStep >= 1 && nextStep <= 4) {
        navigateToStep(nextStep, offset > 0);
    } else if (nextStep === 5) {
        // Submit button clicked on step 4
        submitForm();
    }
}

// Validating fields inside the current segment
function validateStep(step) {
    const activeSegment = document.getElementById(`segment-${step}`);
    if (!activeSegment) return true;

    const requiredFields = activeSegment.querySelectorAll('[required]');
    let isValid = true;

    // Reset error styling
    activeSegment.querySelectorAll('.input-wrapper input, input, select, textarea').forEach(el => {
        el.style.borderColor = '';
    });
    const card = document.getElementById('screenshot-upload-card');
    if (card) {
        card.style.borderColor = '';
    }

    for (let field of requiredFields) {
        if (field.id === 'paymentScreenshot') {
            if (!formData['paymentScreenshot']) {
                if (card) {
                    card.style.borderColor = 'var(--danger)';
                }
                isValid = false;
            }
        } else if (field.type === 'checkbox' && !field.checked) {
            field.closest('.checkbox-label').style.color = 'var(--danger)';
            isValid = false;
        } else if (!field.value.trim()) {
            field.style.borderColor = 'var(--danger)';
            isValid = false;
        } else if (field.type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(field.value.trim())) {
                field.style.borderColor = 'var(--danger)';
                isValid = false;
            }
        } else if (field.type === 'tel') {
            const phoneRegex = /^[6-9]\d{9}$/; // Valid Indian mobile format (10 digits starting with 6-9)
            if (!phoneRegex.test(field.value.replace(/\s+/g, ''))) {
                field.style.borderColor = 'var(--danger)';
                isValid = false;
            }
        }
    }

    if (!isValid) {
        // Trigger alert animation on the card
        formCardPanel.style.animation = 'none';
        formCardPanel.offsetHeight; // Trigger reflow
        formCardPanel.style.animation = 'shake 0.4s ease-in-out';
        
        // Dynamic shake animation injection if not already in styles
        if (!document.getElementById('shake-keyframes')) {
            const style = document.createElement('style');
            style.id = 'shake-keyframes';
            style.innerHTML = `
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-6px); }
                    75% { transform: translateX(6px); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    return isValid;
}

// Final form submit execution
async function submitForm() {
    if (!validateStep(4)) return;

    btnNext.innerHTML = 'Submitting...';
    btnNext.classList.add('btn-disabled');

    // Final Sync
    const payload = {
        sessionId: sessionId,
        segment: 4,
        fields: formData
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Hide form, show success screen
            formCardPanel.style.display = 'none';
            successPanel.style.display = 'block';
            
            // Clean localStorage form data but keep sessionId for session logs
            localStorage.removeItem(STORAGE_KEY_FORM_DATA);
        } else {
            alert('Something went wrong. Please check details and try again.');
            btnNext.innerHTML = '📋 Submit Application and Fill Basic Enrollment details';
            btnNext.classList.remove('btn-disabled');
        }
    } catch (err) {
        console.error('Final submit error:', err);
        alert('Server connection error. Please try again.');
        btnNext.innerHTML = '📋 Submit Application and Fill Basic Enrollment details';
        btnNext.classList.remove('btn-disabled');
    }
}

// Reset form for multiple registrations
function resetFormState() {
    localStorage.removeItem(STORAGE_KEY_FORM_DATA);
    localStorage.removeItem(STORAGE_KEY_SESSION);
    sessionId = '';
    formData = {};
    form.reset();
    
    currentStep = 1;
    successPanel.style.display = 'none';
    formCardPanel.style.display = 'block';
    
    navigateToStep(1, false);
}
