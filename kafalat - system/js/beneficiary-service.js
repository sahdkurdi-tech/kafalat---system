/* js/beneficiary-service.js */

import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, query, where, orderBy, doc, updateDoc, writeBatch, limit, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { allLists, formFields } from "./settings.js";

let unsubscribeList = null;
let sortableInstance = null;

// --- Helper: Get Max Order ---
export async function getMaxOrderIndex(listId) {
    const q = query(collection(db, "lists", listId, "beneficiaries"), orderBy("orderIndex", "desc"), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    return snap.docs[0].data().orderIndex || 0;
}

// --- ACTIVE LIST VIEW ---
export async function openList(listId) {
    window.currentListId = listId;
    const list = allLists.find(l => l.id === listId);
    if(!list) return;
    
    if(window.navTo) window.navTo('list-view');

    const titleEl = document.getElementById("activeListTitle");
    if(titleEl) {
        titleEl.innerText = list.name;
        titleEl.style.color = list.color;
    }
    loadListData(listId);
}

// ==========================================
// چارەسەری کێشەی بەروار
// ==========================================
function parseDateRobust(value) {
    if (!value) return null;
    const numVal = Number(value);
    if (!isNaN(numVal) && numVal > 20000) { 
        const date = new Date(Math.round((numVal - 25569) * 86400 * 1000));
        date.setHours(0,0,0,0);
        return date;
    }
    if (typeof value === 'string') {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
            d.setHours(0,0,0,0);
            return d;
        }
    }
    return null;
}

