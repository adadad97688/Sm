import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { initializeFirestore, collection, addDoc, getDocs, updateDoc, doc, query, orderBy, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let app, db, auth, provider;
let currentUser = null;
let repairDatabase = [];
let activeRecordId = null;
let pendingImageSrc = null;
let currentFilter = 'all'; 
let currentDateFilter = '';
let isFabOpen = false;

window.shopProfile = { name: '', address: '', contact: '' };
window.userProfile = { name: '', contact: '' };

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/firebase-config');
        const config = await response.json();
        if(!config.apiKey) { alert("Configuration Error: Firebase Secrets not found."); return; }
        
        app = initializeApp(config);
        db = initializeFirestore(app, { experimentalForceLongPolling: true });
        auth = getAuth(app);
        provider = new GoogleAuthProvider();

        // Listen for Login State Changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                await loadCloudProfiles();
            } else {
                currentUser = null;
                repairDatabase = [];
                window.switchView('login-view');
                hideLoad();
            }
        });

    } catch (error) { console.error("Init failed:", error); }
});

function showLoad(msg) {
    document.getElementById('loading-text').innerText = msg;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoad() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

window.switchView = function(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if(viewId === 'dashboard-view') window.handleSearch();
};

// --- GOOGLE AUTHENTICATION ---
window.signInWithGoogle = function() {
    showLoad("Signing In...");
    signInWithPopup(auth, provider).catch(error => {
        hideLoad();
        alert("Sign In Error: " + error.message);
    });
};

window.signOutUser = function() {
    window.toggleSidebar();
    showLoad("Signing out...");
    signOut(auth); 
};

// --- PROFILE SYNC & ONBOARDING ---
async function loadCloudProfiles() {
    showLoad("Syncing Account...");
    try {
        const userDocRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        
        if (docSnap.exists()) {
            // Existing User
            const data = docSnap.data();
            window.userProfile = data.userProfile || { name: currentUser.displayName || '', contact: '' };
            window.shopProfile = data.shopProfile || { name: '', address: '', contact: '' };
            
            // Populate Edit Screens
            document.getElementById('user-name-input').value = window.userProfile.name;
            document.getElementById('user-contact-input').value = window.userProfile.contact || '';
            document.getElementById('shop-name-input').value = window.shopProfile.name;
            document.getElementById('shop-address-input').value = window.shopProfile.address;
            document.getElementById('shop-contact-input').value = window.shopProfile.contact;
            
            // Set Sidebar Header
            document.getElementById('sidebar-user-name').innerText = window.userProfile.name || currentUser.email;

            await fetchDatabaseRecords();
            window.switchView('dashboard-view');
        } else {
            // Brand New User -> Go to Onboarding (Prefill name from Google)
            document.getElementById('onboard-name').value = currentUser.displayName || '';
            document.getElementById('onboard-personal-contact').value = '';
            window.switchView('onboarding-view');
        }
    } catch(err) {
        alert("Failed to sync profiles: " + err.message);
    }
    hideLoad();
}

window.completeOnboarding = async function() {
    showLoad("Creating your Store...");
    window.userProfile = {
        name: document.getElementById('onboard-name').value.trim(),
        contact: document.getElementById('onboard-personal-contact').value.trim()
    };
    window.shopProfile = {
        name: document.getElementById('onboard-shop-name').value.trim(),
        address: document.getElementById('onboard-shop-address').value.trim(),
        contact: document.getElementById('onboard-shop-contact').value.trim()
    };
    
    try {
        await setDoc(doc(db, "users", currentUser.uid), {
            userProfile: window.userProfile,
            shopProfile: window.shopProfile,
            createdAt: Date.now()
        });
        await loadCloudProfiles();
    } catch(err) {
        alert("Onboarding failed: " + err.message);
        hideLoad();
    }
};

window.saveProfilesToCloud = async function(isUser) {
    showLoad("Updating Profile...");
    if (isUser) {
        window.userProfile.name = document.getElementById('user-name-input').value.trim();
        window.userProfile.contact = document.getElementById('user-contact-input').value.trim();
        document.getElementById('sidebar-user-name').innerText = window.userProfile.name || currentUser.email;
    } else {
        window.shopProfile.name = document.getElementById('shop-name-input').value.trim();
        window.shopProfile.address = document.getElementById('shop-address-input').value.trim();
        window.shopProfile.contact = document.getElementById('shop-contact-input').value.trim();
    }
    
    try {
        await setDoc(doc(db, "users", currentUser.uid), {
            userProfile: window.userProfile,
            shopProfile: window.shopProfile
        }, { merge: true });
        window.switchView('dashboard-view');
    } catch(err) {
        alert("Update failed: " + err.message);
    }
    hideLoad();
};

// --- FIRESTORE FETCH (USER SCOPED) ---
async function fetchDatabaseRecords() {
    if (!db || !currentUser) return;
    const q = query(collection(db, "users", currentUser.uid, "repairs"), orderBy("timestamp", "desc"));
    try {
        const querySnapshot = await getDocs(q);
        repairDatabase = [];
        querySnapshot.forEach((docSnap) => {
            repairDatabase.push({ firestoreId: docSnap.id, ...docSnap.data() });
        });
        window.handleSearch();
    } catch(e) { console.error("Fetch error", e); }
}

// --- UI & SIDEBAR TOGGLES ---
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if(sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
};

window.toggleSidebarAddMenu = function() {
    const menu = document.getElementById('sidebar-add-menu');
    const icon = document.getElementById('sidebar-add-icon');
    if(menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        menu.classList.add('flex');
        icon.classList.add('rotate-180');
    } else {
        menu.classList.add('hidden');
        menu.classList.remove('flex');
        icon.classList.remove('rotate-180');
    }
};

window.openProfileScreen = function(type) {
    window.toggleSidebar();
    if(type === 'shop') window.switchView('shop-profile-view');
    else window.switchView('user-profile-view');
};

window.toggleFabMenu = function(forceClose = false) {
    const menu = document.getElementById('fab-menu');
    const icon = document.getElementById('fab-icon');
    if (isFabOpen || forceClose) {
        menu.classList.replace('flex', 'hidden');
        icon.classList.remove('rotate-45');
        isFabOpen = false;
    } else {
        menu.classList.replace('hidden', 'flex');
        icon.classList.add('rotate-45');
        isFabOpen = true;
    }
};

// --- DATA ENTRY FLOW ---
window.uploadAndScanImage = async function(input) {
    if (!input.files || !input.files[0]) return;
    window.toggleFabMenu(true);
    if(!document.getElementById('sidebar').classList.contains('-translate-x-full')) window.toggleSidebar();
    
    showLoad("Extracting details & Uploading cloud image...");
    const formData = new FormData();
    formData.append('image', input.files[0]);

    try {
        const response = await fetch('/scan-image', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok) {
            pendingImageSrc = result.image_url; 
            window.openVerifyView(result);
        } else alert("System Error: " + (result.error || "Failed extraction"));
    } catch (err) { alert("Network error: " + err.message); } 
    finally { hideLoad(); input.value = ''; }
};

window.openManualEntry = function() {
    window.toggleFabMenu(true);
    if(!document.getElementById('sidebar').classList.contains('-translate-x-full')) window.toggleSidebar();
    pendingImageSrc = null;
    window.openVerifyView({ name: '', contact: '', problem: '', price: '' });
};

window.handleManualImageUpload = async function(input) {
    if (!input.files || !input.files[0]) return;
    showLoad("Uploading image...");
    const formData = new FormData();
    formData.append('image', input.files[0]);

    try {
        const response = await fetch('/scan-image', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok) {
            pendingImageSrc = result.image_url;
            document.getElementById('verify-image').src = pendingImageSrc;
            document.getElementById('verify-image').classList.remove('hidden');
            document.getElementById('verify-image-placeholder').classList.add('hidden');
        } else alert("Upload Failed.");
    } catch (err) { alert("Network error: " + err.message); }
    finally { hideLoad(); input.value = ''; }
};

window.createInputHTML = function(key, value, label, type="text") {
    return `
        <div class="space-y-1">
            <label class="text-xs font-bold text-slate-500 uppercase">${label}</label>
            <input type="${type}" data-verify-key="${key}" value="${value || ''}" class="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
    `;
};

window.openVerifyView = function(extractedData) {
    const imgElement = document.getElementById('verify-image');
    const placeholder = document.getElementById('verify-image-placeholder');
    if (pendingImageSrc) {
        imgElement.src = pendingImageSrc;
        imgElement.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } else {
        imgElement.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }

    const container = document.getElementById('verify-fields-container');
    container.innerHTML = 
        window.createInputHTML('name', extractedData.name, 'Customer Name') +
        window.createInputHTML('contact', extractedData.contact, 'Contact Number', 'tel') +
        window.createInputHTML('model', '', 'Model (Optional)') +
        window.createInputHTML('problem', extractedData.problem, 'Problem Description') +
        window.createInputHTML('price', extractedData.price || '', 'Price (Optional)', 'number') +
        window.createInputHTML('warranty', '', 'Warranty (e.g. 3 Months)');
        
    window.switchView('verify-view');
};

window.addVerifyField = function() {
    const fieldName = prompt("Enter new field name:");
    if (!fieldName) return;
    const cleanKey = fieldName.toLowerCase().replace(/\s+/g, '_').trim();
    document.getElementById('verify-fields-container').insertAdjacentHTML('beforeend', window.createInputHTML(cleanKey, '', fieldName));
};

window.cancelVerification = function() {
    pendingImageSrc = null;
    window.switchView('dashboard-view');
};

window.saveVerifiedEntry = async function() {
    showLoad("Saving to Firestore...");
    const inputs = document.querySelectorAll('#verify-fields-container input[data-verify-key]');
    const finalData = {};
    inputs.forEach(input => {
        const key = input.getAttribute('data-verify-key');
        if(input.value.trim() !== '') finalData[key] = input.value.trim();
    });

    if(!finalData.name) finalData.name = "Unknown Customer";
    if(!finalData.contact) finalData.contact = "No Number";
    if(!finalData.problem) finalData.problem = "Unspecified issue";

    const newRecord = {
        timestamp: Date.now(),
        dateStr: new Date().toLocaleDateString(),
        timeStr: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        imageSrc: pendingImageSrc, 
        status: 'undone', 
        data: finalData
    };

    try {
        const savePromise = addDoc(collection(db, "users", currentUser.uid, "repairs"), newRecord);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));
        const docRef = await Promise.race([savePromise, timeoutPromise]);
        
        repairDatabase.unshift({ firestoreId: docRef.id, ...newRecord });
        pendingImageSrc = null; 
        window.switchView('dashboard-view');
    } catch(e) { alert("Save Failed: " + e.message); }
    hideLoad();
};

