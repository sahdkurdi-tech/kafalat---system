const firebaseConfig = {
  apiKey: "AIzaSyCblBgirNBStpbb1TrVNzKJnJ4-FpuVvyE",
  authDomain: "monthly-aid-system-2ec16.firebaseapp.com",
  projectId: "monthly-aid-system-2ec16",
  storageBucket: "monthly-aid-system-2ec16.firebasestorage.app",
  messagingSenderId: "14226596485",
  appId: "1:14226596485:web:33d95fa09fc9b91c2d3fec"
};

// Initialize Firebase (Checks if already initialized)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth(); // زیادکردنی Auth

let currentSectionFields = [];
let currentListColor = '#4e73df';
let currentPrintTitle = "لیست";

// ============================================================
// فەنکشنی زیرەک بۆ گۆڕینی ژمارەی ئێکسڵ بۆ بەرواری دروست
// ============================================================
function parseAnyDate(input) {
    if (!input || input === '-' || input == 0) return null;
    
    // ئەگەر ژمارەی ئێکسڵ بوو (وەک 46174)
    if (!isNaN(input) && input > 20000 && input < 80000) {
        const excelBaseDate = new Date(1899, 11, 30); 
        return new Date(excelBaseDate.getTime() + input * 24 * 60 * 60 * 1000);
    }
    
    // ئەگەر بەرواری فایەربەیس بوو
    if (typeof input === 'object' && input.seconds) return new Date(input.seconds * 1000);
    
    // ئەگەر تێکست بوو
    if (typeof input === 'string') {
        const cleanInput = input.trim();
        if (cleanInput.includes('/')) {
            const parts = cleanInput.split('/');
            if (parts.length === 3) {
                let y = parseInt(parts[2]);
                if (y < 100) y += 2000; 
                return new Date(y, parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
        }
        if (cleanInput.includes('-')) return new Date(cleanInput);
    }
    
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d;
    return null;
}

// ============================================================
// فەنکشنە یارمەتیدەرەکان بۆ دۆزینەوەی ناوی دروست
// ============================================================
window.isNameField = function(f) {
    if (f.type === 'sys_name') return true;
    let l = (f.label || '').trim();
    if (l.includes('ناونیشان')) return false; // ڕێگری دەکات لەوەی ناونیشان بە ناو تێبگات
    return l === 'ناو' || l === 'ناوی سیانی' || l === 'ناوی تەواو' || l.includes('ناوی');
};

window.extractRealName = function(item, fields) {
    // ئەگەر ناوەکەی بە فەرمی هەبوو
    if (item.name && item.name !== '-' && item.name.trim() !== '') return item.name;

    // ئەگەر نەبوو، با لەناو خانە داینامیکییەکان بگەڕێت
    if (fields && item.dynamic) {
        let nameField = fields.find(f => window.isNameField(f));
        if (nameField && item.dynamic[nameField.id] && item.dynamic[nameField.id] !== '-') {
            return item.dynamic[nameField.id];
        }
    }
    return 'بێ ناو';
};

// --- 1. Load Categories (چاککراوە) ---
async function loadArchiveCategories() {
    const listContainer = document.getElementById('dynamic-archive-list');
    
    // دڵنیابوونەوە لەوەی ئێمەنتەکە بوونی هەیە
    if (!listContainer) return;

    try {
        const snapshot = await db.collection('archives').get();
        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-center text-white-50 mt-3">هیچ ئەرشیفێک نییە.</p>';
            return;
        }
        const uniqueSections = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.section) {
                uniqueSections[data.section] = data.listName || data.section;
            }
        });
        listContainer.innerHTML = '';
        Object.keys(uniqueSections).forEach(sectionKey => {
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.innerHTML = `<i class="fas fa-folder"></i> ${uniqueSections[sectionKey]}`;
            btn.onclick = (e) => loadArchiveList(sectionKey, uniqueSections[sectionKey], e);
            listContainer.appendChild(btn);
        });
    } catch (error) {
        console.error("Error:", error);
        listContainer.innerHTML = `<p class="text-danger text-center">هەڵە: ${error.message}</p>`;
    }
}

// *** بەشی گرنگ: چاوەڕێکردن بۆ دڵنیابوونەوە لە داخڵبوون ***
// ئەمە کێشەی "Insufficient Permissions" چارەسەر دەکات
auth.onAuthStateChanged((user) => {
    if (user) {
        // ئەگەر بەکارهێنەر هەبوو، ئینجا داتا بهێنە
        loadArchiveCategories();
    } else {
        // ئەگەر بەکارهێنەر نەبوو، بچۆ بۆ لۆگین
        window.location.href = "login.html";
    }
});

