/* js/settings.js */

import { db } from "./firebase-config.js";
import { doc, setDoc, getDoc, collection, onSnapshot, addDoc, deleteDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Export variables
export let allLists = [];
export let formFields = [];

const listsList = document.getElementById("settingsListsDisplay");
const sidebarNav = document.getElementById("dynamicListNav");
const dashboardCards = document.getElementById("dashboardCards");
const createListForm = document.getElementById("createListForm");
const controlListsContainer = document.getElementById("control-lists-container");

let systemControls = {};

async function initData() {
    await loadSystemControls();
    
    // Load Lists
    onSnapshot(collection(db, "lists"), (snapshot) => {
        allLists = [];
        if(listsList) listsList.innerHTML = "";
        if(sidebarNav) sidebarNav.innerHTML = "";
        if(dashboardCards) dashboardCards.innerHTML = "";
        if(controlListsContainer) controlListsContainer.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const listData = docSnap.data();
            allLists.push({ id: docSnap.id, ...listData });

            // A. Settings List
            if(listsList) {
                const li = document.createElement("li");
                li.className = "list-group-item d-flex justify-content-between align-items-center";
                li.innerHTML = `<span><i class="fas fa-circle me-2" style="color: ${listData.color}"></i> ${listData.name}</span><button class="btn btn-sm btn-outline-danger" onclick="deleteList('${docSnap.id}')"><i class="fas fa-trash"></i></button>`;
                listsList.appendChild(li);
            }

            // B. Admin Controls
            if(controlListsContainer) {
                const isHidden = systemControls.hiddenLists && systemControls.hiddenLists.includes(docSnap.id);
                const isChecked = !isHidden; 
                const div = document.createElement("div");
                div.className = "col-md-6 col-lg-4";
                div.innerHTML = `
                    <div class="d-flex align-items-center justify-content-between p-3 border rounded shadow-sm bg-white h-100">
                        <div class="d-flex align-items-center overflow-hidden me-2">
                            <span class="rounded-circle me-2 flex-shrink-0" style="width: 15px; height: 15px; background-color: ${listData.color}; display: inline-block;"></span>
                            <span class="fw-bold text-dark text-truncate" title="${listData.name}">${listData.name}</span>
                        </div>
                        <div class="form-check form-switch m-0">
                             <input class="form-check-input list-visibility-switch" style="cursor: pointer; width: 2.5em; height: 1.25em;" type="checkbox" id="chk-list-${docSnap.id}" value="${docSnap.id}" ${isChecked ? 'checked' : ''}>
                        </div>
                    </div>
                `;
                controlListsContainer.appendChild(div);
            }
        });
        
        refreshUserInterface();
        updateFieldTargetSelect();
        renderFieldsPanel(); 
        
        // --- گرنگ: بانگکردنی نوێکردنەوەی داشبۆرد دوای لۆدکردنی لیستەکان ---
        if(window.refreshDashboardListeners) {
            window.refreshDashboardListeners();
        }
    });
}

function refreshUserInterface() {
    if(!sidebarNav || !dashboardCards) return;
    sidebarNav.innerHTML = "";
    dashboardCards.innerHTML = "";
    allLists.forEach(list => {
        // Sidebar Link
        const a = document.createElement("a");
        a.className = "nav-link list-link-item";
        a.id = `nav-list-${list.id}`; 
        a.style.cursor = "pointer";
        a.onclick = () => { if(window.openList) window.openList(list.id); };
        a.innerHTML = `<i class="fas fa-folder" style="color: ${list.color}"></i> ${list.name}`;
        sidebarNav.appendChild(a);

        // Dashboard Card
        const div = document.createElement("div");
        div.className = "col-md-3 col-sm-6 mb-3 list-card-item";
        div.id = `card-list-${list.id}`; 
        div.innerHTML = `
            <div class="card-box text-center h-100 shadow-sm" style="border-top: 4px solid ${list.color}; cursor:pointer; transition: transform 0.2s;" onclick="window.openList('${list.id}')" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                <h5 style="color:${list.color}" class="fw-bold mt-2">${list.name}</h5>
                <div class="d-flex justify-content-around mt-4">
                    <div class="text-center"><h3 class="fw-bold mb-0 text-dark" id="count-${list.id}">0</h3><small class="text-muted" style="font-size:12px;">کەس</small></div>
                    <div class="text-center border-start ps-3"><h4 class="fw-bold mb-0 text-success" id="total-${list.id}">0</h4><small class="text-muted" style="font-size:12px;">IQD</small></div>
                </div>
            </div>`;
        dashboardCards.appendChild(div);
    });

    if(window.applyListVisibility) window.applyListVisibility();
}