// --- FILTERS & SEARCH ---
window.checkFiltersActive = function() {
    const queryStr = document.getElementById('search-input').value.trim();
    const clearBtn = document.getElementById('clear-filters-btn');
    if (currentFilter !== 'all' || currentDateFilter !== '' || queryStr !== '') {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
    }
};

window.clearAllFilters = function() {
    document.getElementById('search-input').value = '';
    document.getElementById('date-filter-input').value = '';
    window.setDateFilter('');
    window.setFilter('all');
};

window.setDateFilter = function(val) {
    currentDateFilter = val; 
    const display = document.getElementById('date-display');
    const dateBtn = document.getElementById('date-btn');
    
    if (val) {
        const [y, m, d] = val.split('-');
        display.innerText = `${d}/${m}/${y.substring(2)}`;
        dateBtn.classList.replace('bg-slate-100', 'bg-blue-100');
        dateBtn.classList.replace('text-slate-600', 'text-blue-800');
    } else {
        display.innerText = 'Date';
        dateBtn.classList.replace('bg-blue-100', 'bg-slate-100');
        dateBtn.classList.replace('text-blue-800', 'text-slate-600');
    }
    window.handleSearch();
};

window.setFilter = function(val) {
    currentFilter = val;
    document.querySelectorAll('.filter-chip[data-val]').forEach(btn => {
        if(btn.getAttribute('data-val') === val) {
            btn.classList.replace('bg-slate-100', 'bg-blue-600');
            btn.classList.replace('text-slate-600', 'text-white');
        } else {
            btn.classList.replace('bg-blue-600', 'bg-slate-100');
            btn.classList.replace('text-white', 'text-slate-600');
        }
    });
    window.handleSearch();
};