// --- LOAD DATA & TABLE ---
export function loadListData(listId) {
    if (unsubscribeList) unsubscribeList();

    // ١. هێنانی خانەکان بەپێی ڕیزبەندی خۆیان
    let visibleFields = formFields.filter(f => f.listId === listId && f.showInTable === true)
                                  .sort((a,b) => a.order - b.order);

    // ============================================================
    // چارەسەری کێشەکە (FIX):
    // دۆزینەوەی خانەی "ناو" و هێنانی بۆ پلەی یەکەم (Index 0) بە زۆر
    // ============================================================
    const nameFieldIndex = visibleFields.findIndex(f => {
        const l = f.label.trim(); 
        // گرنگ: ئەگەر وشەکە "ناونیشان" بوو، ئەمە ناو نییە!
        if (l.includes("ناونیشان")) return false;

        // مەرجەکانی تر بۆ دۆزینەوەی ناو
        return f.type === 'sys_name' || l === 'ناو' || l === 'ناوی سیانی' || l.toLowerCase().includes('name');
    });

    // ئەگەر ناوەکە دۆزرایەوە، لە شوێنی خۆی دەریبهێنە و بیخە سەرەتا
    if (nameFieldIndex > -1) {
        const [nameField] = visibleFields.splice(nameFieldIndex, 1);
        visibleFields.unshift(nameField);
    }
    // ============================================================

    
    const phoneField = visibleFields.find(f => {
        const l = f.label.toLowerCase();
        return l.includes("مۆبایل") || l.includes("mobile") || l.includes("phone") || l.includes("تەلەفۆن");
    });

    const expiryField = visibleFields.find(f => {
        const l = f.label.toLowerCase();
        return (
            l.includes("بەروار") || 
            l.includes("date") || 
            f.type === 'date' || 
            l.includes("تاکو مانگی") ||
            l.includes("مانگی") || 
            l.includes("کەفالەت") ||
            l.includes("expiry")
        );
    });

    let headerHTML = `<tr><th width="30px"></th><th width="50px">#</th>`; 
    visibleFields.forEach(f => {
        if (phoneField && f.id === phoneField.id) headerHTML += `<th width="200px">${f.label}</th>`;
        else headerHTML += `<th>${f.label}</th>`;
    });
    headerHTML += `<th width="140px">کردارەکان</th>`;
    headerHTML += `<th></th></tr>`;
    
    const thead = document.getElementById("listTableHead");
    if(thead) thead.innerHTML = headerHTML;

    const q = query(
        collection(db, "lists", listId, "beneficiaries"), 
        where("status", "==", "active"), 
        orderBy("orderIndex", "asc")
    );

    unsubscribeList = onSnapshot(q, (snap) => {
        const tbody = document.getElementById("listTableBody");
        if(!tbody) return;
        let allRowsHTML = "";
        let counter = 1;

        // پشکنین: ئایا بەکارهێنەر ئەدمینە؟
        const isAdmin = document.body.classList.contains('is-admin');

        snap.forEach(docSnap => {
            const d = docSnap.data();
            const dataStr = encodeURIComponent(JSON.stringify({ ...d, listId: listId }));
            
            // --- پشکنینی بلۆک ---
            const isCallBlocked = d.isCallBlocked === true;

            // --- شیکاری بەروار و ڕەنگ ---
            let rowStyle = ""; 
            let displayDate = null;

            if (expiryField) {
                let rawVal = d.dynamic ? d.dynamic[expiryField.id] : null;
                if (!rawVal && expiryField.type === 'sys_amount') rawVal = d.amount;

                // تێبینی: دڵنیابە parseDateRobust لە شوێنێکی تر پێناسە کراوە
                let targetDate = typeof parseDateRobust !== 'undefined' ? parseDateRobust(rawVal) : null;
                // ئەگەر parseDateRobust نەبوو، هەوڵدەدەین لێرە چارەسەری بکەین
                if (!targetDate && rawVal) {
                    const numVal = Number(rawVal);
                    if (!isNaN(numVal) && numVal > 20000) targetDate = new Date(Math.round((numVal - 25569) * 86400 * 1000));
                    else if (typeof rawVal === 'string') targetDate = new Date(rawVal);
                }

                if (targetDate && !isNaN(targetDate.getTime())) {
                    targetDate.setHours(0,0,0,0);
                    displayDate = targetDate.toISOString().split('T')[0];
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const diffTime = targetDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                    if (diffDays < 0) {
                        rowStyle = "background-color: #ffcccc !important; box-shadow: inset 0 0 0 9999px #ffcccc !important;";
                    } else if (diffDays <= 30) {
                        rowStyle = "background-color: #fff3cd !important; box-shadow: inset 0 0 0 9999px #fff3cd !important;";
                    }
                }
            }
            
            if (isCallBlocked) {
                 rowStyle = "background-color: #ffebee !important; box-shadow: inset 0 0 0 9999px #ffebee !important;";
            }

            const status = d.callStatus || 'pending'; 
            const lastCall = d.lastCallTime ? new Date(d.lastCallTime.seconds * 1000).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : '';
            
            let phoneTextColor = '#0d6efd'; 
            if(isCallBlocked) phoneTextColor = '#dc3545'; 
            else if(status === 'answered') phoneTextColor = '#198754'; 
            else if(status === 'no_answer') phoneTextColor = '#ffc107'; 
            else if(status === 'off') phoneTextColor = '#dc3545'; 
            else if(status === 'wrong') phoneTextColor = '#212529'; 

            allRowsHTML += `<tr data-id="${docSnap.id}" style="${rowStyle}">
                <td class="drag-handle text-muted text-center" style="cursor:grab; vertical-align: middle; ${rowStyle}"><i class="fas fa-grip-vertical"></i></td>
                <td class="text-center" style="vertical-align: middle; ${rowStyle}"><span class="small fw-bold text-muted">${d.orderIndex || counter++}</span></td>`;
            
            visibleFields.forEach((f, index) => {
                let cellVal = d.dynamic ? (d.dynamic[f.id] || '-') : '-';
                
                if (cellVal === '-' && f.type === 'sys_name') cellVal = d.name || '-';
                if (cellVal === '-' && f.type === 'sys_amount') cellVal = (d.amount || 0).toLocaleString();

                if (expiryField && f.id === expiryField.id && displayDate) {
                    cellVal = `<span class="fw-bold" dir="ltr">${displayDate}</span>`;
                }

                // لێرە Index 0 بەکار دەهێندرێت، کە ئێستا دڵنیایین "ناو"ـە
                if (index === 0) {
                    allRowsHTML += `<td style="vertical-align: middle; ${rowStyle}">
                        <a href="#" onclick="window.viewDetails('${dataStr}')" class="fw-bold text-dark text-decoration-none">
                            ${cellVal}
                        </a>
                    </td>`;
                } else if (phoneField && f.id === phoneField.id) {
                     const phoneNum = (cellVal && cellVal !== '-') ? cellVal : '';
                     if (phoneNum) {
                         const clickAction = isCallBlocked 
                            ? `window.showBlockAlert('${d.name || 'بەکارهێنەر'}')` 
                            : `window.openPhoneMenu('${docSnap.id}', '${phoneNum}')`;
                         
                         const textDecor = isCallBlocked ? 'line-through' : 'none';
                         const cursorStyle = isCallBlocked ? 'not-allowed' : 'pointer';

                         allRowsHTML += `
                            <td style="padding: 5px; text-align:right; vertical-align:middle; ${rowStyle}">
                                <div onclick="${clickAction}" 
                                     style="cursor:${cursorStyle}; text-decoration:${textDecor}; font-weight:bold; font-size:1.1rem; font-family:sans-serif; color: ${phoneTextColor}; display: inline-block;" 
                                     title="${isCallBlocked ? 'پەیوەندی ڕاگیراوە!' : 'گۆڕینی دۆخی پەیوەندی'}">
                                    ${phoneNum}
                                </div>
                                ${lastCall ? `<div style="font-size:10px; color:#666; margin-right:5px;">${lastCall}</div>` : ''}
                            </td>
                         `;
                     } else {
                         allRowsHTML += `<td class="text-center" style="${rowStyle}">-</td>`;
                    }
                } else {
                    allRowsHTML += `<td style="vertical-align: middle; ${rowStyle}">${cellVal}</td>`;
                }
            });

            if (!phoneField) {
                 // allRowsHTML += `<td class="text-center" style="${rowStyle}">-</td>`;
            }

            // ئامادەکردنی HTMLـی دوگمەی بلۆک تەنها ئەگەر ئەدمین بێت
            let blockButtonHTML = '';
            if (isAdmin) {
                const blockBtnText = isCallBlocked ? 'لابردنی بلۆک' : 'بلۆک کردنی پەیوەندی';
                const blockBtnIcon = isCallBlocked ? 'fa-check-circle' : 'fa-ban';
                const blockBtnColor = isCallBlocked ? 'text-success' : 'text-danger';
                
                blockButtonHTML = `
                <button class="btn-act-custom ${blockBtnColor}" onclick="window.toggleCallBlock('${docSnap.id}', ${isCallBlocked})">
                    <i class="fas ${blockBtnIcon}"></i> ${blockBtnText}
                </button>`;
            }

            allRowsHTML += `<td class="text-nowrap text-center" style="vertical-align: middle; ${rowStyle}">
                <div class="action-menu">
                    <button class="menu-btn" onclick="toggleMenu(event, 'row-${docSnap.id}')"><i class="fas fa-ellipsis-v"></i></button>
                    <div id="row-${docSnap.id}" class="menu-dropdown">
                        <button class="btn-act-edit" onclick="window.editEntry('${docSnap.id}', '${dataStr}')"><i class="fas fa-edit"></i> دەستکاری</button>
                        
                        ${blockButtonHTML}

<button class="btn-act-move text-info" onclick="window.moveToList('${docSnap.id}', '${dataStr}')"><i class="fas fa-exchange-alt"></i> گواستنەوە بۆ لیستیتر</button>
                        <button class="btn-act-suspend" onclick="window.suspendEntry('${docSnap.id}')"><i class="fas fa-stop-circle"></i> ڕاگرتن</button>
                        <button class="btn-act-temp" onclick="window.moveToTemporary('${docSnap.id}')"><i class="fas fa-clock"></i> گواستنەوە بۆ کاتی</button>
                        <button class="btn-act-delete text-danger" onclick="window.deleteEntry('${docSnap.id}')"><i class="fas fa-trash-alt"></i> سڕینەوە</button>
                    </div>
                </div>
            </td></tr>`;
        });
        tbody.innerHTML = allRowsHTML;

        if (sortableInstance) sortableInstance.destroy();

        if (document.body.classList.contains('is-admin')) {
            sortableInstance = Sortable.create(tbody, {
                handle: '.drag-handle', 
                animation: 150, 
                ghostClass: 'bg-light',
                onEnd: async function() {
                    const rows = tbody.querySelectorAll('tr');
                    const batch = writeBatch(db);
                    rows.forEach((row, index) => {
                        const docId = row.getAttribute('data-id');
                        const docRef = doc(db, "lists", listId, "beneficiaries", docId);
                        batch.update(docRef, { orderIndex: index + 1 });
                    });
                    await batch.commit();
                }
            });
        }
    });
}
// --- DYNAMIC FORM ---
function getDynamicFormHTML(listId, existingData = {}) {
    const fields = formFields.filter(f => f.listId === listId).sort((a,b) => a.order - b.order);
    let html = `<div class="text-start">`;
    
    // کۆدی دروستکردنی کێڵگەکان (Fields) [cite: 442]
    fields.forEach(f => {
        let val = existingData.dynamic ? (existingData.dynamic[f.id] || '') : '';
        
        if (!val && f.type === 'sys_name') val = existingData.name || '';
        if (!val && f.type === 'sys_amount') val = existingData.amount || '';

        if ((f.label.includes("بەروار") || f.type === 'date' || f.label.includes("date") || f.label.includes("expiry") || f.label.includes("بەسەرچوون")) && val) {
            let parsed = parseDateRobust(val); // تێبینی: دڵنیابەرەوە ئەم فانکشنە لە سەرەوە پێناسە کراوە یان import کراوە [cite: 389]
            if(parsed) val = parsed.toISOString().split('T')[0];
        }

        html += `<label class="fw-bold mt-2">${f.label}</label>`;
        
        if (f.type === 'note' || f.type === 'textarea') {
            html += `
            <div class="input-group mb-2">
                <textarea id="f-${f.id}" class="form-control" placeholder="تێبینی...">${val}</textarea>
                <button class="btn btn-outline-secondary" type="button" onclick="window.startVoiceInput('f-${f.id}')" title="تۆمارکردنی دەنگ">
                    <i id="btn-mic-f-${f.id}" class="fas fa-microphone"></i>
                </button>
            </div>`;
        } else if (f.type === 'select') {
            const opts = f.options.split(',').map(o => `<option value="${o.trim()}" ${val === o.trim() ? 'selected' : ''}>${o.trim()}</option>`).join('');
            html += `<select id="f-${f.id}" class="form-select mb-2">${opts}</select>`;
        } else {
            let inputType = 'text';
            if (f.type === 'number' || f.type === 'sys_amount') inputType = 'number';
            if (f.type === 'date') inputType = 'date';
            
            if (inputType === 'date') {
                html += `<input type="${inputType}" id="f-${f.id}" class="form-control mb-2" value="${val}">`;
            } else {
                html += `
                <div class="input-group mb-2">
                    <input type="${inputType}" id="f-${f.id}" class="form-control" value="${val}" placeholder="...">
                    <button class="btn btn-outline-secondary" type="button" onclick="window.startVoiceInput('f-${f.id}')" title="تۆمارکردنی دەنگ">
                        <i id="btn-mic-f-${f.id}" class="fas fa-microphone"></i>
                    </button>
                </div>`;
            }
        }
    });

    // === بەشی نوێ: دوگمەی چاپکردن بۆ زەرف ===
    // ئەگەر داتای کۆن نەبوو (زیادکردن)، یان ئەگەر هەبوو و printEnvelope بەهای هەبوو
    const shouldPrint = (existingData.printEnvelope === undefined) ? true : existingData.printEnvelope;
    const checkedAttr = shouldPrint ? 'checked' : '';

    html += `
        <hr class="my-3">
        <div class="form-check form-switch p-0 d-flex align-items-center gap-2 bg-light rounded p-2 border">
            <input class="form-check-input m-0" type="checkbox" id="inp-print-env" ${checkedAttr} style="width: 2.5em; height: 1.5em; cursor: pointer;">
            <label class="form-check-label fw-bold cursor-pointer" for="inp-print-env" style="cursor: pointer;">
                <i class="fas fa-envelope-open-text text-primary ms-2"></i> چاپکردن بۆ زەرف (Print Envelope)
            </label>
        </div>
    `;
    // ==========================================

    html += `</div>`;
    return { html, fields };
}
// --- OPEN ENTRY ---
// لەناو js/beneficiary-service.js

