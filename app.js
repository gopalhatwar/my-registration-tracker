// Form State & Storage keys
let currentStep = 1;
const STORAGE_KEY_SESSION = 'tracker_session_id';
const STORAGE_KEY_FORM_DATA = 'tracker_form_data';

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
            if (input.type === 'checkbox') {
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
    if (input.type === 'checkbox') {
        formData[input.name] = input.checked;
    } else {
        formData[input.name] = input.value;
    }
    localStorage.setItem(STORAGE_KEY_FORM_DATA, JSON.stringify(formData));
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
        btnNext.innerHTML = '💳 Submit Registration & Pay';
        btnNext.className = 'btn btn-primary';

        // Pre-fill parameters on the external payment URL
        const paymentBtn = document.getElementById('payment-link-btn');
        if (paymentBtn) {
            const name = encodeURIComponent(formData.name || '');
            const email = encodeURIComponent(formData.email || '');
            const mobile = encodeURIComponent(formData.mobile || '');
            // Append multiple standard parameter formats to maximize pre-fill compatibility
            paymentBtn.href = `https://pegasus.imarticus.org/payments/pay/?sessionId=${sessionId}&name=${name}&fullname=${name}&email=${email}&email_id=${email}&phone=${mobile}&mobile=${mobile}&contact=${mobile}&mobileNumber=${mobile}`;
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

    for (let field of requiredFields) {
        if (field.type === 'checkbox' && !field.checked) {
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
            btnNext.innerHTML = '💳 Submit Registration & Pay';
            btnNext.classList.remove('btn-disabled');
        }
    } catch (err) {
        console.error('Final submit error:', err);
        alert('Server connection error. Please try again.');
        btnNext.innerHTML = '💳 Submit Registration & Pay';
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
