import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let allData = []; 
let fieldMappings = { nameIds: [], addressIds: [], familyIds: [], dateIds: [], phoneIds: [] };
let listsMap = {}; // ئێستا ناو و ڕەنگیش لەخۆ دەگرێت
let allFields = []; 
let uniqueColumns = []; 
let currentFilteredData = []; 
let tableColumns = []; 

// ==========================================
function saveColumnPrefs() {
    let prefs = {};
    document.querySelectorAll('.col-toggle').forEach(chk => {
        prefs[chk.value] = chk.checked;
    });
    localStorage.setItem('searchColumnPrefs', JSON.stringify(prefs));
}

function updateColumnVisibility() {
    let css = '';
    document.querySelectorAll('.col-toggle').forEach(chk => {
        if (!chk.checked) {
            css += `.${chk.value} { display: none !important; }\n`;
        }
    });
    
    let styleTag = document.getElementById('dynamic-col-styles');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-col-styles';
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = css;

    saveColumnPrefs();
}

function parseDateRobust(input) {
    if (!input || input === '-' || input == 0) return null;
    if (!isNaN(input) && input > 20000 && input < 80000) {
        const excelBaseDate = new Date(1899, 11, 30); 
        return new Date(excelBaseDate.getTime() + input * 24 * 60 * 60 * 1000);
    }
    if (typeof input === 'object' && input.seconds) return new Date(input.seconds * 1000);
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

function updateDropdownText() {
    const btn = document.getElementById('dropdownListButton');
    const checkAll = document.getElementById('check-all-lists');
    const specificChecks = document.querySelectorAll('.specific-list');
    if (!btn) return;

    if (checkAll && checkAll.checked) {
        btn.innerText = 'هەموو لیستەکان';
    } else {
        let count = 0;
        let lastName = '';
        specificChecks.forEach(c => { 
            if(c.checked) { count++; lastName = c.nextElementSibling.innerText; }
        });
        if (count === 1) btn.innerText = lastName;
        else if (count > 1) btn.innerText = `${count} لیست هەڵبژێردراون`;
        else btn.innerText = 'هیچ لیستێک هەڵنەبژێردراوە';
    }
}

function updateDateDropdownText() {
    const btn = document.getElementById('dropdownDateButton');
    const checkAll = document.getElementById('check-all-dates');
    const specificChecks = document.querySelectorAll('.specific-date');
    if (!btn) return;

    if (checkAll && checkAll.checked) {
        btn.innerText = 'هەموو دۆخەکان';
    } else {
        let count = 0;
        let lastName = '';
        specificChecks.forEach(c => { 
            if(c.checked) { count++; lastName = c.nextElementSibling.innerText; }
        });
        if (count === 1) btn.innerText = lastName;
        else if (count > 1) btn.innerText = `${count} دۆخ هەڵبژێردراون`;
        else btn.innerText = 'هیچ دۆخێک هەڵنەبژێردراوە';
    }
}

async function initializeData() {
    const listContainer = document.getElementById('filter-list-container');
    const listsSnap = await getDocs(collection(db, "lists"));
    
    listsSnap.forEach(doc => {
        const data = doc.data();
        // لێرەدا ڕەنگەکەش پاشەکەوت دەکەین لەگەڵ ناوەکەدا
        listsMap[doc.id] = { name: data.name, color: data.color || '#4e73df' };
        
        if (listContainer) {
            listContainer.innerHTML += `
                <li>
                    <div class="form-check px-2 py-1">
                        <input class="form-check-input float-end ms-2 specific-list" type="checkbox" value="${doc.id}" id="chk-${doc.id}">
                        <label class="form-check-label d-block me-4 text-dark" for="chk-${doc.id}">${data.name}</label>
                    </div>
                </li>
            `;
        }
    });

    const checkAllLists = document.getElementById('check-all-lists');
    const specificListChecks = document.querySelectorAll('.specific-list');

    if (checkAllLists) {
        checkAllLists.addEventListener('change', (e) => {
            if (e.target.checked) specificListChecks.forEach(chk => chk.checked = false);
            updateDropdownText(); performSearch();
        });
    }

    specificListChecks.forEach(chk => {
        chk.addEventListener('change', () => {
            if (chk.checked && checkAllLists) checkAllLists.checked = false;
            const anyChecked = Array.from(specificListChecks).some(c => c.checked);
            if (!anyChecked && checkAllLists) checkAllLists.checked = true;
            updateDropdownText(); performSearch();
        });
    });

    const checkAllDates = document.getElementById('check-all-dates');
    const specificDateChecks = document.querySelectorAll('.specific-date');

    if (checkAllDates) {
        checkAllDates.addEventListener('change', (e) => {
            if (e.target.checked) specificDateChecks.forEach(chk => chk.checked = false);
            updateDateDropdownText(); performSearch();
        });
    }

    specificDateChecks.forEach(chk => {
        chk.addEventListener('change', () => {
            if (chk.checked && checkAllDates) checkAllDates.checked = false;
            const anyChecked = Array.from(specificDateChecks).some(c => c.checked);
            if (!anyChecked && checkAllDates) checkAllDates.checked = true;
            updateDateDropdownText(); performSearch();
        });
    });

    const fieldsSnap = await getDocs(collection(db, "listFields"));
    fieldsSnap.forEach(doc => {
        const fieldData = doc.data();
        const lbl = fieldData.label.trim();
        const lblLower = lbl.toLowerCase();
        
        allFields.push({ id: doc.id, ...fieldData });
        
        if (!uniqueColumns.includes(lbl) && fieldData.type !== 'sys_name' && fieldData.type !== 'sys_amount') {
            uniqueColumns.push(lbl);
        }
        
        if (lblLower.includes('ناونیشان') || lblLower.includes('address')) fieldMappings.addressIds.push(doc.id);
        else if (lblLower === 'ناو' || lblLower.includes('ناوی سیانی') || lblLower.includes('name') || fieldData.type === 'sys_name') fieldMappings.nameIds.push(doc.id);
        else if (lblLower.includes('ژ.ئ.خ') || lblLower.includes('ژ.ئ.ئ') || lblLower.includes('خێزان') || lblLower.includes('ئەندام')) fieldMappings.familyIds.push(doc.id);
        else if (lblLower.includes('بەروار') || lblLower.includes('date') || lblLower.includes('تاکو') || lblLower.includes('کۆتایی')) fieldMappings.dateIds.push(doc.id);
        else if (lblLower.includes('مۆبایل') || lblLower.includes('تەلەفۆن') || lblLower.includes('phone')) fieldMappings.phoneIds.push(doc.id);
    });

    tableColumns = [];
    tableColumns.push({ id: 'col-amount', label: 'بڕی پارە', type: 'static', isDefault: true, order: 3 });
    tableColumns.push({ id: 'col-listName', label: 'ناوی لیست', type: 'static', isDefault: true, order: 5 });
    tableColumns.push({ id: 'col-status', label: 'دۆخ', type: 'static', isDefault: true, order: 6 });

    uniqueColumns.forEach((colName, idx) => {
        let lblLower = colName.toLowerCase();
        let order = 7; 
        let isDef = false;

        if (lblLower.includes('ناونیشان') || lblLower.includes('address')) { order = 1; isDef = true; }
        else if (lblLower.includes('مۆبایل') || lblLower.includes('تەلەفۆن') || lblLower.includes('phone')) { order = 2; isDef = true; }
        else if (lblLower.includes('بەروار') || lblLower.includes('date') || lblLower.includes('تاکو') || lblLower.includes('کۆتایی')) { order = 4; isDef = true; }
        
        tableColumns.push({
            id: 'col-dyn-' + idx, label: colName, type: 'dynamic', dynKey: colName, isDefault: isDef, order: order
        });
    });

    tableColumns.sort((a, b) => a.order - b.order);

    const toggleMenu = document.getElementById('columnToggleMenu');
    if (toggleMenu) {
        let togglesHTML = '';
        const savedPrefs = JSON.parse(localStorage.getItem('searchColumnPrefs') || "null");

        tableColumns.forEach(col => {
            const isChecked = savedPrefs && savedPrefs[col.id] !== undefined ? savedPrefs[col.id] : col.isDefault;
            const checkedStr = isChecked ? 'checked' : '';
            togglesHTML += `
                <li>
                    <div class="form-check">
                        <input class="form-check-input float-end ms-2 col-toggle" type="checkbox" value="${col.id}" id="chk-${col.id}" ${checkedStr}>
                        <label class="form-check-label text-dark fw-bold cursor-pointer" for="chk-${col.id}" style="cursor:pointer; width:100%;">${col.label}</label>
                    </div>
                </li>`;
        });
        toggleMenu.innerHTML = togglesHTML;
    }

    const thead = document.getElementById('search-table-head');
    if (thead) {
        let headHTML = `<tr><th>#</th><th>ناوی کەس</th>`;
        tableColumns.forEach(col => {
            headHTML += `<th class="${col.id}">${col.label}</th>`;
        });
        headHTML += `</tr>`;
        thead.innerHTML = headHTML;
    }

    document.querySelectorAll('.col-toggle').forEach(chk => { chk.addEventListener('change', updateColumnVisibility); });

    updateDropdownText();
    updateDateDropdownText();
    performSearch();
}

async function performSearch() {
    const tbody = document.getElementById('search-results');
    const countDisplay = document.getElementById('results-count');
    
    if (countDisplay) countDisplay.innerText = '...';
    
    const totalCols = 2 + tableColumns.length; 
    tbody.innerHTML = `<tr><td colspan="${totalCols}" class="text-center py-5 border-0"><i class="fas fa-circle-notch fa-spin fa-3x text-primary mb-3"></i><br><span class="fw-bold text-muted">داتاکان بار دەکرێن...</span></td></tr>`;

    const textFilter = document.getElementById('filter-text').value.toLowerCase();
    const addressFilter = document.getElementById('filter-address').value.toLowerCase();
    const amountFilter = document.getElementById('filter-amount').value;
    const familyFilter = document.getElementById('filter-family').value;
    const sortBy = document.getElementById('sort-by').value;
    const sortOrder = document.getElementById('sort-order').value;
    const onlyStarred = document.getElementById('filter-starred')?.checked || false;

    let listsToSearch = [];
    const checkAllLists = document.getElementById('check-all-lists');
    const specificListChecks = document.querySelectorAll('.specific-list');

    if (checkAllLists && checkAllLists.checked) {
        listsToSearch = Object.keys(listsMap);
    } else {
        specificListChecks.forEach(chk => { if (chk.checked) listsToSearch.push(chk.value); });
    }

    let dateFilters = [];
    const checkAllDates = document.getElementById('check-all-dates');
    const specificDateChecks = document.querySelectorAll('.specific-date');

    if (checkAllDates && checkAllDates.checked) {
        dateFilters = ['all'];
    } else {
        specificDateChecks.forEach(chk => { if (chk.checked) dateFilters.push(chk.value); });
    }

    let filteredArray = []; 
    const today = new Date();
    today.setHours(0,0,0,0);

    for (const listId of listsToSearch) {
        const benSnap = await getDocs(collection(db, "lists", listId, "beneficiaries"));
        
        benSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.status !== 'active') return; 
            if (onlyStarred && !data.isStarred) return;

            data.listId = data.listId || listId; 

            let nameVal = (data.name && data.name !== '-' && data.name !== 'No Name') ? data.name : '-';
            let addressVal = '-';
            let familyVal = '-';
            let phoneVal = '-'; 
            let dateValRaw = null;
            
            let dynValues = {};
            uniqueColumns.forEach(c => dynValues[c] = '-');

            if (data.dynamic) {
                fieldMappings.nameIds.forEach(id => { if(data.dynamic[id] && data.dynamic[id] !== '-') nameVal = data.dynamic[id]; });
                fieldMappings.addressIds.forEach(id => { if(data.dynamic[id]) addressVal = data.dynamic[id]; });
                fieldMappings.familyIds.forEach(id => { if(data.dynamic[id]) familyVal = data.dynamic[id]; });
                fieldMappings.dateIds.forEach(id => { if(data.dynamic[id]) dateValRaw = data.dynamic[id]; });
                fieldMappings.phoneIds.forEach(id => { if(data.dynamic[id] && data.dynamic[id] !== '-') phoneVal = data.dynamic[id]; });
                
                allFields.forEach(f => {
                    if (data.dynamic[f.id] && data.dynamic[f.id] !== '-') {
                        let val = data.dynamic[f.id];
                        if (f.type === 'date' || f.label.includes('بەروار') || f.label.includes('تاکو') || f.label.includes('کۆتایی')) {
                            let parsed = parseDateRobust(val);
                            if (parsed) val = `${parsed.getFullYear()}/${parsed.getMonth()+1}/${parsed.getDate()}`;
                        }
                        dynValues[f.label.trim()] = val;
                    }
                });
            }
            if (nameVal === '-') nameVal = 'بێ ناو';

            let parsedDate = parseDateRobust(dateValRaw);
            let dateStatus = 'ok';

            if (parsedDate) {
                const diffDays = Math.ceil((parsedDate - today) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) dateStatus = 'expired';
                else if (diffDays <= 30) dateStatus = 'warning';
            }

            const stringData = JSON.stringify(data).toLowerCase() + nameVal.toLowerCase() + addressVal.toLowerCase() + phoneVal.toLowerCase();
            
            if (textFilter && !stringData.includes(textFilter)) return;
            if (addressFilter && !addressVal.toLowerCase().includes(addressFilter)) return;
            if (amountFilter && Number(data.amount) !== Number(amountFilter)) return;
            if (familyFilter && String(familyVal) !== String(familyFilter)) return;

            if (!dateFilters.includes('all')) {
                if (!parsedDate) return; 
                let mappedStatus = '';
                if (dateStatus === 'expired') mappedStatus = 'expired';
                else if (dateStatus === 'warning') mappedStatus = 'less_month';
                else if (dateStatus === 'ok') mappedStatus = 'more_month';
                if (!dateFilters.includes(mappedStatus)) return; 
            }

            let statusTextForExcel = 'باشە';
            let statusBadge = '<span class="badge bg-success bg-opacity-10 text-success px-3 py-2 rounded-pill"><i class="fas fa-check-circle me-1"></i> باشە</span>';
            if (dateStatus === 'expired') {
                statusBadge = '<span class="badge bg-danger bg-opacity-10 text-danger px-3 py-2 rounded-pill"><i class="fas fa-times-circle me-1"></i> بەسەرچوو</span>';
                statusTextForExcel = 'بەسەرچوو';
            }
            if (dateStatus === 'warning') {
                statusBadge = '<span class="badge bg-warning bg-opacity-10 text-warning px-3 py-2 rounded-pill"><i class="fas fa-exclamation-triangle me-1"></i> کەمتر لە مانگێک</span>';
                statusTextForExcel = 'کەمتر لە مانگێک';
            }
            if (!parsedDate) {
                statusBadge = '<span class="badge bg-secondary bg-opacity-10 text-secondary px-3 py-2 rounded-pill"><i class="fas fa-calendar-minus me-1"></i> بەروار نییە</span>';
                statusTextForExcel = 'بەروار نییە';
            }

            filteredArray.push({
                rawData: data,
                listId: listId,
                listNameStr: listsMap[listId].name,   // ناوی لیستەکە
                listColor: listsMap[listId].color,    // ڕەنگی لیستەکە
                nameVal: nameVal,
                addressVal: addressVal,
                amountVal: Number(data.amount || 0),
                statusBadge: statusBadge,
                statusTextExcel: statusTextForExcel,
                dynValues: dynValues, 
                orderIndex: data.orderIndex || 9999 
            });
        });
    }

    filteredArray.sort((a, b) => {
        let result = 0;
        if (sortBy === 'name') result = a.nameVal.localeCompare(b.nameVal, 'ku');
        else if (sortBy === 'address') result = a.addressVal.localeCompare(b.addressVal, 'ku');
        else if (sortBy === 'amount') result = a.amountVal - b.amountVal;
        else result = a.orderIndex - b.orderIndex;

        if (sortOrder === 'desc') result = result * -1;
        return result;
    });

    currentFilteredData = filteredArray;

    let resultsHTML = '';
    let index = 1; 
    
    filteredArray.forEach(item => {
        const dataStr = encodeURIComponent(JSON.stringify(item.rawData));
        const starIcon = item.rawData.isStarred ? '<i class="fas fa-star text-warning me-2" title="تایبەت" style="filter: drop-shadow(0 2px 4px rgba(255,193,7,0.4)); font-size: 1.1rem;"></i>' : '';
        
        resultsHTML += `
            <tr>
                <td data-label="#" class="fw-bold text-muted text-center" style="width: 50px;">${index++}</td> 
                <td data-label="ناوی کەس" class="fw-bold text-dark name-cell" style="cursor: pointer;" onclick="window.showDetails('${dataStr}', '${item.listNameStr}')">
                    <div class="d-flex align-items-center">
                        <div class="avatar-circle ms-3"><i class="fas fa-user"></i></div>
                        <div>${starIcon}${item.nameVal}</div>
                    </div>
                </td>`;
        
        tableColumns.forEach(col => {
            if (col.type === 'static') {
                if (col.id === 'col-amount') {
                    resultsHTML += `<td data-label="${col.label}" class="${col.id} fw-bold text-success" dir="ltr">${item.amountVal.toLocaleString()} IQD</td>`;
                }
                if (col.id === 'col-listName') {
                    // لێرەدا ڕەنگەکە بەکاردەهێنین بۆ دروستکردنی باجێکی جوان
                    resultsHTML += `<td data-label="${col.label}" class="${col.id}"><span class="custom-badge" style="background-color: ${item.listColor}15; color: ${item.listColor}; border: 1px solid ${item.listColor}40;">${item.listNameStr}</span></td>`;
                }
                if (col.id === 'col-status') {
                    resultsHTML += `<td data-label="${col.label}" class="${col.id}">${item.statusBadge}</td>`;
                }
            } else {
                const val = item.dynValues[col.dynKey];
                const align = (val !== '-' && (col.label.includes('مۆبایل') || col.label.includes('بەروار'))) ? 'dir="ltr" class="text-start fw-bold text-dark"' : '';
                resultsHTML += `<td data-label="${col.label}" class="${col.id}" ${align}>${val}</td>`;
            }
        });

        resultsHTML += `</tr>`;
    });

    if (countDisplay) countDisplay.innerText = filteredArray.length;

    if (resultsHTML === '') {
        tbody.innerHTML = `<tr><td colspan="${totalCols}" class="text-center py-5 border-0"><i class="fas fa-box-open fa-3x text-muted mb-3 opacity-50"></i><br><h5 class="text-danger fw-bold">هیچ داتایەک نەدۆزرایەوە بەپێی ئەم فلتەرانە</h5></td></tr>`;
    } else {
        tbody.innerHTML = resultsHTML;
        updateColumnVisibility(); 
    }
}

