/* js/excel-service.js */

import { db } from "./firebase-config.js";
import { collection, addDoc, doc, writeBatch, query, where, getDocs, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getMaxOrderIndex } from "./beneficiary-service.js";
import { formFields } from "./settings.js";

export async function importExcel() {
    if(!window.currentListId) return Swal.fire('', 'سەرەتا لیستێک بکەرەوە', 'error');
    
    const { value: file } = await Swal.fire({
        title: 'فایلی ئێکسڵ هەڵبژێرە',
        text: 'دواتر دەتوانیت دیاری بکەیت کام ستوونانە دەربکەون.',
        input: 'file',
        inputAttributes: { 'accept': '.xlsx, .xls' },
        showCancelButton: true,
        confirmButtonText: 'بەردەوام بوون'
    });

    if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const excelData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
                
                if(excelData.length === 0) return Swal.fire('', 'فایلەکە بەتاڵە', 'error');
                
                // ١. وەرگرتنی سەردێڕەکان
                const headers = Object.keys(excelData[0]);

                // ٢. دروستکردنی مینیو (Menu) بۆ هەڵبژاردنی ستوونەکان
                let html = `
                    <div class="text-end alert alert-info small">تکایە دیاری بکە کام ستوونانە دەهێنیت و لە کوێ دەربکەون:</div>
                    <div style="max-height: 300px; overflow-y: auto; text-align: right;" class="border rounded p-2">
                `;

                headers.forEach((h, index) => {
                    html += `
                        <div class="d-flex justify-content-between align-items-center border-bottom py-2 field-config-row" data-header="${h}">
                            <div class="fw-bold text-dark text-truncate ps-2" style="max-width: 40%;" title="${h}">
                                ${index + 1}. ${h}
                            </div>
                            <div class="d-flex gap-3">
                                <div class="form-check form-switch" title="بەهێنرێت بۆ ناو سیستەم؟">
                                    <input class="form-check-input chk-import" type="checkbox" id="chk-imp-${index}" checked>
                                    <label class="form-check-label small">هێنان</label>
                                </div>
                                <div class="vr"></div>
                                <div class="form-check form-switch" title="لە خشتەی سەرەکی دەربکەوێت؟">
                                    <input class="form-check-input chk-table" type="checkbox" id="chk-tbl-${index}" checked>
                                    <label class="form-check-label small">خشتە</label>
                                </div>
                                <div class="form-check form-switch" title="لە کاتی چاپکردن دەربکەوێت؟">
                                    <input class="form-check-input chk-print" type="checkbox" id="chk-prt-${index}" checked>
                                    <label class="form-check-label small">چاپ</label>
                                </div>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;

                // ٣. پیشاندانی پۆپ-ئەپەکە بە بەکارهێنەر
                const { value: configResult } = await Swal.fire({
                    title: 'ڕێکخستنی ستوونەکان',
                    html: html,
                    width: '700px',
                    showCancelButton: true,
                    confirmButtonText: 'دەستپێکردنی هێنان',
                    cancelButtonText: 'پاشگەزبوونەوە',
                    preConfirm: () => {
                        const selection = [];
                        const rows = document.querySelectorAll('.field-config-row');
                        rows.forEach((row, idx) => {
                            const header = row.getAttribute('data-header');
                            const doImport = document.getElementById(`chk-imp-${idx}`).checked;
                            const showTable = document.getElementById(`chk-tbl-${idx}`).checked;
                            const showPrint = document.getElementById(`chk-prt-${idx}`).checked;
                            
                            if (doImport) {
                                selection.push({ header, showTable, showPrint });
                            }
                        });
                        if (selection.length === 0) {
                            Swal.showValidationMessage('تکایە لانی کەم یەک ستوون دیاری بکە بۆ هێنان');
                            return false;
                        }
                        return selection;
                    }
                });

                if (!configResult) return; // ئەگەر هەڵی وەشاندەوە

                // ٤. پرۆسێسکردن
                Swal.fire({
                    title: 'چاوەڕێ بە...',
                    text: 'دروستکردنی خانەکان و هێنانی داتا...',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });

                // هێنانی خانە کۆنەکان بۆ ئەوەی دووبارە نەبێتەوە
                const q = query(collection(db, "listFields"), where("listId", "==", window.currentListId));
                const snap = await getDocs(q);
                let existingFields = [];
                snap.forEach(d => existingFields.push({ id: d.id, ...d.data() }));

                const fieldMapping = {}; // Header -> Field ID

                // دروستکردن یان نوێکردنەوەی خانەکان (Fields)
                for (let i = 0; i < configResult.length; i++) {
                    const colConfig = configResult[i];
                    const headerName = colConfig.header.trim();
                    
                    // پشکنین ئەگەر پێشتر هەبێت
                    let existing = existingFields.find(f => f.label.trim().toLowerCase() === headerName.toLowerCase());

                    if (existing) {
                        // ئەگەر هەبوو، تەنها ئایدیەکەی وەردەگرین
                        await updateDoc(doc(db, "listFields", existing.id), {
                            showInTable: colConfig.showTable,
                            showInPrint: colConfig.showPrint
                        });
                        fieldMapping[headerName] = existing.id;
                    } else {
                        // ئەگەر نەبوو، دروستی دەکەین
                        const newFieldRef = await addDoc(collection(db, "listFields"), {
                            listId: window.currentListId,
                            type: 'text',
                            label: headerName,
                            showInTable: colConfig.showTable,
                            showInPrint: colConfig.showPrint,
                            order: Date.now() + i, // ڕیزبەندی بەپێی ئێکسڵ
                            isSystem: false
                        });
                        fieldMapping[headerName] = newFieldRef.id;
                    }
                }

                // ٥. هێنانی داتاکان (Rows)
                const currentMax = await getMaxOrderIndex(window.currentListId);
                const batchSize = 400;
                let globalIndex = 0;

                for (let i = 0; i < excelData.length; i += batchSize) {
                    const chunk = excelData.slice(i, i + batchSize);
                    const batch = writeBatch(db);
                    
                    chunk.forEach(row => {
                        const newDocRef = doc(collection(db, "lists", window.currentListId, "beneficiaries"));
                        const dynamicData = {};
                        
                        let nameForSearch = 'No Name';
                        let amountForDash = 0;

                        // تەنها ئەو ستوونانە دەهێنین کە بەکارهێنەر دیاری کردوون (configResult)
                        configResult.forEach(conf => {
                            const header = conf.header;
                            const fieldId = fieldMapping[header.trim()];
                            
                            if (fieldId) {
                                let val = row[header];
                                if (val === undefined || val === null) val = "";
                                dynamicData[fieldId] = String(val);

                                // هەوڵدان بۆ دۆزینەوەی "ناو" و "پارە" بۆ سیستەم (بۆ داشبۆرد و گەڕان)
                                if (header.includes("ناو") || header.includes("Name")) {
                                    nameForSearch = String(val);
                                }
                                if (header.includes("پارە") || header.includes("Amount") || header.includes("بڕ")) {
                                    amountForDash = Number(String(val).replace(/[^0-9.-]+/g,"")) || 0;
                                }
                            }
                        });

                        // ئەگەر ناوی نەدۆزیەوە، یەکەم ستوونی هەڵبژێردراو دەکاتە ناو
                        if (nameForSearch === 'No Name' && configResult.length > 0) {
                            const firstHeader = configResult[0].header;
                            if (row[firstHeader]) nameForSearch = String(row[firstHeader]);
                        }

                        // OrderIndex بەپێی ڕیزبەندی ئێکسڵ
                        batch.set(newDocRef, {
                            listId: window.currentListId, 
                            name: nameForSearch, 
                            amount: amountForDash, 
                            dynamic: dynamicData, 
                            status: 'active', 
                            orderIndex: currentMax + 1 + globalIndex, 
                            createdAt: new Date()
                        });
                        globalIndex++;
                    });
                    
                    await batch.commit();
                }

                Swal.fire('', `تەواو! (${globalIndex}) دێڕ بە سەرکەوتوویی هاتن.`, 'success')
                .then(() => location.reload());

            } catch (error) {
                console.error(error);
                Swal.fire('هەڵە', error.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

export async function exportExcel() {
    if(!window.currentListId) return Swal.fire('', 'سەرەتا لیستێک بکەرەوە', 'error');

    try {
        Swal.fire({title: 'ئامادەکردنی ئێکسڵ...', didOpen: () => Swal.showLoading()});

        const listRef = collection(db, "lists", window.currentListId, "beneficiaries");
        const q = query(listRef, orderBy("orderIndex", "asc"));
        const snap = await getDocs(q);

        if (snap.empty) {
            return Swal.fire('', 'هیچ ناوێک لەم لیستەدا نییە بۆ دابەزاندن', 'info');
        }

        // ١. کۆکردنەوەی هەموو داتاکان و دۆزینەوەی جۆری خانەکان (کلیلە داینامیکییەکان)
        const dynamicKeys = new Set();
        const docsData = [];
        
        snap.forEach(docSnap => {
            const data = docSnap.data();
            
            // +++ چارەسەری کۆتایی: تەنها ئەوانە دەهێنێت کە 'active' (چالاکن) +++
            // بەمەش ڕاگیراو، کاتی، و سڕاوەکان نایەنە ناو ئێکسڵەکەوە
            if (data.status !== 'active') return;
            
            docsData.push(data);
            
            // گەڕان بەناو زانیارییە زیادەکان و هەڵگرتنی ناوەکانیان
            if (data.dynamic) {
                Object.keys(data.dynamic).forEach(key => dynamicKeys.add(key));
            }
        });
        
        // ٢. دروستکردنی نەخشەیەک بۆ گۆڕینی ئایدی خانەکان بۆ ناوی تێگەیشتوو (وەک 'مۆبایل')
        const keyToLabel = {};
        formFields.forEach(f => {
            keyToLabel[f.id] = f.label || f.name || f.id;
        });

        const excelData = [];
        let index = 1;

        // ٣. ڕێکخستن و پڕکردنەوەی داتاکان بۆ ئێکسڵ
        docsData.forEach(data => {
            let rowData = {
                'زنجیرە': index++,
                'ناو': data.name || '-',
                'بڕی پارە': data.amount || 0,
                'دۆخ': data.status === 'active' ? 'چالاک' : 'ناچالاک',
                'ڕاگیراوە (Block)': data.isStopped ? 'بەڵێ' : 'نەخێر'
            };

            // پڕکردنەوەی خانە داینامیکییەکان بە دڵنیاییەوە
            dynamicKeys.forEach(key => {
                const label = keyToLabel[key] || key; // ئەگەر ناوی فەرمی نەبوو، با هەر ئایدییەکە دابنێت
                
                if (data.dynamic && data.dynamic[key] !== undefined && data.dynamic[key] !== "") {
                    rowData[label] = data.dynamic[key];
                } else {
                    rowData[label] = '-';
                }
            });

            excelData.push(rowData);
        });

        // ٤. دروستکردن و داگرتنی فایلی ئێکسڵەکە
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "لیستی ناوەکان");

        const fileName = `List_${window.currentListId}_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        Swal.fire('تەواو', 'فایلەکە بە سەرکەوتوویی دابەزی و هەموو خانەکان پڕکراونەتەوە', 'success');

    } catch (error) {
        console.error("Error exporting to Excel:", error);
        Swal.fire('هەڵە', 'نەتوانرا فایلەکە دابەزێندرێت: ' + error.message, 'error');
    }
}