// 2. Load List (Months)
function loadArchiveList(sectionName, sectionTitle, event) {
    if(event) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        event.target.closest('button').classList.add('active');
    }

    document.getElementById('page-title').innerText = "ئەرشیفی: " + sectionTitle;
    const container = document.getElementById('months-view');
    container.innerHTML = '<div class="col-12 text-center"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i></div>';
    document.getElementById('details-view').style.display = 'none';
    document.getElementById('months-view').style.display = 'grid';

    db.collection('archives')
      .where('section', '==', sectionName)
      .orderBy('savedAt', 'desc')
      .get()
      .then(snapshot => {
          container.innerHTML = '';
          if (snapshot.empty) {
              container.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">هیچ داتایەک نەدۆزرایەوە.</p>';
              return;
          }
          snapshot.forEach(doc => {
              const data = doc.data();
              const div = document.createElement('div');
              div.className = 'month-card';
              div.onclick = () => prepareAndShowDetails(data, sectionName);
              const date = data.savedAt ? new Date(data.savedAt.seconds * 1000).toLocaleDateString('ku-IQ') : '';
              const count = data.items ? data.items.length : 0;
              div.innerHTML = `
                  <h3><i class="fas fa-calendar-alt text-primary mb-2"></i><br>${data.monthLabel}</h3>
                  <span>${count} خێزان</span>
                  <p class="text-muted mt-2 mb-0 small">خەزنکراوە: ${date}</p>
              `;
              container.appendChild(div);
          });
      })
      .catch(err => {
          console.error(err);
          container.innerHTML = `<p class="text-danger">هەڵە: ${err.message}</p>`;
      });
}

// 3. Prepare Data
async function prepareAndShowDetails(archiveData, sectionId) {
    Swal.fire({title: 'جارێ لیستەکە ئامادە دەکرێت...', didOpen: () => Swal.showLoading()});

    try {
        const listDoc = await db.collection('lists').doc(sectionId).get();
        if(listDoc.exists) currentListColor = listDoc.data().color || '#4e73df';
        else currentListColor = '#4e73df';
        
        const fieldsSnap = await db.collection('listFields').where('listId', '==', sectionId).get();
        let fields = [];
        fieldsSnap.forEach(doc => fields.push({id: doc.id, ...doc.data()}));
        fields.sort((a,b) => (a.order || 0) - (b.order || 0));
        currentSectionFields = fields;

        let theadHTML = `<tr><th style="width:50px; background-color:${currentListColor}; color:white;">#</th>`;
        theadHTML += `<th style="width:110px; background-color:${currentListColor}; color:white;">دۆخی هاوکاری</th>`;
        
        const tableFields = fields.filter(f => f.showInTable !== false);
        tableFields.forEach(f => {
            theadHTML += `<th style="background-color:${currentListColor}; color:white;">${f.label}</th>`;
        });
        theadHTML += `</tr>`;
        document.getElementById('table-head').innerHTML = theadHTML;

        const tbody = document.getElementById('table-body');
        tbody.innerHTML = '';
        const sortedItems = (archiveData.items || []).sort((a,b) => (a.orderIndex || 999) - (b.orderIndex || 999));

        sortedItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            let aidBadge = '<span class="badge bg-secondary">دیاری نەکراوە</span>';
            if (item.aidStatus === 'received') aidBadge = '<span class="badge bg-success">وەرگرت</span>';
            else if (item.aidStatus === 'not_received') aidBadge = '<span class="badge bg-danger">وەرنەگرت</span>';

            // +++ بەکارهێنانی فەنکشنە زیرەکەکە بۆ هێنانی ناو +++
            let realName = window.extractRealName(item, currentSectionFields);

            let rowHTML = `<td>${item.orderIndex || index + 1}</td>`;
            rowHTML += `<td>${aidBadge}</td>`; 
            
            tableFields.forEach(f => {
                let val = '-';
                if (window.isNameField(f)) {
                    val = `<span class="fw-bold text-dark">${realName}</span>`;
                }
                else if (f.type === 'sys_amount') val = (item.amount || 0).toLocaleString();
                else {
                    val = item.dynamic ? (item.dynamic[f.id] || '-') : '-';
                    if (val !== '-' && (f.type === 'date' || f.label.includes('بەروار') || f.label.includes('تاکو') || f.label.includes('کۆتایی'))) {
                        let parsed = parseAnyDate(val);
                        if(parsed) val = `<span dir="ltr" class="fw-bold text-primary">${parsed.toISOString().split('T')[0]}</span>`;
                    }
                }
                rowHTML += `<td>${val}</td>`;
            });
            
            const itemStr = encodeURIComponent(JSON.stringify(item));
            tr.onclick = () => window.showArchiveOptions(itemStr, sectionId);
            
            tr.innerHTML = rowHTML;
            tbody.appendChild(tr);
        });

        document.getElementById('archive-header-title').innerText = archiveData.monthLabel;
        const listName = archiveData.listName || "لیست";
        const monthName = archiveData.monthLabel || "";
        currentPrintTitle = `لیستی ${listName} بۆ ${monthName}`;

        Swal.close();
        document.getElementById('months-view').style.display = 'none';
        document.getElementById('details-view').style.display = 'block';

    } catch (error) {
        console.error(error);
        Swal.fire('هەڵە', 'کێشە: ' + error.message, 'error');
    }
}