export async function openEntryModal() {
    if (!window.currentListId) return;
    const { html, fields } = getDynamicFormHTML(window.currentListId);
    
    if (fields.length === 0) return Swal.fire('هەڵە', 'هیچ کێڵگەیەک دیاری نەکراوە بۆ ئەم لیستە.', 'warning');
    
    const { value: res } = await Swal.fire({
        title: 'زیادکردنی ناوی نوێ', 
        html: html, 
        width: '600px', 
        showCancelButton: true, 
        confirmButtonText: 'پاشەکەوتکردن',
        preConfirm: () => {
            const dynamicData = {};
            fields.forEach(f => {
                const el = document.getElementById(`f-${f.id}`);
                if (el) dynamicData[f.id] = el.value;
            });
            // وەرگرتنی دۆخی دوگمەی زەرف
            const printEnvelope = document.getElementById('inp-print-env').checked;

            return { dynamicData, printEnvelope };
        }
    });

    if(res) {
        Swal.fire({title: 'جارێك بۆستە...', didOpen: () => Swal.showLoading()});
        
        const firstFieldId = fields[0].id;
        const primaryName = res.dynamicData[firstFieldId] || 'No Name';
        
        let primaryAmount = 0;
        const amountField = fields.find(f => f.label.includes('بڕ') || f.label.includes('Amount') || f.type === 'number');
        if (amountField) {
            primaryAmount = Number(res.dynamicData[amountField.id]) || 0;
        }

        const maxIdx = await getMaxOrderIndex(window.currentListId);
        
        // === لۆژیکی ئۆتۆماتیکی بلۆک ===
        // ئەگەر زەرف کوژایەوە (false)، ئەوا بلۆک دەبێتە (true)
        const autoBlock = !res.printEnvelope; 

        await addDoc(collection(db, "lists", window.currentListId, "beneficiaries"), {
            listId: window.currentListId, 
            name: primaryName,      
            amount: primaryAmount,  
            dynamic: res.dynamicData, 
            printEnvelope: res.printEnvelope,
            isCallBlocked: autoBlock, // <--- لێرە دۆخی بلۆکمان بەستەوە بە دۆخی زەرف
            status: 'active', 
            orderIndex: maxIdx + 1, 
            createdAt: new Date()
        });
        Swal.fire('تەواو', 'بە سەرکەوتوویی زیادکرا', 'success');
    }
}

// js/beneficiary-service.js