window.showDetails = function(dataStr, listName) {
    const data = JSON.parse(decodeURIComponent(dataStr));
    const listId = data.listId;
    const listColor = listsMap[listId]?.color || '#4e73df'; // هێنانی ڕەنگی لیستەکە
    
    const listSpecificFields = allFields.filter(f => f.listId === listId).sort((a,b) => a.order - b.order);
    let primaryAmount = data.amount || 0;

    // دروستکردنی هێدەری پۆپ-ئەپەکە
    let html = `
        <div class="modal-header-bg" style="background: linear-gradient(135deg, ${listColor} 0%, #224abe 100%);">
            <button class="close-modal-btn" onclick="Swal.close()"><i class="fas fa-times"></i></button>
            <div class="modal-avatar-lg" style="color: ${listColor};"><i class="fas fa-user"></i></div>
            <h3 class="modal-name-title">${data.name || 'بێ ناو'}</h3>
            <span class="badge bg-white text-dark mt-2 px-3 py-2 rounded-pill shadow-sm" style="font-size:0.85rem;">
                <i class="fas fa-list me-1" style="color:${listColor};"></i> ${listName}
            </span>
        </div>
        <div class="modal-body-content" dir="rtl">
            
            <div class="amount-highlight-card">
                <div class="fw-bold text-muted"><i class="fas fa-money-bill-wave text-success ms-1"></i> بڕی پارە</div>
                <div class="fs-4 fw-bold text-success" dir="ltr">${Number(primaryAmount).toLocaleString()} IQD</div>
            </div>

            <div class="info-grid">
    `;

    // فەنکشنێک بۆ دیاریکردنی ئایکۆن بەپێی ناوی خانەکە
    const getIconForField = (label) => {
        const l = label.toLowerCase();
        if(l.includes('مۆبایل') || l.includes('تەلەفۆن')) return 'fa-phone text-primary';
        if(l.includes('ناونیشان') || l.includes('گەڕەک')) return 'fa-map-marker-alt text-danger';
        if(l.includes('بەروار') || l.includes('تاکو')) return 'fa-calendar-alt text-warning';
        if(l.includes('ژ.ئ.خ') || l.includes('خێزان')) return 'fa-users text-info';
        return 'fa-info-circle text-secondary';
    };

    listSpecificFields.forEach(f => {
        let val = data.dynamic ? (data.dynamic[f.id] || '-') : '-';
        if (val === '-' && f.type === 'sys_name') val = data.name || '-';
        if (val === '-' && f.type === 'sys_amount') val = primaryAmount ? primaryAmount.toLocaleString() : '-';
        
        // ڕێکخستنی بەروار
        if ((f.type === 'date' || f.label.includes('بەروار') || f.label.includes('تاکو') || f.label.includes('کۆتایی')) && val !== '-') {
            let parsed = parseDateRobust(val);
            if(parsed) val = `<span dir="ltr">${parsed.toISOString().split('T')[0]}</span>`;
        }

        const icon = getIconForField(f.label);
        const dir = (f.label.includes('مۆبایل') || f.label.includes('بەروار')) ? 'dir="ltr" class="info-value text-start"' : 'class="info-value"';

        html += `
            <div class="info-item-card">
                <div class="info-label"><i class="fas ${icon}"></i> ${f.label}</div>
                <div ${dir}>${val}</div>
            </div>
        `;
    });

    html += `
            </div> </div> `;

Swal.fire({
        html: html,
        width: '450px',
        showConfirmButton: false,
        showCloseButton: false,
        customClass: {
            popup: 'swal-custom-popup'
        },
        heightAuto: false // <--- ئەم دێڕە زیاد بکە
    });
};