// 4. PRINT FUNCTION
function preparePrint() {
    document.documentElement.style.setProperty('--print-color', currentListColor);
    document.getElementById('print-simple-title').innerText = currentPrintTitle;
    
    const originalTable = document.getElementById('archive-table');
    const cloneTable = originalTable.cloneNode(true);
    
    const printContainer = document.getElementById('print-table-container');
    printContainer.innerHTML = '';
    printContainer.appendChild(cloneTable);
    
    window.print();
}

// ============================================================
// ٥. بەشی هەڵبژاردن و پیشاندانی وردەکاری و مێژوو
// ============================================================

// ============================================================
// ٥. بەشی هەڵبژاردن و پیشاندانی وردەکاری و مێژوو
// ============================================================

// ٥.١. پیشاندانی دوو دوگمەکەی هەڵبژاردن
window.showArchiveOptions = function(itemStr, listId) {
    const item = JSON.parse(decodeURIComponent(itemStr));
    
    Swal.fire({
        title: 'هەڵبژاردنی کردار',
        text: `بۆ خێزانی: ${item.name}`,
        html: `
            <div class="d-flex flex-column gap-3 mt-4">
                <button class="btn btn-primary btn-lg fw-bold shadow-sm" onclick="Swal.close(); setTimeout(() => window.showAidHistory('${item.name}', '${listId}'), 300)">
                    <i class="fas fa-history mb-1 fs-4 d-block"></i> مێژووی هاوکارییەکانی
                </button>
                <button class="btn btn-info btn-lg fw-bold text-white shadow-sm" onclick="Swal.close(); setTimeout(() => window.showFullDetails('${itemStr}'), 300)">
                    <i class="fas fa-id-card mb-1 fs-4 d-block"></i> کارتی زانیاری
                </button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        heightAuto: false, // +++ چارەسەری کێشەی سکڕۆڵ +++
        customClass: { popup: 'rounded-4' }
    });
}

// ٥.٢. فەنکشنی هێنانی مێژووی هاوکارییەکان
window.showAidHistory = async function(beneficiaryName, listId) {
    Swal.fire({title: 'گەڕان بەدوای مێژوودا...', didOpen: () => Swal.showLoading(), heightAuto: false});
    
    try {
        const snapshot = await db.collection('archives').where('section', '==', listId).orderBy('savedAt', 'desc').get();
        
        let historyHTML = '';
        let totalAmountReceived = 0;
        let receivedCount = 0;
        let notReceivedCount = 0;

        snapshot.forEach(doc => {
            const monthData = doc.data();
            const foundItem = monthData.items.find(i => i.name === beneficiaryName);

            if (foundItem) {
                let amount = parseFloat(foundItem.amount) || 0;
                let status = foundItem.aidStatus;
                let statusBadge = '<span class="badge bg-secondary">دیاری نەکراوە</span>';

                if (status === 'received') {
                    statusBadge = '<span class="badge bg-success">وەرگرت</span>';
                    receivedCount++;
                    totalAmountReceived += amount; 
                } else if (status === 'not_received') {
                    statusBadge = '<span class="badge bg-danger">وەرنەگرت</span>';
                    notReceivedCount++;
                }

                historyHTML += `
                    <tr>
                        <td class="fw-bold text-primary">${monthData.monthLabel}</td>
                        <td dir="ltr" class="fw-bold">${amount.toLocaleString()}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            }
        });

        if (historyHTML === '') {
            Swal.fire({title: 'ئاگاداری', text: 'هیچ مێژوویەک بۆ ئەم ناوە نەدۆزرایەوە.', icon: 'info', heightAuto: false});
            return;
        }

        let summaryHTML = `
            <div class="row text-center mb-4 g-2">
                <div class="col-12">
                    <div class="p-3 rounded" style="background-color: #f1f8ff; border: 1px solid #cce5ff;">
                        <small class="text-muted d-block fw-bold">کۆی گشتی ئەو پارەیەی وەریگرتووە</small>
                        <strong class="text-success display-6 fw-bold" dir="ltr">${totalAmountReceived.toLocaleString()} <span class="fs-5">IQD</span></strong>
                    </div>
                </div>
                <div class="col-6">
                    <div class="p-2 bg-light rounded border border-success h-100">
                        <small class="text-muted d-block mb-1">وەرگرتن</small>
                        <span class="text-success fw-bold fs-4"><i class="fas fa-check-circle"></i> ${receivedCount} مانگ</span>
                    </div>
                </div>
                <div class="col-6">
                    <div class="p-2 bg-light rounded border border-danger h-100">
                        <small class="text-muted d-block mb-1">وەرنەگرتن</small>
                        <span class="text-danger fw-bold fs-4"><i class="fas fa-times-circle"></i> ${notReceivedCount} مانگ</span>
                    </div>
                </div>
            </div>
        `;

        Swal.fire({
            title: beneficiaryName,
            html: `
                ${summaryHTML}
                <div class="table-responsive rounded border" style="max-height: 250px; overflow-y: auto;">
                    <table class="table table-sm table-hover table-striped mb-0 align-middle">
                        <thead class="table-dark" style="position: sticky; top: 0; z-index: 1;">
                            <tr><th>مانگ</th><th>بڕی پارە</th><th>دۆخ</th></tr>
                        </thead>
                        <tbody>${historyHTML}</tbody>
                    </table>
                </div>
            `,
            width: '500px',
            showConfirmButton: true,
            confirmButtonText: '<i class="fas fa-times"></i> داخستن',
            confirmButtonColor: '#6c757d',
            heightAuto: false, // +++ چارەسەری کێشەی سکڕۆڵ +++
            customClass: { popup: 'rounded-4' }
        });

    } catch(e) {
        console.error(e);
        Swal.fire({title: 'هەڵە', text: e.message, icon: 'error', heightAuto: false});
    }
}

