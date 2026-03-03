/* js/main-logic.js */
import { db } from "./firebase-config.js";
import { collection, onSnapshot, query, where, doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { allLists } from "./settings.js"; 

// Import Services
import * as BeneficiaryService from "./beneficiary-service.js";
import * as ExcelService from "./excel-service.js";
import * as PrintService from "./print-service.js";

// Global State
window.currentListId = null;
let globalStats = {};
let dashboardListeners = []; // To store unsubscribe functions

// ==========================================
//  Mobile Menu Logic & Navigation
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (mobileBtn && sidebar && overlay) {
        mobileBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active'); 
            overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.style.display = 'none';
        });
    }
});

window.navTo = function(viewId) {
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.remove('active');
        el.classList.remove('text-white');
    });
    const targetSection = document.getElementById(viewId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        if(overlay) overlay.style.display = 'none';
    }
};

window.toggleMenu = (event, id) => {
    event.stopPropagation();
    document.querySelectorAll('.menu-dropdown').forEach(m => {
        if(m.id !== id) m.classList.remove('show');
    });
    const menu = document.getElementById(id);
    if(menu) menu.classList.toggle('show');
};

window.addEventListener('click', () => {
    document.querySelectorAll('.menu-dropdown').forEach(m => m.classList.remove('show'));
});

// ==========================================
//  DASHBOARD UPDATES (Refactored for Sub-collections)
// ==========================================
window.updateDashboardUI = function() {
    let grandTotal = 0;
    for (const [listId, data] of Object.entries(globalStats)) {
        const countEl = document.getElementById(`count-${listId}`);
        const totalEl = document.getElementById(`total-${listId}`);
        
        if (countEl) countEl.innerText = data.count;
        if (totalEl) totalEl.innerText = data.total.toLocaleString();
        
        grandTotal += data.total;
    }
    const gt = document.getElementById("grandTotalDisplay");
    if(gt) gt.innerText = grandTotal.toLocaleString();
};

// This function is called whenever `allLists` changes in settings.js
window.refreshDashboardListeners = function() {
    // Clear old listeners
    dashboardListeners.forEach(unsub => unsub());
    dashboardListeners = [];
    globalStats = {};

    allLists.forEach(list => {
        // Initialize
        globalStats[list.id] = { count: 0, total: 0 };
        
        // Setup listener for EACH list's sub-collection
        const q = query(
            collection(db, "lists", list.id, "beneficiaries"), 
            where("status", "==", "active")
        );
        
        const unsub = onSnapshot(q, (snap) => {
            let count = 0;
            let total = 0;
            snap.forEach(doc => {
                const d = doc.data();
                count++;
                total += (d.amount || 0);
            });
            globalStats[list.id] = { count, total };
            window.updateDashboardUI();
        });

        dashboardListeners.push(unsub);
    });
    window.updateDashboardUI();
};


const dashboardObserver = new MutationObserver(() => {
    window.updateDashboardUI();
});

const dashboardContainer = document.getElementById("dashboardCards");
if (dashboardContainer) {
    dashboardObserver.observe(dashboardContainer, { childList: true });
}

// ==========================================
//  CALL BLOCKING & STATUS LOGIC (NEW)
// ==========================================

// ١. فەنکشنی تەلەفۆن کردن (ئەگەر ڕاگیرابوو ئاگادارت دەکاتەوە)
window.attemptCall = function(phoneNumber, isStopped, name) {
    if (isStopped) {
        Swal.fire({
            icon: 'error',
            title: 'ڕاگیراوە!',
            text: `تکایە پەیوەندی بە (${name})ـەوە مەکە! چونکە لەلایەن ئەدمینەوە ڕاگیراوە.`,
            confirmButtonText: 'باشە',
            confirmButtonColor: '#d33'
        });
    } else {
        // ئەگەر ئاسایی بوو، تەلەفۆنەکە بکە
        window.location.href = `tel:${phoneNumber}`;
    }
};

// ٢. فەنکشنی گۆڕینی دۆخی (ڕاگرتن/چالاککردن) لە داتابەیس
window.toggleBeneficiaryStatus = async function(listId, benId, currentStatus) {
    try {
        const benRef = doc(db, "lists", listId, "beneficiaries", benId);
        await updateDoc(benRef, {
            isStopped: !currentStatus // پێچەوانەکردنەوەی دۆخەکە
        });
        
        const msg = !currentStatus ? 'ناو ڕاگیرا (Block)' : 'ناو چالاک کرایەوە';
        Swal.fire({
            icon: 'success',
            title: msg,
            timer: 1000,
            showConfirmButton: false
        });

    } catch (error) {
        console.error("Error toggling status:", error);
        Swal.fire('هەڵە', 'نەتوانرا دۆخەکە بگۆڕدرێت', 'error');
    }
};

// ==========================================
//  EXPOSE FUNCTIONS TO WINDOW
// ==========================================
window.openList = BeneficiaryService.openList;
window.openEntryModal = BeneficiaryService.openEntryModal;
window.viewDetails = BeneficiaryService.viewDetails;
window.editEntry = BeneficiaryService.editEntry;
window.suspendEntry = BeneficiaryService.suspendEntry;
window.moveToTemporary = BeneficiaryService.moveToTemporary;
window.deleteEntry = BeneficiaryService.deleteEntry;
window.openPhoneMenu = BeneficiaryService.openPhoneMenu;
window.resetAllCallStatuses = BeneficiaryService.resetAllCallStatuses;
window.saveCurrentListToArchive = BeneficiaryService.saveCurrentListToArchive;
window.filterTable = BeneficiaryService.filterTable;
window.moveToList = BeneficiaryService.moveToList;
window.importExcel = ExcelService.importExcel;
window.printData = PrintService.printData;
window.exportExcel = ExcelService.exportExcel;