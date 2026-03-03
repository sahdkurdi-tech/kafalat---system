/* js/backup.js */
import { db } from "./firebase-config.js";
import { collection, getDocs, writeBatch, doc, setDoc, getDoc, deleteDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// تێبینی: beneficiaries لێرە لابراوە چونکە بووە بە sub-collection
const ROOT_COLLECTIONS = ['lists', 'listFields', 'archives'];

// ===========================
// 1. Menu Logic
// ===========================
window.chooseBackupMethod = async function() {
    const { value: method } = await Swal.fire({
        title: 'هەڵبژاردنی جۆر',
        text: 'دەتەوێت داتاکان چۆن خەزن بکەیت؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'هەوری (Cloud)',
        confirmButtonColor: '#4e73df',
        cancelButtonText: 'فایل (JSON)',
        cancelButtonColor: '#1cc88a',
        showCloseButton: true
    });
    if (method === true) {
        performCloudBackup();
    } else if (method.dismiss === Swal.DismissReason.cancel) { 
        performLocalBackup();
    }
};

window.openBackupMenu = async function() {
    const result = await Swal.fire({
        title: 'باکۆپ (Backup)',
        html: `
            <div class="d-grid gap-2">
                <button id="btn-cloud" class="btn btn-primary btn-lg"><i class="fas fa-cloud-upload-alt"></i> هەڵگرتن لە کڵاود</button>
                <button id="btn-local" class="btn btn-success btn-lg"><i class="fas fa-file-download"></i> دابەزاندنی فایل</button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true
    });
};

document.addEventListener('click', function(e) {
    if(e.target && e.target.id == 'btn-cloud') {
        Swal.close();
        performCloudBackup();
    }
    if(e.target && e.target.id == 'btn-local') {
        Swal.close();
        performLocalBackup();
    }
});

// ===========================
// 2. Local Backup (JSON File)
// ===========================
async function performLocalBackup() {
    try {
        Swal.fire({title: 'جارێک ڕاوەستە...', didOpen: () => Swal.showLoading()});
        const data = await gatherAllData(); // فەنکشنی نوێ
        
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Charity_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        Swal.fire('', 'باکۆپ دابەزێنرا.', 'success');
    } catch (error) {
        console.error(error);
        Swal.fire('', error.message, 'error');
    }
}

// ===========================
// 3. Cloud Backup (Overwrite Mode)
// ===========================
async function performCloudBackup() {
    try {
        Swal.fire({title: 'خەزنکردن...', text: 'تکایە دایمەخە', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        const data = await gatherAllData(); // فەنکشنی نوێ
        
        const backupId = "latest_backup"; 
        const dateStr = new Date().toLocaleString('ku-IQ');

        await setDoc(doc(db, "system_backups", backupId), {
            createdAt: new Date(),
            label: dateStr + " (تەواو)", 
            content: JSON.stringify(data)
        });
        Swal.fire('', 'باکۆپ سەرکەوتوو بوو.', 'success');

    } catch (error) {
        console.error(error);
        Swal.fire('', 'هەڵە: ' + error.message, 'error');
    }
}

// *** فەنکشنی نوێ بۆ کۆکردنەوەی داتا (Sub-collections) ***
async function gatherAllData() {
    const backupData = {};
    
    // ١. هێنانی کۆلێکشنە سەرەکییەکان (Lists, Fields, Archives)
    for (const colName of ROOT_COLLECTIONS) {
        const snap = await getDocs(collection(db, colName));
        backupData[colName] = [];
        snap.forEach(doc => backupData[colName].push({ id: doc.id, data: doc.data() }));
    }

    // ٢. هێنانی سودمەندان (لەناو هەر لیستێکدا)
    backupData['beneficiaries'] = [];
    if (backupData['lists']) {
        for (const list of backupData['lists']) {
            const listId = list.id;
            // چوونە ناو Sub-collection
            const subSnap = await getDocs(collection(db, "lists", listId, "beneficiaries"));
            subSnap.forEach(doc => {
                backupData['beneficiaries'].push({
                    id: doc.id,
                    listId: listId, // گرنگە بۆ گەڕاندنەوە
                    data: doc.data()
                });
            });
        }
    }

    backupData.meta = { date: new Date().toISOString(), version: "2.0" };
    return backupData;
}


// ===========================
// 4. Restore Menu
// ===========================
window.openRestoreMenu = async function() {
    const result = await Swal.fire({
        title: 'گەڕاندنەوە (Restore)',
        html: `
            <div class="d-grid gap-2">
                <button id="btn-restore-cloud" class="btn btn-outline-primary btn-lg"><i class="fas fa-cloud-download-alt"></i> لە کڵاودەوە</button>
                <button id="btn-restore-local" class="btn btn-outline-success btn-lg"><i class="fas fa-file-upload"></i> لە فایلەوە (JSON)</button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true
    });
};

document.addEventListener('click', function(e) {
    if(e.target && e.target.id == 'btn-restore-local') {
        Swal.close();
        document.getElementById('backupFileInput').click();
    }
    if(e.target && e.target.id == 'btn-restore-cloud') {
        Swal.close();
        showCloudBackupsList();
    }
});

window.handleFileSelect = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        const jsonData = JSON.parse(e.target.result);
        processRestore(jsonData);
    };
    reader.readAsText(file);
};