// ٥.٣. فەنکشنی پیشاندانی کارتی زانیاری
window.showFullDetails = function(itemStr) {
    const item = JSON.parse(decodeURIComponent(itemStr));
    let html = `<div class="container-fluid px-0" dir="rtl"><div class="row g-2">`;

    let aidBadge = '<span class="badge bg-secondary">دۆخ دیاری نەکراوە</span>';
    if (item.aidStatus === 'received') aidBadge = '<span class="badge bg-success"><i class="fas fa-check"></i> پارەی وەرگرتووە</span>';
    else if (item.aidStatus === 'not_received') aidBadge = '<span class="badge bg-danger"><i class="fas fa-times"></i> وەری نەگرتووە</span>';

    let realName = window.extractRealName(item, currentSectionFields);

    html += `
        <div class="col-12 mb-3 text-center">
            <div class="p-3 rounded-4" style="background: linear-gradient(135deg, ${currentListColor}15, transparent); border: 1px solid ${currentListColor}40;">
                <h4 class="fw-bold mb-3 text-dark">${realName}</h4>
                <div class="d-flex justify-content-center flex-wrap gap-2">
                    <span class="badge bg-white text-dark border fs-6 shadow-sm"><i class="fas fa-money-bill-wave text-success"></i> ${(item.amount || 0).toLocaleString()} IQD</span>
                    <span class="fs-6 shadow-sm">${aidBadge}</span>
                </div>
            </div>
        </div>
    `;

    currentSectionFields.forEach(f => {
        let val = '-';
        if (f.type === 'sys_amount' || window.isNameField(f)) return; 

        if (item.dynamic && item.dynamic[f.id]) {
            val = item.dynamic[f.id];
        }

        if (val !== '-' && val !== '' && val !== null && val !== undefined) {
            if (f.type === 'date' || f.label.includes('بەروار') || f.label.includes('تاکو') || f.label.includes('کۆتایی')) {
                let parsed = parseAnyDate(val);
                if(parsed) val = `<span dir="ltr" class="fw-bold text-primary">${parsed.toISOString().split('T')[0]}</span>`;
            }

            let dir = (val.toString().match(/[a-zA-Z0-9]/) && (f.label.includes('مۆبایل') || f.type === 'date')) ? 'dir="ltr" class="text-start"' : '';

            html += `
                <div class="col-12 col-sm-6">
                    <div class="card h-100 border border-light shadow-sm" style="background-color: #fcfcfc;">
                        <div class="card-body p-2 d-flex flex-column justify-content-center">
                            <small class="text-muted fw-bold mb-1"><i class="fas fa-circle ms-1" style="font-size: 8px; color:${currentListColor}"></i> ${f.label}</small>
                            <div class="fw-bold text-dark" ${dir}>${val}</div>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    html += `</div></div>`;
    
    Swal.fire({
        title: '',
        html: html,
        width: '600px',
        showConfirmButton: false,
        showCloseButton: true,
        heightAuto: false, // +++ چارەسەری کێشەی سکڕۆڵ +++
        customClass: { popup: 'rounded-4 border-top border-5' },
        didOpen: () => {
            document.querySelector('.swal2-popup').style.borderTopColor = currentListColor;
        }
    });
}

function closeDetails() {
    document.getElementById('details-view').style.display = 'none';
    document.getElementById('months-view').style.display = 'grid';
    document.getElementById('page-title').scrollIntoView();
}