// ... باقی کۆدەکەی خوارەوە وەک خۆی ...
// (createListForm, Drag & Drop, System Control, ...)
initData();

if(createListForm) {
    createListForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("newListTitle").value;
        const color = document.getElementById("newListColor").value;
        await addDoc(collection(db, "lists"), { name: title, color: color });
        createListForm.reset();
        Swal.fire("سەرکەوتوو", "لیست زیادکرا", "success");
    });
}
window.deleteList = async (id) => { if(confirm("دڵنیای؟")) await deleteDoc(doc(db, "lists", id)); };

const createFieldForm = document.getElementById("createFieldForm");
const fieldsPreview = document.getElementById("fieldsPreviewArea");

onSnapshot(collection(db, "listFields"), (snapshot) => {
    formFields = [];
    snapshot.forEach((docSnap) => {
        const field = docSnap.data();
        formFields.push({ id: docSnap.id, ...field });
    });
    renderFieldsPanel();
});

function renderFieldsPanel() {
    if(!fieldsPreview) return;
    fieldsPreview.innerHTML = "";

    const groupedFields = {};
    formFields.forEach(f => {
        if(!groupedFields[f.listId]) groupedFields[f.listId] = [];
        groupedFields[f.listId].push(f);
    });

    allLists.forEach(list => {
        let fields = groupedFields[list.id] || [];
        fields.sort((a,b) => (a.order || 0) - (b.order || 0));

        const sectionDiv = document.createElement("div");
        sectionDiv.className = "card mb-4 shadow-sm border-0";
        
        sectionDiv.innerHTML = `
            <div class="card-header d-flex justify-content-between align-items-center bg-white border-bottom-0 pt-3 ps-3 pe-3">
                <div class="d-flex align-items-center">
                    <i class="fas fa-layer-group me-2" style="color:${list.color}"></i>
                    <strong class="h6 m-0" style="color:${list.color}">${list.name}</strong>
                </div>
                <span class="badge bg-light text-dark border">${fields.length} خانە</span>
            </div>
            <div class="card-body p-2">
                <ul class="list-group list-group-flush" id="sortable-list-${list.id}" data-list-id="${list.id}"></ul>
            </div>
        `;

        const listContainer = sectionDiv.querySelector('ul');

        if (fields.length === 0) {
            listContainer.innerHTML = `<div class="text-center text-muted small py-3">هیچ خانەیەک زیاد نەکراوە</div>`;
        } else {
            fields.forEach(f => {
                const li = document.createElement('li');
                li.className = "list-group-item d-flex justify-content-between align-items-center draggable-item border rounded mb-2";
                li.setAttribute("data-id", f.id);
                li.style.cursor = "move"; 
                
                li.innerHTML = `
                    <div class="d-flex align-items-center" style="width: 40%;">
                        <i class="fas fa-grip-lines text-muted me-3 handle" style="opacity:0.5; cursor: grab;"></i>
                        <div class="text-truncate">
                            <span class="fw-bold text-dark d-block text-truncate" title="${f.label}">${f.label}</span>
                            <small class="badge bg-secondary opacity-75">${f.type}</small>
                        </div>
                    </div>

                    <div class="d-flex align-items-center justify-content-end gap-3 flex-grow-1">
                        <div class="form-check form-switch" title="پیشاندان لە خشتە">
                            <input class="form-check-input" type="checkbox" ${f.showInTable ? 'checked' : ''} onchange="toggleFieldProp('${f.id}', 'showInTable', this.checked)">
                            <label class="form-check-label small text-muted"><i class="fas fa-table"></i></label>
                        </div>

                        <div class="form-check form-switch" title="پیشاندان لە چاپ">
                             <input class="form-check-input" type="checkbox" ${f.showInPrint ? 'checked' : ''} onchange="toggleFieldProp('${f.id}', 'showInPrint', this.checked)">
                            <label class="form-check-label small text-muted"><i class="fas fa-print"></i></label>
                        </div>

                        <div class="vr mx-1"></div>

                        <button class="btn btn-sm text-danger hover-scale" onclick="deleteField('${f.id}')" title="سڕینەوە">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
                listContainer.appendChild(li);
            });

            new Sortable(listContainer, {
                handle: '.handle', 
                animation: 150,
                ghostClass: 'bg-light',
                onEnd: async function (evt) {
                    const items = evt.to.querySelectorAll('.draggable-item');
                    const batch = writeBatch(db);
                    items.forEach((item, index) => {
                        const id = item.getAttribute('data-id');
                        const ref = doc(db, "listFields", id);
                        batch.update(ref, { order: index });
                    });
                    try { await batch.commit(); } 
                    catch (err) { console.error("Error reordering:", err); }
                }
            });
        }
        fieldsPreview.appendChild(sectionDiv);
    });
}

window.toggleFieldProp = async (fieldId, propName, value) => {
    try {
        const ref = doc(db, "listFields", fieldId);
        await updateDoc(ref, { [propName]: value });
    } catch (error) {
        console.error("Error updating field:", error);
        Swal.fire("", "هەڵەیەک ڕوویدا", "error");
    }
};

function updateFieldTargetSelect() {
    const select = document.getElementById("fieldTargetList");
    if(!select) return;
    select.innerHTML = "";
    allLists.forEach(l => {
        const opt = document.createElement("option");
        opt.value = l.id;
        opt.innerText = l.name;
        select.appendChild(opt);
    });
}

const fieldTypeSelect = document.getElementById("fieldType");
if(fieldTypeSelect) {
    fieldTypeSelect.addEventListener("change", (e) => {
        const optionsDiv = document.getElementById("optionsDiv");
        if(e.target.value === 'select') optionsDiv.classList.remove('d-none');
        else optionsDiv.classList.add('d-none');
    });
}

if(createFieldForm) {
    createFieldForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const listId = document.getElementById("fieldTargetList").value;
        const type = document.getElementById("fieldType").value;
        const label = document.getElementById("fieldLabel").value;
        const options = document.getElementById("fieldOptions").value;
        const showInTable = document.getElementById("showInTable").checked;
        const showInPrint = document.getElementById("showInPrint").checked;
        await addDoc(collection(db, "listFields"), { listId, type, label, options, showInTable, showInPrint, order: Date.now(), isSystem: false });
        createFieldForm.reset();
        Swal.fire("سەرکەوتوو", "خانە زیادکرا", "success");
    });
}
window.deleteField = async (id) => { if(confirm("دڵنیای لە سڕینەوە؟")) await deleteDoc(doc(db, "listFields", id)); };

async function loadSystemControls() {
    const docRef = doc(db, "system_settings", "controls");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        systemControls = docSnap.data();
        setSwitch('ctrl-print-list', systemControls.printList);
        setSwitch('ctrl-print-envelope', systemControls.printEnvelope);
        setSwitch('ctrl-add-new', systemControls.addNew);
        setSwitch('ctrl-excel', systemControls.excel);
        setSwitch('ctrl-archive-btn', systemControls.archiveBtn);
        setSwitch('ctrl-archive-nav', systemControls.archiveNav);
        setSwitch('ctrl-row-edit', systemControls.rowEdit);
        setSwitch('ctrl-row-suspend', systemControls.rowSuspend);
        setSwitch('ctrl-row-temp', systemControls.rowTemp);
        setSwitch('ctrl-row-delete', systemControls.rowDelete);
    }
}

function setSwitch(id, value) { 
    const el = document.getElementById(id);
    if(el) {
        el.checked = (value !== false);
    }
}

window.saveSystemControls = async function() {
    try {
        Swal.fire({title: 'خەزنکردن ...', didOpen: () => Swal.showLoading()});
        const hiddenLists = [];
        document.querySelectorAll('.list-visibility-switch').forEach(chk => {
            if (!chk.checked) { 
                hiddenLists.push(chk.value);
            }
        });
        const controls = {
            printList: document.getElementById('ctrl-print-list').checked,
            printEnvelope: document.getElementById('ctrl-print-envelope').checked,
            addNew: document.getElementById('ctrl-add-new').checked,
            excel: document.getElementById('ctrl-excel').checked, 
            archiveBtn: document.getElementById('ctrl-archive-btn').checked,
            archiveNav: document.getElementById('ctrl-archive-nav').checked,
            rowEdit: document.getElementById('ctrl-row-edit').checked,
            rowSuspend: document.getElementById('ctrl-row-suspend').checked,
            rowTemp: document.getElementById('ctrl-row-temp').checked,
            rowDelete: document.getElementById('ctrl-row-delete').checked,
            hiddenLists: hiddenLists
        };
        await setDoc(doc(db, "system_settings", "controls"), controls);
        systemControls = controls;
        
        Swal.fire('تەواو', 'گۆڕانکارییەکان خەزنکران.', 'success').then(() => {
            location.reload(); 
        });
    } catch (error) {
        console.error(error);
        Swal.fire('', error.message, 'error');
    }
};