document.getElementById('btn-reset').addEventListener('click', () => {
    document.querySelectorAll('.form-control, .form-select').forEach(el => {
        if(el.id !== 'dropdownListButton' && el.id !== 'dropdownDateButton') el.value = '';
    });
    
    const checkAllLists = document.getElementById('check-all-lists');
    if(checkAllLists) checkAllLists.checked = true;
    document.querySelectorAll('.specific-list').forEach(chk => chk.checked = false);
    updateDropdownText();

    const checkAllDates = document.getElementById('check-all-dates');
    if(checkAllDates) checkAllDates.checked = true;
    document.querySelectorAll('.specific-date').forEach(chk => chk.checked = false);
    updateDateDropdownText();

    const chkStarred = document.getElementById('filter-starred');
    if (chkStarred) chkStarred.checked = false;

    document.getElementById('sort-by').value = 'none';
    document.getElementById('sort-order').value = 'asc';
    performSearch();
});

document.getElementById('btn-search').addEventListener('click', performSearch);
document.getElementById('filter-starred')?.addEventListener('change', performSearch);

document.querySelectorAll('.form-control, .form-select').forEach(input => {
    if(input.tagName === 'SELECT' && input.id !== 'dropdownListButton' && input.id !== 'dropdownDateButton') {
        input.addEventListener('change', performSearch);
    }
    input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') performSearch();
    });
});