// ٢. ئەمە جێگرەوەی viewDetailsـی کۆنە
// گۆڕانکاری: لابردنی window. و دانانی const
export const viewDetails = async (dataStr) => {
    const data = JSON.parse(decodeURIComponent(dataStr));
    const listId = data.listId || window.currentListId;
    
    // ئامادەکردنی زانیارییەکان وەک پێشوو [cite: 470, 471]
    const allListFields = formFields.filter(f => f.listId === listId).sort((a,b) => a.order - b.order);
    
    // دروستکردنی Tabـی زانیاری (Details)
    let detailsTable = `<table class="table table-bordered table-hover mt-3"><tbody>`;
    allListFields.forEach(f => {
        let val = data.dynamic ? (data.dynamic[f.id] || '-') : '-';
        if (val === '-' && f.type === 'sys_name') val = data.name;
        if (val === '-' && f.type === 'sys_amount') val = (data.amount || 0).toLocaleString();
        
        // چارەسەری بەروار [cite: 472]
        if ((f.label.includes("بەروار") || f.type === 'date' || f.label.includes("date")) && val !== '-') {
             // لێرەدا دەتوانین فەنکشنی parseDateRobust بەکاربهێنین ئەگەر export کرابێت
        }
        detailsTable += `<tr><th width="35%" class="bg-light">${f.label}</th><td>${val}</td></tr>`;
    });

    // زیادکردنی دۆخی ئێستا
    const statusColor = data.status === 'suspended' ? 'text-danger' : 'text-success';
    const statusText = data.status === 'suspended' ? 'ڕاگیراوە (Suspended)' : 'چالاکە (Active)';
    detailsTable += `<tr><th class="bg-light">دۆخ</th><td class="fw-bold ${statusColor}">${statusText}</td></tr>`;
    detailsTable += `</tbody></table>`;

    // دیزاینی ناو مۆداڵ (HTML Structure with Tabs)
    const modalContent = `
        <div class="text-end" dir="rtl">
            <h4 class="text-primary text-center mb-3">${data.name}</h4>
            
            <ul class="nav nav-tabs nav-fill" id="beneficiaryTabs" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active fw-bold" id="details-tab" data-bs-toggle="tab" data-bs-target="#tab-details" type="button" role="tab">
                        <i class="fas fa-info-circle"></i> زانیاری
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link fw-bold text-dark" id="history-tab" data-bs-toggle="tab" data-bs-target="#tab-history" type="button" role="tab">
                        <i class="fas fa-history"></i> مێژوو
                    </button>
                </li>
            </ul>

            <div class="tab-content" id="beneficiaryTabsContent">
                
                <div class="tab-pane fade show active p-2" id="tab-details" role="tabpanel">
                    ${detailsTable}
                </div>

                <div class="tab-pane fade p-2" id="tab-history" role="tabpanel">
                    <div id="history-loading" class="text-center py-4 text-muted">
                        <i class="fas fa-spinner fa-spin fa-2x"></i><br>...جار دەکرێت
                    </div>
                    <div id="history-content"></div>
                </div>

            </div>
        </div>
    `;

    // کردنەوەی SweetAlert
    await Swal.fire({
        html: modalContent,
        width: '700px',
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: async () => {
            // هێنانی مێژوو
            const historyHTML = await fetchBeneficiaryHistory(listId, data.name);
            const contentDiv = document.getElementById('history-content');
            const loadingDiv = document.getElementById('history-loading');
            
            if(contentDiv && loadingDiv) {
                loadingDiv.style.display = 'none';
                contentDiv.innerHTML = historyHTML;
            }
            
            // چالاککردنی Bootstrap Tabs
            const triggerTabList = [].slice.call(document.querySelectorAll('#beneficiaryTabs button'))
            triggerTabList.forEach(function (triggerEl) {
                const tabTrigger = new bootstrap.Tab(triggerEl)
                triggerEl.addEventListener('click', function (event) {
                    event.preventDefault()
                    tabTrigger.show()
                })
            })
        }
    });
}// =============================================================
// GLOBAL FUNCTIONS
// =============================================================

// لەناو js/beneficiary-service.js

export async function editEntry(id, dataStr) {
    const data = JSON.parse(decodeURIComponent(dataStr));
    const { html, fields } = getDynamicFormHTML(window.currentListId, data);
    
    const { value: res } = await Swal.fire({ 
        title: 'دەستکاری زانیاری', 
        html: html, 
        width: '600px', 
        showCancelButton: true, 
        confirmButtonText: 'نوێکردنەوە', 
        preConfirm: () => { 
            const dd={};
            fields.forEach(f => {
                const el = document.getElementById(`f-${f.id}`);
                if(el) dd[f.id] = el.value;
            });
            const printEnvelope = document.getElementById('inp-print-env').checked;

            return { dd, printEnvelope }; 
        }
    });
    
    if(res) { 
        const firstFieldId = fields[0].id;
        const primaryName = res.dd[firstFieldId] || data.name;
        
        let primaryAmount = 0;
        const amountField = fields.find(f => f.label.includes('بڕ') || f.label.includes('Amount') || f.type === 'number');
        if (amountField) primaryAmount = Number(res.dd[amountField.id]) || 0;
        
        // === لۆژیکی ئۆتۆماتیکی بلۆک ===
        // ئەگەر زەرف کوژایەوە، ڕاستەوخۆ بلۆک دەکرێت
        const autoBlock = !res.printEnvelope;

        await updateDoc(doc(db, "lists", window.currentListId, "beneficiaries", id), { 
            name: primaryName,
            amount: primaryAmount,
            dynamic: res.dd,
            printEnvelope: res.printEnvelope,
            isCallBlocked: autoBlock // <--- نوێکردنەوەی دۆخی بلۆک
        });
        Swal.fire('تەواو', 'زانیارییەکان نوێکرانەوە', 'success'); 
    }
}

export async function suspendEntry(id) { 
    const {value:r}=await Swal.fire({title: 'هۆکاری ڕاگرتن؟',input:'text',showCancelButton:true}); 
    if(r) await updateDoc(doc(db, "lists", window.currentListId, "beneficiaries", id),{status:'suspended',suspendReason:r,suspendDate:new Date()});
}
export async function moveToTemporary(id) { 
    if(confirm("دڵنیای لە گواستنەوە بۆ لیستی کاتی؟")) await updateDoc(doc(db, "lists", window.currentListId, "beneficiaries", id),{status:'temporary',tempDate:new Date()});
}
// --- سڕینەوەی کاتی (ناردن بۆ سەڵە) ---
export async function deleteEntry(id) { 
    const result = await Swal.fire({
        title: 'دڵنیایت؟',
        text: "ئەم ناوە دەچێتە سەڵەی سڕاوەکان و دەتوانیت بیگەڕێنیتەوە.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'بەڵێ، بیسڕەوە',
        cancelButtonText: 'پاشگەزبوونەوە'
    });

    if(result.isConfirmed) {
        await updateDoc(doc(db, "lists", window.currentListId, "beneficiaries", id), {
            status: 'deleted', // گۆڕینی دۆخ بۆ سڕاوە
            deletedAt: new Date() // کاتی سڕینەوە
        });
        Swal.fire('سڕایەوە!', 'ناوەکە چووە سەڵەی سڕاوەکان.', 'success');
    }
}

// --- گەڕاندنەوەی ناو (Restore) ---
export async function restoreEntry(listId, id) {
    const result = await Swal.fire({
        title: 'گەڕاندنەوە',
        text: "ئایا دەتەوێت ئەم ناوە بگەڕێنیتەوە بۆ لیستەکەی؟",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'بەڵێ',
        cancelButtonText: 'نەخێر'
    });

    if(result.isConfirmed) {
        await updateDoc(doc(db, "lists", listId, "beneficiaries", id), {
            status: 'active', // دۆخەکەی دەکەینەوە ئەکتیڤ
            deletedAt: null
        });
        Swal.fire('گەڕێندرایەوە', 'ناوەکە گەڕایەوە شوێنی خۆی.', 'success');
        loadRecycleBinData(); // نوێکردنەوەی لیستی سەڵەکە
    }
}

