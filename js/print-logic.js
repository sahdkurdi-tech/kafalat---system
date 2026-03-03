/* js/print-logic.js */

import { db } from "./firebase-config.js";
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// فەنکشنی دیاریکردنی ڕەنگی نووسین
function getContrastColor(hexColor) {
    if (!hexColor) return '#000000';
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

// ============================================================
// فەنکشنی زیرەک بۆ ناسینەوەی بەروار (Excel + Text + Timestamp)
// ============================================================
function parseAnyDate(input) {
    if (!input || input === '-' || input == 0) return null;

    // ١. ئەگەر Excel Serial Number بێت (وەک 46113)
    // ئەو ژمارانە بەزۆری لە نێوان 30000 بۆ 60000 دەبن بۆ ساڵەکانی ئێستا
    if (!isNaN(input) && input > 20000 && input < 80000) {
        // بەرواری بنچینەیی ئێکسڵ 30/12/1899 یە
        const excelBaseDate = new Date(1899, 11, 30); 
        const dateObj = new Date(excelBaseDate.getTime() + input * 24 * 60 * 60 * 1000);
        return dateObj;
    }

    // ٢. ئەگەر Firebase Timestamp بێت
    if (typeof input === 'object' && input.seconds) {
        return new Date(input.seconds * 1000);
    }

    // ٣. ئەگەر دەق بێت (String)
    if (typeof input === 'string') {
        const cleanInput = input.trim();
        
        // ئەگەر تەنها ژمارە بێت بەڵام وەک دەق نوسرابێت "46113"
        if (!isNaN(cleanInput) && cleanInput > 20000 && cleanInput < 80000) {
            const num = parseInt(cleanInput);
            const excelBaseDate = new Date(1899, 11, 30); 
            return new Date(excelBaseDate.getTime() + num * 24 * 60 * 60 * 1000);
        }

        // فۆرماتی 25/5/2026
        if (cleanInput.includes('/')) {
            const parts = cleanInput.split('/');
            if (parts.length === 3) {
                // ڕۆژ/مانگ/ساڵ
                let d = parseInt(parts[0]);
                let m = parseInt(parts[1]) - 1; 
                let y = parseInt(parts[2]);
                if (y < 100) y += 2000; 
                return new Date(y, m, d);
            }
        }
        
        // فۆرماتی 2026-05-25
        if (cleanInput.includes('-')) {
            return new Date(cleanInput);
        }
    }

    // ٤. هەوڵی گشتی
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d;

    return null;
}

async function init() {
    const params = new URLSearchParams(window.location.search);
    const listId = params.get('listId');
    if (!document.getElementById('printTableBody')) return;
    
    let type = params.get('type');
    if (type === 'table') {
        type = 'list';
    }

    const monthText = params.get('month') || '';
    const customDateText = params.get('dateText') || '';

    const container = document.getElementById('printContainer');
    if (!listId) {
        container.innerHTML = "هەڵە: لیست دیاری نەکراوە.";
        return;
    }

    try {
        const listSnap = await getDoc(doc(db, "lists", listId));
        if (!listSnap.exists()) {
            container.innerHTML = "لیست نەدۆزرایەوە.";
            return;
        }
        const listData = listSnap.data();
        const listColor = listData.color || '#333';
        const textColor = getContrastColor(listColor);

        let listFields = [];
        const fieldsQuery = query(collection(db, "listFields"), where("listId", "==", listId));
        const fieldsSnap = await getDocs(fieldsQuery);
        fieldsSnap.forEach((f) => {
            listFields.push({ id: f.id, ...f.data() });
        });
        listFields.sort((a, b) => (a.order || 0) - (b.order || 0));

        const nameField = listFields.find(f => f.type === 'sys_name' || f.label.includes('ناو') || f.label.includes('Name'));
        const amountField = listFields.find(f => f.type === 'sys_amount' || f.label.includes('پارە') || f.label.includes('Amount') || f.type === 'number');

        let benSnap;
        try {
            const benQuery = query(collection(db, "lists", listId, "beneficiaries"), orderBy("orderIndex", "asc"));
            benSnap = await getDocs(benQuery);
        } catch (e) {
            const benQuery = query(collection(db, "lists", listId, "beneficiaries"));
            benSnap = await getDocs(benQuery);
        }

        let beneficiaries = [];
        benSnap.forEach(d => beneficiaries.push(d.data()));
        beneficiaries.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        // ==========================================
        // Print Type: List (Table)
        // ==========================================
        if (type === 'list') {
            const style = document.createElement('style');
            style.innerHTML = `
                @page { size: A4; margin: 10mm; }
                body { 
                    font-family: 'Noto Naskh Arabic', sans-serif; 
                    -webkit-print-color-adjust: exact !important; 
                    print-color-adjust: exact !important; 
                }
                
                table { border-collapse: collapse; width: 100%; font-size: 12px; }
                
                td, th { 
                    border: 1px solid #000; 
                    padding: 6px; 
                    text-align: center;
                    -webkit-print-color-adjust: exact !important; 
                    print-color-adjust: exact !important;
                }

                /* ستایلی ڕەنگەکان */
                .expired-cell {
                    background-color: #ffcdd2 !important; /* سووری کاڵ */
                    color: #b71c1c !important; /* نووسینی سوور */
                    font-weight: bold;
                    border: 2px solid #b71c1c !important; /* چوارچێوەی سوور بۆ دڵنیایی */
                }
                .warning-cell {
                    background-color: #ffe0b2 !important; /* پرتەقاڵی کاڵ */
                    color: #e65100 !important; /* نووسینی پرتەقاڵی */
                    font-weight: bold;
                }
            `;
            document.head.appendChild(style);

            document.title = customDateText || `لیستی ${listData.name}`;
            const thStyle = `style="background-color: ${listColor} !important; color: ${textColor} !important; border-color: #000;"`;
            
            let html = `
            <div class="print-header">
                <img src="logo.png" class="print-logo" alt="Logo" onerror="this.style.display='none'">
                <h1>${customDateText}</h1>
            </div>
            <table class="print-table">
                <thead>
                    <tr>
                         <th ${thStyle} style="width: 40px;">#</th>
            `;
            listFields.forEach(f => {
                if (f.showInPrint !== false) {
                    html += `<th ${thStyle}>${f.label}</th>`;
                }
            });
            html += `<th ${thStyle} style="width: 120px;">واژوو / تێبینی</th></tr></thead><tbody>`;
            let counter = 1;
            
            const today = new Date();
            today.setHours(0,0,0,0);

            beneficiaries.forEach(data => {
                const rowIndex = data.orderIndex || counter++;
                html += `<tr><td>${rowIndex}</td>`;

                listFields.forEach(f => {
                    if (f.showInPrint === false) return;
                    let val = '-';
                    
                    if (f.isSystem && f.type === 'sys_name') {
                        let n = data.name;
                        if (!n && data.dynamic && data.dynamic[f.id]) n = data.dynamic[f.id];
                        val = `<strong>${n || ''}</strong>`;
                    } else if (f.isSystem && f.type === 'sys_amount') {
                        let amt = data.amount;
                        if (!amt && data.dynamic && data.dynamic[f.id]) amt = data.dynamic[f.id];
                        const amount = parseFloat(amt) || 0;
                        val = amount.toLocaleString();
                    } else {
                        let dynamicVal = '';
                        if (data.dynamicData && data.dynamicData[f.id]) dynamicVal = data.dynamicData[f.id];
                        else if (data.dynamic && data.dynamic[f.id]) dynamicVal = data.dynamic[f.id];
                        val = dynamicVal || '';
                    }

                    // ===================================================
                    // بەشی چارەسەر: Excel Fix + Color
                    // ===================================================
                    let cellClass = '';
                    
                    // پشکنین بۆ هەموو ئەو خانانەی ناوی "تاکو" یان "بەروار"یان تێدایە
                    const isDateColumn = f.type === 'date' || 
                                         f.label.includes('تاکو') || 
                                         f.label.includes('بەروار') ||
                                         f.label.includes('Date') ||
                                         f.label.includes('کۆتایی');

                    if (isDateColumn && val && val !== '-') {
                        // ١. گۆڕینی ژمارەی ئێکسڵ (46113) بۆ بەرواری ڕاست
                        const dateObj = parseAnyDate(val);

                        if (dateObj) {
                            // ٢. حیسابی ڕۆژەکان
                            const diffTime = dateObj - today;
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                            // ٣. دیاریکردنی ڕەنگ (بەسەرچوو یان نزیک)
                            if (diffDays < 0) {
                                cellClass = 'expired-cell'; 
                            } else if (diffDays <= 30) {
                                cellClass = 'warning-cell';
                            }

                            // ٤. نوسینەوەی بەروارەکە بە جوانی (ڕۆژ/مانگ/ساڵ)
                            const d = String(dateObj.getDate()).padStart(2, '0');
                            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                            const y = dateObj.getFullYear();
                            val = `${d}/${m}/${y}`;
                        }
                    }

                    html += `<td class="${cellClass}">${val}</td>`;
                });
                html += `<td></td></tr>`; 
            });

            html += `</tbody></table>`;
            container.innerHTML = html;
        }
        
        // ==========================================
        // Print Type: Envelope
        // ==========================================
        else if (type === 'envelope') {
            const style = document.createElement('style');
            style.innerHTML = `
                @import url('https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap');

                @page { size: 220mm 110mm; margin: 0; }
                body {
                    margin: 0; padding: 0;
                    background-color: #fff;
                    font-family: 'Noto Naskh Arabic', sans-serif;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .envelope-page {
                    width: 220mm; height: 110mm;
                    padding: 5mm; box-sizing: border-box;
                    display: flex; justify-content: center; align-items: center;
                    page-break-after: always; 
                }
                .clean-envelope {
                    width: 100%; height: 100%;
                    border: 4px solid ${listColor};
                    border-radius: 15px; padding: 10px 20px;
                    box-sizing: border-box; display: flex; flex-direction: column;
                    justify-content: space-between; position: relative;
                }
                .env-header {
                    display: flex; justify-content: space-between;
                    border-bottom: 1px dashed #eee; padding-bottom: 5px;
                    font-size: 14px; color: #555; font-weight: bold;
                }
                .env-body {
                    flex-grow: 1; display: flex; flex-direction: column;
                    justify-content: center; align-items: center; text-align: center;
                    gap: 10px;
                }
                .index-circle {
                    width: 40px; height: 40px; background-color: #000; color: #fff;
                    border-radius: 50%; display: flex; justify-content: center;
                    align-items: center; font-size: 18px; font-weight: bold; margin-bottom: 5px; 
                }
                .name-box {
                    background-color: ${listColor}; border-radius: 12px;
                    padding: 10px 30px; display: inline-block; max-width: 95%; 
                    box-shadow: 2px 2px 4px rgba(0,0,0,0.1);
                    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; 
                }
                .person-name {
                    font-size: 32px; font-weight: 800; color: ${textColor}; 
                    line-height: 1.2; white-space: nowrap;
                }
                .amount-text {
                    font-size: 30px; font-weight: 900; color: #000; margin-top: 5px;
                }
            `;
            document.head.appendChild(style);

// لەناو js/print-logic.js، لە بەشی type === 'envelope'

            let html = ``;
            let counter = 1;

            for (let i = 0; i < beneficiaries.length; i++) {
                const data = beneficiaries[i];

                // === ئەم مەرجە نوێیەی لێرە زیاد بکە ===
                // ئەگەر printEnvelope هەبوو و false بوو، ئەم ناوە تێپەڕێنە (Continue)
                if (data.printEnvelope === false) {
                    continue;
                }
                // ======================================

                const orderNum = data.orderIndex || counter++;
                
                let name = data.name || '';
                if (!name && nameField && data.dynamic && data.dynamic[nameField.id]) {
                    name = data.dynamic[nameField.id];
                }

                let amountVal = data.amount;
                if (!amountVal && amountField && data.dynamic && data.dynamic[amountField.id]) {
                    amountVal = data.dynamic[amountField.id];
                }
                const amount = (parseFloat(amountVal) || 0).toLocaleString();
                
                html += `
                <div class="envelope-page">
                    <div class="clean-envelope">
                        <div class="env-header">
                            <span>${listData.name}</span>
                            <span>${monthText}</span>
                        </div>
                        <div class="env-body">
                            <div class="index-circle">${orderNum}</div>
                            <div class="name-box">
                                <div class="person-name">${name}</div>
                            </div>
                            <div class="amount-text">${amount}</div>
                        </div>
                    </div>
                </div>`;
            }
            container.innerHTML = html;
                }

        setTimeout(() => {
            window.print();
        }, 1000);

    } catch (error) {
        console.error(error);
        container.innerHTML = `<div style="color:red; text-align:center;">Error: ${error.message}</div>`;
    }
}

init();