// Show Cloud Backups
async function showCloudBackupsList() {
    Swal.fire({title: '...', didOpen: () => Swal.showLoading()});
    try {
        const q = query(collection(db, "system_backups"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        
        if(snap.empty) {
            Swal.fire('', 'هیچ باکۆپێک نەدۆزرایەوە.', 'info');
            return;
        }

        let html = '<div class="list-group text-end">';
        snap.forEach(doc => {
            const d = doc.data();
            const date = d.createdAt ? new Date(d.createdAt.seconds*1000).toLocaleString('ku-IQ') : 'Unknown';
            html += `<button class="list-group-item list-group-item-action" onclick="restoreFromCloud('${doc.id}')">
                <div class="d-flex w-100 justify-content-between">
                     <h6 class="mb-1"><i class="fas fa-history"></i> ${d.label || date}</h6>
                    <small>${date}</small>
                </div>
            </button>`;
        });
        html += '</div>';

        Swal.fire({
            title: 'باکۆپەکان',
            html: html,
            showCloseButton: true,
            showConfirmButton: false
        });
    } catch (error) {
        Swal.fire('', error.message, 'error');
    }
}

window.restoreFromCloud = async function(docId) {
    try {
        Swal.fire({title: '...', didOpen: () => Swal.showLoading()});
        const docSnap = await getDoc(doc(db, "system_backups", docId));
        if(!docSnap.exists()) throw new Error("باکۆپ نەماوە");
        
        const data = docSnap.data();
        const jsonData = JSON.parse(data.content);
        processRestore(jsonData);
    } catch (error) {
        Swal.fire('', error.message, 'error');
    }
};

// *** فەنکشنی نوێ بۆ گەڕاندنەوە (Sub-collections) ***
async function processRestore(jsonData) {
    const confirm = await Swal.fire({
        title: 'دڵنیای؟',
        text: "هەموو داتاکانی ئێستا دەسڕێنەوە و ئەمانە جێگای دەگرنەوە!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'بەڵێ، بیگێڕەوە',
        confirmButtonColor: '#d33',
        cancelButtonText: 'نەخێر'
    });
    if (!confirm.isConfirmed) return;

    Swal.fire({title: 'دەستپێکردن...', didOpen: () => Swal.showLoading()});
    
    let batch = writeBatch(db);
    let count = 0;
    const batchLimit = 400; // Firestore batch limit is 500

    // 1. Restore Root Collections
    for (const colName of ROOT_COLLECTIONS) {
        if (jsonData[colName]) {
            for (const item of jsonData[colName]) {
                batch.set(doc(db, colName, item.id), item.data);
                count++;
                if (count >= batchLimit) { await batch.commit(); batch = writeBatch(db); count = 0; }
            }
        }
    }

    // 2. Restore Beneficiaries (To Sub-collections)
    if (jsonData['beneficiaries']) {
        for (const item of jsonData['beneficiaries']) {
            const listId = item.listId || item.data.listId; 
            if (listId) {
                // نووسینەوە بۆ ناو sub-collection
                const ref = doc(db, "lists", listId, "beneficiaries", item.id);
                batch.set(ref, item.data);
                count++;
                if (count >= batchLimit) { await batch.commit(); batch = writeBatch(db); count = 0; }
            }
        }
    }

    if (count > 0) await batch.commit();
    Swal.fire('', 'داتاکان گەڕێندرانەوە.', 'success').then(() => location.reload());
}