window.handleSearch = function() {
    const queryStr = document.getElementById('search-input').value.toLowerCase().trim();
    let filtered = repairDatabase;
    
    if(currentFilter !== 'all') filtered = filtered.filter(item => item.status === currentFilter);
    
    if(currentDateFilter) {
        const [y, m, d] = currentDateFilter.split('-');
        const filterDateObj = new Date(y, m - 1, d);
        const filterDateStr = filterDateObj.toLocaleDateString();
        filtered = filtered.filter(item => item.dateStr === filterDateStr);
    }

    if (queryStr) {
        filtered = filtered.filter(item => Object.values(item.data).some(val => String(val).toLowerCase().includes(queryStr)));
    }
    
    window.checkFiltersActive();
    window.renderTiles(filtered);
};

window.cycleStatus = async function(docId, event) {
    event.stopPropagation();
    const index = repairDatabase.findIndex(r => r.firestoreId === docId);
    if (index === -1) return;
    
    const nextStatus = repairDatabase[index].status === 'undone' ? 'done' : 'undone';
    repairDatabase[index].status = nextStatus;
    window.handleSearch();
    
    try { await updateDoc(doc(db, "users", currentUser.uid, "repairs", docId), { status: nextStatus }); } 
    catch(e) { console.error("Update failed", e); }
};

