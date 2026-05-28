// API Endpoints
const API_SESSIONS = '/api/admin/sessions';
const API_STATS = '/api/admin/stats';
const API_SETTINGS = '/api/admin/settings';
const API_TEST_NOTIFY = '/api/admin/test-notification';
const API_STREAM = '/api/admin/stream';

// In-memory data store
let allSessions = [];
let funnelStats = { 1: 0, 2: 0, 3: 0, 4: 0 };
let currentTab = 'dashboard';
let sseSource = null;

// Audio Alerts (Synthesized browser AudioContext chime)
function playAudioAlert(isComplete = false) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        if (isComplete) {
            // Completion double-chime (C5 -> G5)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.12); // G5
            
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        } else {
            // Progress short chime (E5)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
            
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        }
    } catch (e) {
        console.warn("Synthesizer audio blocked or not supported:", e);
    }
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
    switchTab('dashboard');
    loadDashboardData();
    connectSSE();
    loadSettings();
});

// Tab Switcher
function switchTab(tabId) {
    currentTab = tabId;
    
    // Toggle active classes on tab headers
    document.getElementById('tab-dashboard').classList.toggle('active', tabId === 'dashboard');
    document.getElementById('tab-settings').classList.toggle('active', tabId === 'settings');
    
    // Toggle view elements
    document.getElementById('view-dashboard').style.display = tabId === 'dashboard' ? 'block' : 'none';
    document.getElementById('view-settings').style.display = tabId === 'settings' ? 'block' : 'none';
}

// Fetch dashboard statistics and data list
async function loadDashboardData() {
    try {
        const [sessionsRes, statsRes] = await Promise.all([
            fetch(API_SESSIONS),
            fetch(API_STATS)
        ]);

        if (sessionsRes.ok) {
            allSessions = await sessionsRes.json();
            renderSessionsTable();
        }

        if (statsRes.ok) {
            const stats = await statsRes.json();
            renderStats(stats);
        }
    } catch (err) {
        console.error('Error fetching dashboard statistics:', err);
    }
}

// Render Stats widgets and Funnel Columns
function renderStats(stats) {
    document.getElementById('metric-visits').innerText = stats.total_visits || 0;
    document.getElementById('metric-active').innerText = stats.active_fillers || 0;
    document.getElementById('metric-completed').innerText = stats.completed || 0;
    
    // Calculate Drop-off Rate
    const started = stats.funnel[1] || 0;
    const completed = stats.funnel[4] || 0;
    let dropoff = 0;
    if (started > 0) {
        dropoff = Math.round(((started - completed) / started) * 100);
    }
    document.getElementById('metric-dropoff').innerText = `${dropoff}%`;

    // Render Funnel bars
    funnelStats = stats.funnel;
    const segmentLabels = ['Basic Info', 'Profile', 'Batch Prefs', 'Completed'];
    
    for (let s = 1; s <= 4; s++) {
        const count = stats.funnel[s] || 0;
        document.getElementById(`funnel-count-${s}`).innerText = `${count} Users`;
        
        // Percent of funnel stage relative to stage 1 (Total entrants)
        const percent = started > 0 ? Math.round((count / started) * 100) : 0;
        const bar = document.getElementById(`funnel-bar-${s}`);
        bar.style.width = started > 0 ? `${percent}%` : '0%';
        bar.innerText = started > 0 ? `${percent}%` : '0%';

        if (s === 4) {
            document.getElementById('funnel-percent-4').innerText = `${percent}% Conversion`;
        }
    }
}