// --- سڕینەوەی یەکجارە (Permanent Delete) ---
export async function permanentDelete(listId, id) {
    const result = await Swal.fire({
        title: 'سڕینەوەی یەکجارە!',
        text: "ئاگاداربە! بەمە داتاکە بۆ هەتا هەتایە دەفەوتێت.",
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'بەڵێ، یەکجارە بیسڕەوە',
        cancelButtonText: 'پاشگەزبوونەوە'
    });

    if(result.isConfirmed) {
        await deleteDoc(doc(db, "lists", listId, "beneficiaries", id));
        Swal.fire('تەواو', 'بە یەکجارە سڕایەوە.', 'success');
        loadRecycleBinData(); // نوێکردنەوەی لیستی سەڵەکە
    }
}

// --- هێنانی داتای سەڵەی سڕاوەکان ---
export async function loadRecycleBinData() {
    const tbody = document.getElementById("recycleTableBody");
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><i class="fas fa-spinner fa-spin"></i> چاوەڕێبە...</td></tr>';
    
    let html = "";
    let count = 0;

    // گەڕان لەناو هەموو لیستەکاندا
    // allLists دەبێت import کرابێت
    for (const list of allLists) {
        const q = query(
            collection(db, "lists", list.id, "beneficiaries"),
            where("status", "==", "deleted")
        );
        
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            const d = doc.data();
            const date = d.deletedAt ? new Date(d.deletedAt.seconds * 1000).toLocaleDateString('ku-IQ') : '-';
            
            html += `
                <tr>
                    <td>${d.name}</td>
                    <td><span class="badge bg-secondary">${list.name}</span></td>
                    <td>${date}</td>
                    <td>
                        <button class="btn btn-sm btn-success" title="گەڕاندنەوە" onclick="window.restoreEntry('${list.id}', '${doc.id}')">
                            <i class="fas fa-trash-restore"></i>
                        </button>
                        <button class="btn btn-sm btn-danger ms-2" title="سڕینەوەی یەکجارە" onclick="window.permanentDelete('${list.id}', '${doc.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>
                </tr>
            `;
            count++;
        });
    }

    if (count === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">سەڵەکە بەتاڵە</td></tr>';
    } else {
        tbody.innerHTML = html;
    }
}
// ===============================================
// پەیوەندی و واتسئەپ (و بلۆک کردنی نوێ)
// ===============================================

export async function toggleCallBlock(id, currentStatus) {
    try {
        await updateDoc(doc(db, "lists", window.currentListId, "beneficiaries", id), {
            isCallBlocked: !currentStatus
        });
        const msg = !currentStatus ? 'ژمارە بلۆک کرا (پەیوەندی ڕاگیرا)' : 'بلۆک لابرا';
        Swal.fire({
            icon: 'success',
            title: msg,
            timer: 1000,
            showConfirmButton: false
        });
    } catch (e) {
        console.error(e);
        Swal.fire('Error', e.message, 'error');
    }
}

window.showBlockAlert = function(name) {
    Swal.fire({
        icon: 'error',
        title: 'ڕاگیراوە!',
        text: `تکایە پەیوەندی بە (${name})ـەوە مەکە!`,
        confirmButtonColor: '#d33'
    });
}