window.renderTiles = function(dataset) {
    const container = document.getElementById('tiles-container');
    const emptyState = document.getElementById('empty-state');
    container.querySelectorAll('.data-tile').forEach(el => el.remove());

    if (dataset.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    dataset.forEach(item => {
        const isDone = item.status === 'done';
        const colorClasses = isDone ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-white border-slate-200 text-slate-800"; 
        const priceBadge = item.data.price ? `<span class="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 shadow-sm border border-slate-200">₹${item.data.price}</span>` : '';
        const modelBadge = item.data.model ? `<span class="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] rounded uppercase font-bold tracking-wider">${item.data.model}</span>` : '';
        
        const imgBlock = item.imageSrc 
            ? `<img src="${item.imageSrc}" class="w-20 h-20 object-cover rounded-xl border bg-slate-100 shrink-0 shadow-sm">` 
            : '';

        const tile = document.createElement('div');
        tile.className = `data-tile p-4 border rounded-2xl flex flex-col gap-3 shadow-sm cursor-pointer transition active:scale-[0.99] ${colorClasses}`;
        tile.onclick = () => window.openDetailsView(item.firestoreId); 

        let touchStartX = 0;
        tile.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, {passive: true});
        tile.addEventListener('touchend', async e => {
            if (touchStartX - e.changedTouches[0].clientX > 90) { 
                if(confirm("Permanently delete this record?")) {
                    showLoad("Deleting...");
                    try {
                        await deleteDoc(doc(db, "users", currentUser.uid, "repairs", item.firestoreId));
                        repairDatabase = repairDatabase.filter(r => r.firestoreId !== item.firestoreId);
                        window.handleSearch();
                    } catch(err) { alert("Failed to delete."); }
                    hideLoad();
                }
            }
        });

        tile.innerHTML = `
            <div class="flex gap-3 items-start pointer-events-none">
                ${imgBlock}
                <div class="flex-1 text-xs space-y-1 overflow-hidden">
                    <div class="flex justify-between items-start">
                        <div class="text-[10px] opacity-60 font-bold flex items-center gap-1">${item.dateStr}</div>
                        ${priceBadge}
                    </div>
                    <p class="font-bold text-sm truncate flex items-center">${item.data.name} ${modelBadge}</p>
                    <p class="font-semibold opacity-80"><i class="fa-solid fa-phone text-[10px]"></i> ${item.data.contact}</p>
                    <p class="italic opacity-70 line-clamp-2">${item.data.problem}</p>
                </div>
            </div>
            <div class="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-[11px] font-bold">
                <button onclick="window.generateInvoice('${item.firestoreId}', event)" class="bg-slate-100 py-2 rounded-lg text-center shadow-xs hover:bg-slate-200 flex justify-center gap-1 text-slate-700">
                    <i class="fa-solid fa-receipt text-slate-500"></i> Invoice
                </button>
                <button onclick="window.openExpandedView('${item.firestoreId}', event)" class="bg-slate-100 py-2 rounded-lg text-center shadow-xs hover:bg-slate-200 flex justify-center gap-1 text-slate-700">
                    <i class="fa-solid fa-pen-to-square text-slate-500"></i> Edit
                </button>
                <button onclick="window.showContactMenu('${item.firestoreId}', event)" class="bg-slate-100 py-2 rounded-lg text-center shadow-xs hover:bg-slate-200 flex justify-center gap-1 text-emerald-700">
                    <i class="fa-solid fa-address-book text-emerald-600"></i> Contact
                </button>
                <button onclick="window.cycleStatus('${item.firestoreId}', event)" class="bg-slate-800 py-2 rounded-lg text-center shadow-xs hover:bg-slate-700 text-white flex justify-center gap-1 uppercase tracking-wider text-[9px]">
                    <i class="fa-solid fa-check"></i> ${isDone ? 'Undo' : 'Done'}
                </button>
            </div>
        `;
        container.appendChild(tile);
    });
};