document.addEventListener('input', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if(e.target.classList.contains('form-check-input')) return;

        const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
        const arabicDigits  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
        
        let originalValue = e.target.value;
        let convertedValue = originalValue;

        for (let i = 0; i < 10; i++) {
            convertedValue = convertedValue.replace(persianDigits[i], i).replace(arabicDigits[i], i);
        }

        if (originalValue !== convertedValue) {
            let start = null; let end = null;
            try { start = e.target.selectionStart; end = e.target.selectionEnd; } catch (err) {}
            e.target.value = convertedValue;
            if (start !== null && end !== null) {
                try { e.target.setSelectionRange(start, end); } catch (err) {}
            }
        }
    }
});

const btnPrint = document.getElementById('btn-print');
if (btnPrint) {
    btnPrint.addEventListener('click', () => {
        if (currentFilteredData.length === 0) {
            Swal.fire('ئاگاداری', 'هیچ داتایەک نەدۆزرایەوە بۆ پرێنتکردن.', 'warning');
            return;
        }

        const count = document.getElementById('results-count').innerText;
        const printStats = document.getElementById('print-stats-dynamic');
        if(printStats) {
            printStats.innerText = `کۆی گشتی: ${count} خێزان | بەرواری دەرکردن: ${new Date().toLocaleDateString('ku-IQ')}`;
        }

        let printHTML = `<table class="table"><thead><tr><th>#</th><th>ناوی کەس</th>`;
        
        tableColumns.forEach(col => {
            const toggle = document.querySelector(`.col-toggle[value="${col.id}"]`);
            if (toggle && toggle.checked) {
                printHTML += `<th>${col.label}</th>`;
            }
        });
        printHTML += `</tr></thead><tbody>`;

        currentFilteredData.forEach((item, index) => {
            printHTML += `<tr><td>${index + 1}</td><td class="fw-bold" style="color: #2c3e50;">${item.nameVal}</td>`;
            
            tableColumns.forEach(col => {
                const toggle = document.querySelector(`.col-toggle[value="${col.id}"]`);
                if (toggle && toggle.checked) {
                    if (col.id === 'col-listName') {
                        // ناوی لیستەکە بە هەمان ستایلی UI ی مۆبایل دروست دەکەینەوە
                        printHTML += `<td><span style="background-color: ${item.listColor}15; color: ${item.listColor}; border: 1px solid ${item.listColor}40; padding: 4px 10px; border-radius: 15px; font-weight: bold; font-size: 12px; display: inline-block;">${item.listNameStr}</span></td>`;
                    }
                    else if (col.id === 'col-amount') {
                        // بڕی پارەکە بە ڕەنگی سەوز دەردەکەوێت
                        printHTML += `<td dir="ltr" style="color: #1cc88a; font-weight: bold;">${item.amountVal.toLocaleString()} IQD</td>`;
                    }
                    else if (col.id === 'col-status') {
                        // ڕاستەوخۆ باجە ڕەنگاوڕەنگەکە بەکاردەهێنین
                        printHTML += `<td>${item.statusBadge}</td>`; 
                    }
                    else {
                        const val = item.dynValues[col.dynKey];
                        const dir = (val !== '-' && (col.label.includes('مۆبایل') || col.label.includes('بەروار'))) ? 'dir="ltr"' : '';
                        printHTML += `<td ${dir}>${val}</td>`;
                    }
                }
            });
            printHTML += `</tr>`;
        });

        printHTML += `</tbody></table>`;
        document.getElementById('print-table-container').innerHTML = printHTML;

        setTimeout(() => { window.print(); }, 300);
    });
}

