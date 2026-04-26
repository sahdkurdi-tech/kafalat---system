/* js/auth-nav.js */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// گۆڕانکاری: ئیمەیڵە جێگیرەکە لابرا، ئێستا پشت بە ڕۆڵی داتابەیس دەبەستێت
let currentUserRole = "staff"; // ڕۆڵی سەرەتایی

onAuthStateChanged(auth, async (user) => {
    const loadingScreen = document.getElementById('loading-screen');
    const appContainer = document.getElementById('app-container');

    if (user) {
        // ١. هێنانی ڕۆڵ لە داتابەیسەوە
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                currentUserRole = userData.role || "staff";
            } else {
                console.log("User document not found, treating as staff.");
                currentUserRole = "staff";
            }
        } catch (error) {
            console.error("Error fetching user role:", error);
            currentUserRole = "staff"; // Fallback
        }

        if (loadingScreen) loadingScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
        
        // لادانی شاشەی چوونەژوورەوە
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'none';
        
        // ٢. پشکنین بەپێی ڕۆڵ
        const isAdmin = currentUserRole === 'admin';

        // دوگمەی سێتینگ
        const settingsLink = document.getElementById('nav-settings-link');
        if (settingsLink) {
            if (isAdmin) {
                settingsLink.style.display = 'block'; 
                settingsLink.classList.remove('admin-only'); 
            } else {
                settingsLink.style.display = 'none';
                settingsLink.classList.add('admin-only');
            }
        }

        if (isAdmin) {
            document.body.classList.add('is-admin');
            if (window.removeCustomStyles) window.removeCustomStyles();
            if (window.applyListVisibility) setTimeout(window.applyListVisibility, 1000);
        } else {
            document.body.classList.remove('is-admin');
            // بۆ ستاف: یاساکان جێبەجێ بکە
            if (typeof applySystemControls === 'function') {
                await applySystemControls();
            }
        }

    } else {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = "login.html";
        }
    }
});

// دەرچوون
window.logoutSystem = function() {
    Swal.fire({
        title: 'دڵنیایت؟', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'بەڵێ', cancelButtonText: 'نەخێر'
    }).then((result) => {
        if (result.isConfirmed) signOut(auth).then(() => window.location.href = "login.html");
    });
};

async function applySystemControls() {
    try {
        const docRef = doc(db, "system_settings", "controls");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            let cssRules = "";

            // A. شاردنەوەی دوگمە جێگیرەکان (Tools)
            if (data.addNew === false) cssRules += "#btn-add-new { display: none !important; } ";
            if (data.excel === false) cssRules += "#btn-excel { display: none !important; } ";
            if (data.printList === false) cssRules += "#btn-print-list { display: none !important; } ";
            if (data.printEnvelope === false) cssRules += "#btn-print-envelope { display: none !important; } ";
            if (data.archiveBtn === false) cssRules += "#btn-archive { display: none !important; } ";
            if (data.archiveNav === false) cssRules += "#nav-archive-link { display: none !important; } ";

            // B. شاردنەوەی دوگمە داینامیکەکان (Table Actions)
            if (data.rowEdit === false) cssRules += ".btn-act-edit { display: none !important; } ";
            if (data.rowSuspend === false) cssRules += ".btn-act-suspend { display: none !important; } ";
            if (data.rowTemp === false) cssRules += ".btn-act-temp { display: none !important; } ";
            if (data.rowDelete === false) cssRules += ".btn-act-delete { display: none !important; } ";

            // C. جێبەجێکردن
            injectCustomStyles(cssRules);

            // D. شاردنەوەی لیستەکان
            window.hiddenLists = data.hiddenLists || [];
            setTimeout(executeListHiding, 500);
            setTimeout(executeListHiding, 2000);
        }
    } catch (error) {
        console.error("Error applying controls:", error);
    }
}

function injectCustomStyles(rules) {
    const styleId = "staff-restrictions";
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = rules;
}

window.removeCustomStyles = function() {
    const styleTag = document.getElementById("staff-restrictions");
    if (styleTag) styleTag.remove();
}

function executeListHiding() {
    if (!window.hiddenLists || window.hiddenLists.length === 0) return;
    window.hiddenLists.forEach(listId => {
        const navItem = document.getElementById(`nav-list-${listId}`);
        if(navItem) navItem.style.setProperty('display', 'none', 'important');
        const cardItem = document.getElementById(`card-list-${listId}`);
        if(cardItem) {
            const parentCol = cardItem.closest('.col-md-3, .col-sm-6'); 
            if(parentCol) parentCol.style.setProperty('display', 'none', 'important');
        }
    });
}

window.applyListVisibility = function() {
    // گۆڕانکاری: پشکنین بەپێی ڕۆڵ نەک ئیمەیڵ
    if (currentUserRole === 'admin') return;
    executeListHiding();
};