window.openDetailsView = function(docId) {
    activeRecordId = docId;
    const record = repairDatabase.find(r => r.firestoreId === docId);
    if (!record) return;

    document.getElementById('details-date').innerText = `${record.dateStr} at ${record.timeStr}`;
    
    const imgEl = document.getElementById('details-img');
    if (record.imageSrc) {
        imgEl.src = record.imageSrc;
        imgEl.classList.remove('hidden');
    } else imgEl.classList.add('hidden');

    const container = document.getElementById('details-fields-container');
    container.innerHTML = '';
    
    Object.keys(record.data).forEach(key => {
        if(!record.data[key]) return;
        const labelName = key.charAt(0).toUpperCase() + key.slice(1);
        container.insertAdjacentHTML('beforeend', `
            <div class="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">${labelName}</span>
                <span class="text-sm font-semibold text-slate-800">${record.data[key]}</span>
            </div>
        `);
    });
    window.switchView('details-view');
};

window.openExpandedView = function(docId, event) {
    if(event) event.stopPropagation();
    activeRecordId = docId;
    const record = repairDatabase.find(r => r.firestoreId === docId);
    if (!record) return;

    const container = document.getElementById('expanded-fields-container');
    container.innerHTML = `
        <div class="text-[10px] text-slate-400 font-bold mb-4 flex items-center justify-between">
            <span>ID: ${record.firestoreId}</span>
            <span><i class="fa-solid fa-clock"></i> ${record.dateStr}</span>
        </div>
    `; 
    Object.keys(record.data).forEach(key => {
        const labelName = key.charAt(0).toUpperCase() + key.slice(1);
        container.insertAdjacentHTML('beforeend', window.createInputHTML(key, record.data[key], labelName));
    });
    window.switchView('expanded-view');
};

window.triggerNewFieldDialog = function() {
    const fieldName = prompt("Enter new field name:");
    if (!fieldName) return;
    const cleanKey = fieldName.toLowerCase().replace(/\s+/g, '_').trim();
    document.getElementById('expanded-fields-container').insertAdjacentHTML('beforeend', window.createInputHTML(cleanKey, '', fieldName));
};

window.saveExpandedEdits = async function() {
    const index = repairDatabase.findIndex(r => r.firestoreId === activeRecordId);
    if (index === -1) return;
    showLoad("Updating Cloud...");
    const inputs = document.querySelectorAll('#expanded-fields-container input');
    const updatedData = {};
    inputs.forEach(input => {
        const key = input.getAttribute('data-verify-key');
        if(input.value.trim() !== '') updatedData[key] = input.value.trim();
    });
    repairDatabase[index].data = updatedData;
    try {
        await updateDoc(doc(db, "users", currentUser.uid, "repairs", activeRecordId), { data: updatedData });
        window.switchView('dashboard-view');
    } catch(e) { alert("Update failed: " + e.message); }
    hideLoad();
};

window.showContactMenu = function(docId, event) {
    if(event) event.stopPropagation();
    activeRecordId = docId;
    document.getElementById('contact-modal').classList.remove('hidden');
};

window.closeContactMenu = function() {
    document.getElementById('contact-modal').classList.add('hidden');
};

