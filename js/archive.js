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
        // Get Color
        const listDoc = await db.collection('lists').doc(sectionId).get();
        if(listDoc.exists) {
            currentListColor = listDoc.data().color || '#4e73df';
        } else {
            currentListColor = '#4e73df';
        }
        
        // Get Fields
        const fieldsSnap = await db.collection('listFields').where('listId', '==', sectionId).get();
        let fields = [];
        fieldsSnap.forEach(doc => fields.push({id: doc.id, ...doc.data()}));
        fields.sort((a,b) => (a.order || 0) - (b.order || 0));
        currentSectionFields = fields;

        // Build Header
        let theadHTML = `<tr><th style="width:50px; background-color:${currentListColor}; color:white;">#</th>`;
        const tableFields = fields.filter(f => f.showInTable !== false);
        tableFields.forEach(f => {
            theadHTML += `<th style="background-color:${currentListColor}; color:white;">${f.label}</th>`;
        });
        theadHTML += `</tr>`;
        document.getElementById('table-head').innerHTML = theadHTML;

        // Build Body
        const tbody = document.getElementById('table-body');
        tbody.innerHTML = '';
        const sortedItems = (archiveData.items || []).sort((a,b) => (a.orderIndex || 999) - (b.orderIndex || 999));

        sortedItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            let rowHTML = `<td>${item.orderIndex || index + 1}</td>`;
            tableFields.forEach(f => {
                let val = '-';
                if (f.type === 'sys_name') val = `<span class="fw-bold text-dark">${item.name || '-'}</span>`;
                else if (f.type === 'sys_amount') val = (item.amount || 0).toLocaleString();
                else val = item.dynamic ? (item.dynamic[f.id] || '-') : '-';
                rowHTML += `<td>${val}</td>`;
            });
            tr.innerHTML = rowHTML;
            tr.onclick = () => showFullDetails(item);
            tbody.appendChild(tr);
        });

        // Set Title Vars
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

// 5. Details Popup
function showFullDetails(item) {
    let html = `<div class="text-end"><table class="table table-bordered"><tbody>`;
    currentSectionFields.forEach(f => {
        let val = '-';
        if (f.type === 'sys_name') val = item.name || '-';
        else if (f.type === 'sys_amount') val = (item.amount || 0).toLocaleString();
        else val = item.dynamic ? (item.dynamic[f.id] || '-') : '-';
        html += `<tr><th width="40%" class="bg-light">${f.label}</th><td>${val}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    Swal.fire({ title: 'وردەکاری', html: html, width: '600px', showConfirmButton: false, showCloseButton: true });
}

function closeDetails() {
    document.getElementById('details-view').style.display = 'none';
    document.getElementById('months-view').style.display = 'grid';
    document.getElementById('page-title').scrollIntoView();
}