// Render active sessions in HTML Table
function renderSessionsTable() {
    const tbody = document.getElementById('session-table-body');
    
    if (allSessions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <div class="empty-state-icon">📡</div>
                    <div>Waiting for incoming registrations...</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allSessions.map(session => {
        const fields = session.fields || {};
        const name = fields.name || 'Anonymous Visitor';
        const city = fields.city || 'Unknown';
        const segment = session.current_segment || 1;
        const lastUpdated = new Date(session.last_updated);
        
        // Segment badge formatting
        const badgeClasses = {
            1: 'badge badge-seg1',
            2: 'badge badge-seg2',
            3: 'badge badge-seg3',
            4: 'badge badge-seg4'
        };
        const badgeClass = badgeClasses[segment] || 'badge badge-seg1';
        
        const segmentNames = {
            1: '1. Basic Info',
            2: '2. Profile',
            3: '3. Preferences',
            4: '4. Completed'
        };
        const segmentName = segmentNames[segment] || `Step ${segment}`;

        // Completion percentage
        const progressPct = segment * 25;
        const progressClass = segment === 4 ? 'mini-progress-fill completed' : 'mini-progress-fill';

        // Avatar Initial
        const initial = name.charAt(0).toUpperCase();

        return `
            <tr>
                <td>
                    <div class="avatar-cell">
                        <div class="avatar">${initial}</div>
                        <div>
                            <div style="font-weight: 700;">${name}</div>
                            <div class="text-sub">${fields.email || 'No email'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div>${city}</div>
                    <div class="text-sub">${fields.mobile || 'No Mobile'}</div>
                </td>
                <td>
                    <span class="${badgeClass}">${segmentName}</span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="mini-progress">
                            <div class="${progressClass}" style="width: ${progressPct}%;"></div>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 600;">${progressPct}%</span>
                    </div>
                </td>
                <td>
                    <div>${formatTime(lastUpdated)}</div>
                    <div class="text-sub">${formatDate(lastUpdated)}</div>
                </td>
                <td>
                    <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.8rem;" onclick="openDetails('${session.id}')">
                        🔎 View
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Format datetime strings
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(date) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// SSE Connection Manager
function connectSSE() {
    const statusLabel = document.getElementById('stream-status');
    
    if (sseSource) {
        sseSource.close();
    }

    sseSource = new EventSource(API_STREAM);

    sseSource.onopen = () => {
        statusLabel.innerText = '🔴 Stream Connected (Live)';
        statusLabel.style.background = 'rgba(16, 185, 129, 0.15)';
        statusLabel.style.color = '#34d399';
        statusLabel.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    };

    sseSource.onerror = (err) => {
        statusLabel.innerText = '📡 Offline - Reconnecting...';
        statusLabel.style.background = 'rgba(239, 68, 68, 0.15)';
        statusLabel.style.color = '#f87171';
        statusLabel.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        
        // Retry connection after 5 seconds
        setTimeout(connectSSE, 5000);
    };

    sseSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'session_update') {
                handleLiveUpdate(data.session, data.is_new);
            }
        } catch (e) {
            // Catch ping messages or non-JSON formats
        }
    };
}

// Handle real-time incoming events
function handleLiveUpdate(session, isNew) {
    const fields = session.fields || {};
    const name = fields.name || 'Anonymous Visitor';
    const segment = session.current_segment || 1;
    
    // Play sound chime alert
    playAudioAlert(segment === 4);

    // Create Toast alert in dashboard UI
    const toastType = segment === 4 ? 'success' : 'info';
    let toastMsg = ``;
    if (segment === 4) {
        toastMsg = `<strong>🏆 Registration Completed!</strong><br>${name} completed the registration and payment.`;
    } else {
        const segName = {
            1: 'Basic Details',
            2: 'Profile details',
            3: 'Program preferences'
        }[segment] || `Step ${segment}`;
        toastMsg = `<strong>⚡ Progress Alert</strong><br>${name} advanced to ${segName}.`;
    }
    showToast(toastMsg, toastType);

    // Append to live feed
    appendFeedLog(session);

    // Reload list data and funnel graph updates
    loadDashboardData();
}

// Append new item to Live feed list
function appendFeedLog(session) {
    const feed = document.getElementById('activity-feed');
    const fields = session.fields || {};
    const name = fields.name || 'Anonymous Visitor';
    const segment = session.current_segment || 1;
    const timeStr = new Date(session.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Clean empty state if present
    const empty = feed.querySelector('.empty-state');
    if (empty) empty.remove();

    let icon = '👥';
    let iconClass = 'info';
    let logMsg = '';

    if (segment === 1) {
        logMsg = `User <strong>${name}</strong> started filling the form.`;
    } else if (segment === 2) {
        logMsg = `User <strong>${name}</strong> submitted Profile details.`;
        icon = '👔';
    } else if (segment === 3) {
        logMsg = `User <strong>${name}</strong> configured program preferences.`;
        icon = '⚙️';
        iconClass = 'warning';
    } else if (segment === 4) {
        logMsg = `User <strong>${name}</strong> completed registration and payment!`;
        icon = '🏆';
        iconClass = 'success';
    }

    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
        <div class="feed-icon ${iconClass}">${icon}</div>
        <div class="feed-content">
            <div class="feed-title">${logMsg}</div>
            <div class="feed-time">${timeStr}</div>
        </div>
    `;

    feed.insertBefore(item, feed.firstChild);

    // Caps the log feed list length to 8 items to prevent bloating
    if (feed.children.length > 8) {
        feed.removeChild(feed.lastChild);
    }
}

// Show toast alert
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-bin');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '🔔';
    if (type === 'success') icon = '🏆';
    
    toast.innerHTML = `
        <div style="font-size: 1.2rem;">${icon}</div>
        <div>${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove toast after 4.5 seconds
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// Open modal user detail view
function openDetails(sessionId) {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;
    
    const fields = session.fields || {};
    const modal = document.getElementById('details-modal');
    const content = document.getElementById('modal-content');
    
    const statusNames = {
        1: 'Segment 1: Basic Details',
        2: 'Segment 2: Profile & Experience',
        3: 'Segment 3: Program Preferences',
        4: 'Segment 4: Completed Registration & Payment'
    };

    content.innerHTML = `
        <!-- Status Banner -->
        <div class="info-section">
            <div class="info-section-title">Session Summary</div>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Active Step</span>
                    <span class="info-val">${statusNames[session.current_segment] || session.current_segment}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Started At</span>
                    <span class="info-val">${new Date(session.started_at).toLocaleString()}</span>
                </div>
            </div>
        </div>

        <!-- Segment 1 -->
        <div class="info-section">
            <div class="info-section-title" style="color: var(--primary);">Segment 1: Basic Details</div>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Full Name</span>
                    <span class="info-val">${fields.name || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Mobile Number</span>
                    <span class="info-val">${fields.mobile || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Alternate Number</span>
                    <span class="info-val">${fields.altMobile || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Email Address</span>
                    <span class="info-val">${fields.email || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">City</span>
                    <span class="info-val">${fields.city || '—'}</span>
                </div>
            </div>
        </div>

        <!-- Segment 2 -->
        <div class="info-section">
            <div class="info-section-title" style="color: var(--secondary);">Segment 2: Profile & Experience</div>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Current Status</span>
                    <span class="info-val">${fields.currentStatus || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">College / Company</span>
                    <span class="info-val">${fields.organization || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Domain / Specialization</span>
                    <span class="info-val">${fields.specialization || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Years of Experience</span>
                    <span class="info-val">${fields.experience || '—'}</span>
                </div>
                <div class="info-item" style="grid-column: span 2;">
                    <span class="info-label">Highest Qualification / Graduation Year</span>
                    <span class="info-val">${fields.highestQualification || '—'}</span>
                </div>
            </div>
        </div>

        <!-- Segment 3 -->
        <div class="info-section">
            <div class="info-section-title" style="color: var(--warning);">Segment 3: Program Preferences</div>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Referral / Source</span>
                    <span class="info-val">${fields.source || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Info Received?</span>
                    <span class="info-val">${fields.courseInfoReceived || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Counselor Rating</span>
                    <span class="info-val">${fields.counselorRating || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Recommend Imarticus?</span>
                    <span class="info-val">${fields.recommendImarticus || '—'}</span>
                </div>
                <div class="info-item" style="grid-column: span 2;">
                    <span class="info-label">Main Objective</span>
                    <span class="info-val">${fields.mainObjective || '—'}</span>
                </div>
            </div>
        </div>

        <!-- Segment 4 -->
        <div class="info-section" style="border: none; padding-bottom: 0;">
            <div class="info-section-title" style="color: var(--success);">Segment 4: Payment Details</div>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Transaction ID / UTR</span>
                    <span class="info-val" style="color: var(--success); font-family: monospace; font-size: 1rem;">
                        ${fields.transactionId || '—'}
                    </span>
                </div>
                <div class="info-item">
                    <span class="info-label">Payment Method</span>
                    <span class="info-val">${fields.paymentMethod || '—'}</span>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('details-modal').classList.remove('active');
}

// Close modal when clicking background overlay
document.getElementById('details-modal').addEventListener('click', (e) => {
    if (e.target.id === 'details-modal') {
        closeModal();
    }
});

// Load Integration credentials settings
async function loadSettings() {
    try {
        const res = await fetch(API_SETTINGS);
        if (res.ok) {
            const settings = await res.json();
            document.getElementById('telegram_token').value = settings.telegram_token || '';
            document.getElementById('telegram_chat_id').value = settings.telegram_chat_id || '';
            document.getElementById('discord_webhook').value = settings.discord_webhook || '';
            document.getElementById('enable_notifications').checked = settings.enable_notifications !== false;
        }
    } catch (e) {
        console.error("Error loading settings:", e);
    }
}

// POST: Save configurations
async function saveSettings(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-settings');
    btn.innerText = 'Saving...';
    btn.disabled = true;

    const payload = {
        telegram_token: document.getElementById('telegram_token').value.trim(),
        telegram_chat_id: document.getElementById('telegram_chat_id').value.trim(),
        discord_webhook: document.getElementById('discord_webhook').value.trim(),
        enable_notifications: document.getElementById('enable_notifications').checked
    };

    try {
        const res = await fetch(API_SETTINGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast("Integrations config saved successfully!", "success");
        } else {
            showToast("Failed to save credentials.", "error");
        }
    } catch (err) {
        showToast("Error connecting to server.", "error");
    } finally {
        btn.innerText = 'Save Settings';
        btn.disabled = false;
    }
}

// Trigger integration tests
async function testNotification() {
    const payload = {
        telegram_token: document.getElementById('telegram_token').value.trim(),
        telegram_chat_id: document.getElementById('telegram_chat_id').value.trim(),
        discord_webhook: document.getElementById('discord_webhook').value.trim()
    };

    if (!payload.telegram_token && !payload.discord_webhook) {
        showToast("Enter a token or webhook to test first.", "info");
        return;
    }

    showToast("Triggering test messages...", "info");
    try {
        const res = await fetch(API_TEST_NOTIFY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast("Test request sent! Check your integrations.", "success");
        } else {
            showToast("Test request returned an error code.", "error");
        }
    } catch (err) {
        showToast("Failed to trigger tests.", "error");
    }
}