window.executeContact = function(type) {
    const record = repairDatabase.find(r => r.firestoreId === activeRecordId);
    if (!record || !record.data.contact) { alert("No contact number saved."); return; }
    
    const number = record.data.contact.replace(/\s+/g, '');
    if (type === 'call') window.location.href = `tel:${number}`;
    else if (type === 'whatsapp') window.open(`https://wa.me/${number}`, '_blank');
    
    window.closeContactMenu();
};

window.generateInvoice = function(docId, event) {
    if(event) event.stopPropagation();
    activeRecordId = docId;
    const record = repairDatabase.find(r => r.firestoreId === docId);
    if (!record) return;

    document.getElementById('shop-name-bill').innerText = window.shopProfile.name || "YOUR SHOP NAME";
    document.getElementById('shop-address-bill').innerText = window.shopProfile.address || "";
    document.getElementById('shop-contact-bill').innerText = window.shopProfile.contact ? "Ph: " + window.shopProfile.contact : "";
    document.getElementById('bill-date').innerText = record.dateStr;
    document.getElementById('bill-time').innerText = record.timeStr;
    document.getElementById('bill-id').innerText = "#" + record.firestoreId.substring(0, 6).toUpperCase();
    
    const imgEl = document.getElementById('bill-img');
    if (record.imageSrc) {
        imgEl.src = ''; 
        imgEl.classList.remove('hidden');
        
        fetch('/api/proxy-image?url=' + encodeURIComponent(record.imageSrc))
            .then(res => res.json())
            .then(data => {
                if (data.base64) {
                    imgEl.src = data.base64;
                } else {
                    imgEl.classList.add('hidden');
                }
            })
            .catch(err => {
                console.error("Base64 fetch failed", err);
                imgEl.classList.add('hidden');
            });
    } else imgEl.classList.add('hidden');

    const payloadContainer = document.getElementById('bill-fields-payload');
    payloadContainer.innerHTML = '';

    const strictOrder = ['model', 'problem', 'name', 'contact', 'warranty', 'price'];
    const customKeys = Object.keys(record.data).filter(k => !strictOrder.includes(k));
    const finalOrder = [...strictOrder, ...customKeys];

    finalOrder.forEach(key => {
        if(!record.data[key]) return; 
        
        const title = key.toUpperCase().replace('_', ' ');
        let styleClass = "text-slate-800 font-semibold";
        let rowClass = "border-b border-slate-200 pb-2 mb-2";

        if(key === 'warranty') {
            styleClass = "bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded";
        } else if (key === 'price') {
            styleClass = "text-rose-600 font-extrabold text-[15px]";
            rowClass = "pt-2";
        }

        const prefix = key === 'price' ? '₹' : '';
        const itemRow = document.createElement('div');
        itemRow.className = `flex justify-between items-center gap-4 ${rowClass}`;
        itemRow.innerHTML = `
            <span class="font-bold text-slate-400 text-[10px] tracking-wider shrink-0 uppercase">${title}</span>
            <span class="text-right break-words max-w-[180px] ${styleClass}">${prefix}${record.data[key]}</span>
        `;
        payloadContainer.appendChild(itemRow);
    });
    window.switchView('invoice-view');
};

window.shareInvoiceImage = async function() {
    showLoad("Generating Digital Invoice...");
    const invoiceElement = document.getElementById('bill-printout');
    
    try {
        const canvas = await html2canvas(invoiceElement, { 
            scale: 1.5, 
            useCORS: true, 
            backgroundColor: "#ffffff" 
        });
        
        canvas.toBlob(async (blob) => {
            if (!blob) {
                alert("Canvas failed to create image data.");
                hideLoad();
                return;
            }
            
            const file = new File([blob], "invoice.png", { type: "image/png" });
            const data = {
                files: [file],
                title: "Invoice",
                text: "Here is your repair invoice."
            };
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share(data);
                } catch (err) {
                    console.error("Share intent closed or failed", err);
                }
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "invoice.png";
                a.click();
                URL.revokeObjectURL(url);
                alert("Direct sharing not supported on this browser. Invoice has been saved to your downloads.");
            }
            hideLoad();
        }, "image/png");
    } catch (error) {
        console.error(error);
        alert("Generation Error: " + error.message);
        hideLoad();
    }
};