export async function openPhoneMenu(docId, phoneNum) {
    if(event) event.stopPropagation();
    const cleanNum = phoneNum.replace(/[^0-9]/g, '');
    Swal.fire({
        title: `<div dir="ltr" style="font-family:sans-serif; font-weight:bold; color:#333;">${phoneNum}</div>`,
        html: `
            <div class="d-grid gap-3">
                <a href="tel:${cleanNum}" class="btn btn-primary btn-lg d-flex align-items-center justify-content-center">
                    <i class="fas fa-phone-alt me-3 fa-lg"></i> پەیوەندی (Call)
                </a>
                <a href="https://wa.me/${cleanNum}" target="_blank" class="btn btn-success btn-lg d-flex align-items-center justify-content-center">
                    <i class="fab fa-whatsapp me-3 fa-lg"></i> نامە
                </a>
                <hr>
                <div class="text-muted mb-2 small fw-bold text-end">دۆخی پەیوەندی:</div>
                <div class="row g-2">
                    <div class="col-6"><button id="btn-ans" class="btn btn-outline-success w-100 fw-bold">وەڵامی داوە</button></div>
                    <div class="col-6"><button id="btn-no" class="btn btn-outline-warning w-100 fw-bold">وەڵام نییە</button></div>
                    <div class="col-6"><button id="btn-off" class="btn btn-outline-danger w-100 fw-bold">داخراوە</button></div>
                    <div class="col-6"><button id="btn-wrong" class="btn btn-outline-dark w-100 fw-bold">هەڵەیە</button></div>
                </div>
                <button id="btn-reset" class="btn btn-light btn-sm mt-3 text-muted">سڕینەوەی دۆخ (Reset)</button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
            document.getElementById('btn-ans').onclick = () => updateCallStatus(docId, 'answered');
            document.getElementById('btn-no').onclick = () => updateCallStatus(docId, 'no_answer');
            document.getElementById('btn-off').onclick = () => updateCallStatus(docId, 'off');
            document.getElementById('btn-wrong').onclick = () => updateCallStatus(docId, 'wrong');
            document.getElementById('btn-reset').onclick = () => updateCallStatus(docId, 'pending');
        }
    });
}

async function updateCallStatus(docId, status) {
    Swal.close();
    const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1000, timerProgressBar: true });
    Toast.fire({ icon: 'info', title: 'جارێک ڕاوەستە...' });
    try {
        const updateData = { callStatus: status };
        if (status === 'pending') updateData.lastCallTime = null;
        else updateData.lastCallTime = new Date();
        
        const docRef = doc(db, "lists", window.currentListId, "beneficiaries", docId);
        await updateDoc(docRef, updateData);
        Toast.fire({ icon: 'success', title: 'نوێکرایەوە' });
    } catch (error) {
        console.error("Error updating status:", error);
        Swal.fire('', 'کێشەیەک ڕوویدا', 'error');
    }
}

export async function resetAllCallStatuses() {
    if (!window.currentListId) return Swal.fire('', 'لیست دیاری نەکراوە', 'error');
    const result = await Swal.fire({title: 'دڵنیای؟', text: "هەموو دۆخەکانی پەیوەندی دەسڕێتەوە!", icon: 'warning', showCancelButton: true, confirmButtonText: 'بەڵێ'});
    if (result.isConfirmed) {
        Swal.fire({ title: '...', didOpen: () => Swal.showLoading() });
        const q = query(collection(db, "lists", window.currentListId, "beneficiaries"));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        let count = 0;
        snapshot.forEach(doc => {
            batch.update(doc.ref, { callStatus: 'pending', lastCallTime: null });
            count++;
        });
        if (count > 0) { await batch.commit(); Swal.fire('', `${count} دانە نوێکرایەوە.`, 'success');
        } 
        else { Swal.fire('', 'هیچ داتایەک نییە.', 'info');
        }
    }
}

export async function saveCurrentListToArchive() {
    if (!window.currentListId) { 
        Swal.fire({ icon: 'warning', title: 'تکایە سەرەتا لیستێک هەڵبژێرە' }); 
        return; 
    }
    
    const listObj = allLists.find(l => l.id === window.currentListId);
    
    const { value: monthLabel } = await Swal.fire({
        title: 'ئەرشیفکردنی: ' + (listObj ? listObj.name : 'Unknown'),
        text: 'تەنها ئەوانە ئەرشیف دەکرێن کە دیاری کراون وەک "وەریگرتووە" (سەوز)',
        input: 'text',
        inputValue: new Date().toLocaleDateString('ku-IQ'),
        showCancelButton: true,
        confirmButtonText: 'ئەرشیفکردن',
        cancelButtonText: 'پەشیمانبوونەوە'
    });
    
    if (!monthLabel) return;
    
    try {
        Swal.fire({ title: '... خەریکی ئەرشیفکردنم', didOpen: () => { Swal.showLoading() } });
        
        // گۆڕانکاری سەرەکی لێرەدایە: زیادکردنی مەرجی callStatus == answered
        const q = query(
            collection(db, "lists", window.currentListId, "beneficiaries"), 
            where("status", "==", "active"),
            where("callStatus", "==", "answered") // تەنها ئەوانەی سەوزن (وەریانگرتووە)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) { 
            Swal.fire({
                icon: 'warning',
                title: 'هیچ ناوێک ئەرشیف نەکرا!',
                text: 'هیچ کەسێک دیاری نەکراوە کە پارەی وەرگرتبێت (ڕەنگی سەوز). تکایە سەرەتا ئەوانەی وەریانگرتووە دیاری بکە ئینجا ئەرشیفی بکە.'
            }); 
            return; 
        }
        
        let allData = [];
        snapshot.forEach(doc => { allData.push(doc.data()); });
        
        await addDoc(collection(db, 'archives'), {
            section: window.currentListId, 
            listName: listObj.name, 
            monthLabel: monthLabel, 
            savedAt: new Date(), 
            items: allData, 
            count: allData.length
        });
        
        Swal.fire({ icon: 'success', title: 'بە سەرکەوتوویی ئەرشیف کرا', text: `ژمارەی ئەو کەسانەی وەریانگرتووە: ${allData.length}` });
        
    } catch (error) { 
        console.error(error);
        Swal.fire('', 'هەڵەیەک ڕوویدا: ' + error.message, 'error');
    }
}

export function filterTable() {
    const input = document.getElementById("listSearch");
    if(!input) return;
    const filter = input.value.toUpperCase();
    const tableBody = document.getElementById("listTableBody");
    if(!tableBody) return;
    const tr = tableBody.getElementsByTagName("tr");
    for (let i = 0; i < tr.length; i++) {
        let found = false;
        const tds = tr[i].getElementsByTagName("td");
        for (let j = 0; j < tds.length; j++) {
            const txtValue = tds[j].textContent || tds[j].innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) { found = true; break; }
        }
        tr[i].style.display = found ? "" : "none";
    }
}

export async function openBulkWhatsAppSender() {
    if (!window.currentListId) return Swal.fire('', 'سەرەتا لیستێک بکەرەوە', 'error');
    const { value: message } = await Swal.fire({ title: 'نامەی واتسئەپ بنووسە', input: 'textarea', showCancelButton: true, confirmButtonText: 'نیشاندان' });
    if (!message) return;
    Swal.fire({title: '...', didOpen: () => Swal.showLoading()});
    
    const fieldsQ = query(collection(db, "listFields"), where("listId", "==", window.currentListId));
    const fieldsSnap = await getDocs(fieldsQ);
    let phoneFieldId = null;
    fieldsSnap.forEach(doc => {
        const f = doc.data();
        const lbl = f.label.toLowerCase();
        if (lbl.includes('مۆبایل') || lbl.includes('mobile') || lbl.includes('phone') || lbl.includes('تەلەفۆن')) { phoneFieldId = doc.id; }
    });
    if (!phoneFieldId) return Swal.fire('', 'هیچ خانەیەکی "مۆبایل" لەم لیستەدا نییە.', 'error');
    
    const q = query(
        collection(db, "lists", window.currentListId, "beneficiaries"), 
        where("status", "==", "active")
    );
    const snap = await getDocs(q);
    let targets = [];
    snap.forEach(doc => {
        const d = doc.data();
        const phone = d.dynamic ? d.dynamic[phoneFieldId] : null;
        if (phone && phone.length > 5) targets.push({ id: doc.id, name: d.name, phone: phone });
    });
    if (targets.length === 0) return Swal.fire('', 'هیچ ژمارەیەک نەدۆزرایەوە.', 'warning');
    let tableHtml = `<div style="max-height: 400px; overflow-y: auto; text-align: right;"><table class="table table-sm table-bordered table-striped"><thead class="table-dark"><tr><th>ناو</th><th>مۆبایل</th><th>ناردن</th></tr></thead><tbody>`;
    targets.forEach(t => {
        const cleanPhone = t.phone.replace(/[^0-9]/g, '');
        const fullMsg = encodeURIComponent(message);
        tableHtml += `<tr id="row-wa-${t.id}"><td>${t.name}</td><td>${t.phone}</td><td><a href="https://wa.me/${cleanPhone}?text=${fullMsg}" target="_blank" class="btn btn-success btn-sm" onclick="window.markAsSent('${t.id}')"><i class="fab fa-whatsapp"></i> ناردن</a><span id="done-${t.id}" style="display:none;" class="text-success ms-2"><i class="fas fa-check"></i></span></td></tr>`;
    });
    tableHtml += `</tbody></table></div>`;
    Swal.fire({ title: `ئامادەکردنی (${targets.length}) نامە`, html: tableHtml, width: '600px', showConfirmButton: false, showCloseButton: true });
}

window.markAsSent = function(id) {
    const row = document.getElementById(`row-wa-${id}`);
    const doneIcon = document.getElementById(`done-${id}`);
    if (row) row.style.opacity = '0.5';
    if (doneIcon) doneIcon.style.display = 'inline';
};

// js/beneficiary-service.js

// ١. فەنکشنێک بۆ گەڕان بەناو ئەرشیفەکاندا بۆ دۆزینەوەی مێژووی کەسەکە
async function fetchBeneficiaryHistory(listId, beneficiaryName) {
    // گەڕان لە کۆلێکشن-ی archives کە هی ئەم لیستەیە
    // تێبینی: بەپێی  ئەرشیف بەپێی listId (section) تۆمار دەکرێت
    const q = query(
        collection(db, "archives"), 
        where("section", "==", listId), 
        orderBy("savedAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    let historyHTML = `<table class="table table-sm table-striped text-center small">
                        <thead class="table-dark">
                            <tr>
                                <th>مانگ</th>
                                <th>بەروار</th>
                                <th>بڕی پارە</th>
                            </tr>
                        </thead>
                        <tbody>`;
    
    let totalReceived = 0;
    let foundCount = 0;

    querySnapshot.forEach((doc) => {
        const archiveData = doc.data();
        // گەڕان بەدوای ناوی کەسەکە لەناو ئەرای items
        // تێبینی: لە  داتاكان وەك items array تۆمار دەکرێن
        const personRecord = archiveData.items.find(item => item.name === beneficiaryName);
        
        if (personRecord) {
            foundCount++;
            const amount = Number(personRecord.amount) || 0;
            totalReceived += amount;
            
            const dateStr = archiveData.savedAt ? new Date(archiveData.savedAt.seconds * 1000).toLocaleDateString('ku-IQ') : '-';
            
            historyHTML += `
                <tr>
                    <td class="fw-bold text-primary">${archiveData.monthLabel}</td>
                    <td>${dateStr}</td>
                    <td class="text-success fw-bold">${amount.toLocaleString()}</td>
                </tr>
            `;
        }
    });

    if (foundCount === 0) {
        historyHTML += `<tr><td colspan="3" class="text-muted">هیچ پێشینەیەك نەدۆزرایەوە</td></tr>`;
    }

    historyHTML += `</tbody>
                    <tfoot class="table-light border-top">
                        <tr>
                            <td colspan="2" class="fw-bold text-end">کۆی گشتی:</td>
                            <td class="fw-bold text-success">${totalReceived.toLocaleString()} IQD</td>
                        </tr>
                    </tfoot>
                    </table>`;

    return historyHTML;
}

// لە ناو js/beneficiary-service.js زیاد بکرێت

// ١. هێنانەوەی لیستی ڕاگیراوان (Suspended)
// لە ناو js/beneficiary-service.js

// ١. هێنانەوەی لیستی ڕاگیراوان (Suspended) - ڕاستکراوە
export async function loadSuspendedData() {
    const tbody = document.getElementById("suspendedTableBody");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> چاوەڕێبە...</td></tr>';
    let html = "";
    let foundAny = false;

    // لێرەدا سەرەتا هەموو ڕێکخستنی خانەکان دەکەین بە Map بۆ ئەوەی خێرا بیدۆزینەوە
    // ئەمە زۆر گرنگە بۆ ئەوەی بزانین یەکەم خانەی هەر لیستێک چییە
    const listFirstFieldMap = {};
    allLists.forEach(list => {
        const fields = formFields.filter(f => f.listId === list.id).sort((a,b) => a.order - b.order);
        if (fields.length > 0) {
            listFirstFieldMap[list.id] = fields[0].id; // ئایدی یەکەم خانە (کە ناوە) هەڵدەگرین
        }
    });

    for (const list of allLists) {
        const q = query(
            collection(db, "lists", list.id, "beneficiaries"),
            where("status", "==", "suspended")
        );

        const snap = await getDocs(q);
        snap.forEach(docSnap => {
            foundAny = true;
            const d = docSnap.data();
            
            // --- چارەسەری کۆتایی بۆ ناو ---
            let displayName = "بێ ناو";
            const firstFieldId = listFirstFieldMap[list.id]; // ئایدی یەکەم خانەی ئەم لیستە دەهێنین

            // ١. ئەگەر ئایدییەکە هەبوو، و لەناو dynamic داتاکەی هەبوو -> ئەوە ناوەکەیە
            if (firstFieldId && d.dynamic && d.dynamic[firstFieldId]) {
                displayName = d.dynamic[firstFieldId];
            } 
            // ٢. ئەگەر نەبوو، سەیری d.name دەکەین (بۆ کۆنەکان)
            else if (d.name && d.name !== '-' && d.name !== 'No Name') {
                displayName = d.name;
            }
            // -----------------------------

            const suspendReason = d.suspendReason || '-';
            const date = d.suspendDate ? new Date(d.suspendDate.seconds * 1000).toLocaleDateString('ku-IQ') : '-';

            html += `
                <tr>
                    <td class="fw-bold">${displayName}</td>
                    <td><span class="badge bg-warning text-dark">${list.name}</span></td>
                    <td>${suspendReason}</td>
                    <td>${date}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" title="گەڕاندنەوە بۆ چالاک" onclick="window.restoreToActive('${list.id}', '${docSnap.id}')">
                            <i class="fas fa-undo"></i> گەڕاندنەوە
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    if (!foundAny) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">هیچ ناوێکی ڕاگیراو نییە</td></tr>';
    } else {
        tbody.innerHTML = html;
    }
}

// ٢. هێنانەوەی لیستی کاتی (Temporary) - ڕاستکراوە
export async function loadTemporaryData() {
    const tbody = document.getElementById("temporaryTableBody");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> چاوەڕێبە...</td></tr>';
    let html = "";
    let foundAny = false;

    // هەمان لۆجیک: دۆزینەوەی ئایدی یەکەم خانەی هەر لیستێک
    const listFirstFieldMap = {};
    allLists.forEach(list => {
        const fields = formFields.filter(f => f.listId === list.id).sort((a,b) => a.order - b.order);
        if (fields.length > 0) {
            listFirstFieldMap[list.id] = fields[0].id;
        }
    });

    for (const list of allLists) {
        const q = query(
            collection(db, "lists", list.id, "beneficiaries"),
            where("status", "==", "temporary")
        );

        const snap = await getDocs(q);
        snap.forEach(docSnap => {
            foundAny = true;
            const d = docSnap.data();

            // --- چارەسەری کۆتایی بۆ ناو ---
            let displayName = "بێ ناو";
            const firstFieldId = listFirstFieldMap[list.id];

            // ١. دۆزینەوەی ناو بەپێی ئایدی یەکەم خانە
            if (firstFieldId && d.dynamic && d.dynamic[firstFieldId]) {
                displayName = d.dynamic[firstFieldId];
            } 
            // ٢. گەڕانەوە بۆ ناوی کۆن ئەگەر ئەوەی سەرەوە نەبوو
            else if (d.name && d.name !== '-' && d.name !== 'No Name') {
                displayName = d.name;
            }
            // -----------------------------

            const date = d.tempDate ? new Date(d.tempDate.seconds * 1000).toLocaleDateString('ku-IQ') : '-';

            html += `
                <tr>
                    <td class="fw-bold">${displayName}</td>
                    <td><span class="badge bg-info text-dark">${list.name}</span></td>
                    <td>${date}</td>
                    <td>
                         <button class="btn btn-sm btn-primary" title="گەڕاندنەوە بۆ چالاک" onclick="window.restoreToActive('${list.id}', '${docSnap.id}')">
                            <i class="fas fa-undo"></i> گەڕاندنەوە
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    if (!foundAny) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">هیچ ناوێک لە لیستی کاتی نییە</td></tr>';
    } else {
        tbody.innerHTML = html;
    }
}
// ٣. فەنکشنی گەڕاندنەوە بۆ Active
export async function restoreToActive(listId, id) {
    const result = await Swal.fire({
        title: 'گەڕاندنەوە',
        text: "ئەم ناوە دەگەڕێتەوە بۆ لیستی سەرەکی (Active)؟",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'بەڵێ',
        cancelButtonText: 'نەخێر'
    });

    if(result.isConfirmed) {
        await updateDoc(doc(db, "lists", listId, "beneficiaries", id), {
            status: 'active',
            suspendReason: null,
            tempDate: null
        });
        Swal.fire('گەڕێندرایەوە', 'ناوەکە گەڕایەوە شوێنی خۆی.', 'success');
        
        // نوێکردنەوەی خشتەکان
        loadSuspendedData();
        loadTemporaryData();
    }
}

// --- گواستنەوە بۆ لیستیتر (Move completely to another list) ---
export async function moveToList(id, dataStr) {
    const data = JSON.parse(decodeURIComponent(dataStr));
    
    // دروستکردنی لیستی هەڵبژاردنەکان (بەبێ لیستی ئێستا)
    const availableLists = {};
    allLists.forEach(list => {
        if (list.id !== window.currentListId) {
            availableLists[list.id] = list.name;
        }
    });

    if (Object.keys(availableLists).length === 0) {
        return Swal.fire('زانیاری', 'هیچ لیستێکی تر بوونی نییە بۆ گواستنەوە.', 'info');
    }

    const { value: targetListId } = await Swal.fire({
        title: 'گواستنەوە بۆ کام لیست؟',
        input: 'select',
        inputOptions: availableLists,
        inputPlaceholder: 'لیستێک هەڵبژێرە...',
        showCancelButton: true,
        confirmButtonText: 'گواستنەوە',
        cancelButtonText: 'پاشگەزبوونەوە',
        inputValidator: (value) => {
            if (!value) return 'تکایە سەرەتا لیستێک دیاری بکە!';
        }
    });

    if (targetListId) {
        Swal.fire({ title: 'گواستنەوە...', didOpen: () => Swal.showLoading() });
        try {
            const oldFields = formFields.filter(f => f.listId === window.currentListId);
            const newFields = formFields.filter(f => f.listId === targetListId);

            // نەخشەی خانە کۆنەکان (بۆ زانینی جۆر و ناوی خانەکە)
            const oldFieldMap = {};
            oldFields.forEach(f => { oldFieldMap[f.id] = f; });

            // نەخشەی خانە نوێیەکان بەپێی ناو (Label)
            const newFieldMap = {};
            newFields.forEach(f => { newFieldMap[f.label.trim()] = f.id; });

            const newDynamicData = {};
            if (data.dynamic) {
                for (const [oldId, value] of Object.entries(data.dynamic)) {
                    const oldField = oldFieldMap[oldId];
                    
                    // ئەگەر خانەکە لە لیستی کۆن هەبوو وە زانیاری تێدابوو
                    if (oldField && value && value !== '-' && value !== '') { 
                        const label = oldField.label.trim();
                        
                        if (newFieldMap[label]) {
                            // ئەگەر لە لیستی نوێ هەبوو، تێی بکە
                            newDynamicData[newFieldMap[label]] = value;
                        } else {
                            // +++ چارەسەرەکە: ئەگەر لە لیستی نوێ نەبوو، خانەکە دروست بکە +++
                            const newFieldRef = await addDoc(collection(db, "listFields"), {
                                listId: targetListId,
                                type: oldField.type || 'text',
                                label: label,
                                showInTable: false, // بە فۆڵس دایدەنێین بۆ ئەوەی خشتەی لیستە نوێیەکە تێکنەدات تا خۆت لە ڕێکخستنەکان چالاکی نەکەیت
                                showInPrint: oldField.showInPrint || false,
                                order: Date.now(),
                                isSystem: false
                            });
                            newFieldMap[label] = newFieldRef.id; // زیادکردنی بۆ نەخشەکە
                            newDynamicData[newFieldRef.id] = value; // خەزنکردنی زانیارییەکە
                        }
                    }
                }
            }

            const maxIdx = await getMaxOrderIndex(targetListId);
            const batch = writeBatch(db);
            
            const oldDocRef = doc(db, "lists", window.currentListId, "beneficiaries", id);
            const newDocRef = doc(db, "lists", targetListId, "beneficiaries", id);
            
            const newData = { ...data };
            newData.listId = targetListId;
            newData.orderIndex = maxIdx + 1;
            newData.dynamic = newDynamicData; 
            
            batch.set(newDocRef, newData);
            batch.delete(oldDocRef);
            
            await batch.commit();
            Swal.fire('سەرکەوتوو', 'ناوەکە گواسترایەوە و زانیارییە ونبووەکانیش دروستکرانەوە.', 'success');
        } catch (error) {
            console.error(error);
            Swal.fire('هەڵە', 'کێشەیەک ڕوویدا لە گواستنەوەدا.', 'error');
        }
    }
}

// --- ATTACH TO WINDOW ---
window.openPhoneMenu = openPhoneMenu; 
window.editEntry = editEntry;
window.suspendEntry = suspendEntry;
window.moveToTemporary = moveToTemporary;
window.deleteEntry = deleteEntry;
window.viewDetails = viewDetails;
window.resetAllCallStatuses = resetAllCallStatuses;
window.saveCurrentListToArchive = saveCurrentListToArchive;
window.openBulkWhatsAppSender = openBulkWhatsAppSender;
window.markAsSent = markAsSent;
// فەنکشنە نوێیەکانیش زیاد کران بۆ window
window.toggleCallBlock = toggleCallBlock;
window.showBlockAlert = window.showBlockAlert;
window.restoreEntry = restoreEntry;
window.permanentDelete = permanentDelete;
window.loadRecycleBinData = loadRecycleBinData;
// لە کۆتایی js/beneficiary-service.js
window.loadSuspendedData = loadSuspendedData;
window.loadTemporaryData = loadTemporaryData;
window.restoreToActive = restoreToActive;
window.moveToList = moveToList;