const btnExcel = document.getElementById('btn-excel');
if (btnExcel) {
    btnExcel.addEventListener('click', () => {
        if (currentFilteredData.length === 0) {
            Swal.fire('ئاگاداری', 'هیچ داتایەک نەدۆزرایەوە بۆ ئەوەی دایبەزێنیت.', 'warning');
            return;
        }

        const excelData = currentFilteredData.map((item, index) => {
            let row = {
                'ڕیزبەندی': index + 1,
                'ناوی کەس': item.nameVal
            };
            
            tableColumns.forEach(col => {
                const toggle = document.querySelector(`.col-toggle[value="${col.id}"]`);
                if (toggle && toggle.checked) {
                    if (col.id === 'col-listName') row[col.label] = item.listNameStr;
                    else if (col.id === 'col-amount') row[col.label] = item.amountVal;
                    else if (col.id === 'col-status') row[col.label] = item.statusTextExcel;
                    else row[col.label] = item.dynValues[col.dynKey];
                }
            });

            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "ئەنجامی گەڕان");

        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `گەرانی_گشتی_${dateStr}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
        Swal.fire({
            title: 'سەرکەوتوو',
            text: 'فایلی ئێکسڵەکە بە سەرکەوتوویی دابەزێنرا!',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });
    });
}

initializeData();