"use strict";
const STORAGE_KEY = "athar_school_portal_v1";
const ADMIN_PASS = "2443422";

const UPCOMING_AND_SUMMER_HOLIDAYS = [
    { name: "إجازة نهاية أسبوع مطولة", start: "2026-12-13", end: "2026-12-13" },
    { name: "إجازة منتصف العام الدراسي", start: "2027-01-01", end: "2027-01-09" },
    { name: "إجازة يوم التأسيس", start: "2027-02-22", end: "2027-02-22" },
    { name: "إجازة عيد الفطر المبارك", start: "2027-03-05", end: "2027-03-15" },
    { name: "إجازة عيد الأضحى المبارك", start: "2027-05-14", end: "2027-05-22" },
    { name: "الإجازة الصيفية لنهاية العام الدراسي", start: "2027-05-28", end: "2027-08-21" }
];

let students = loadStudents();
let isAdminAuthenticated = false;
let html5QrScanner = null;
let isCameraRunning = false;
let lastScanCode = "";
let lastScanTime = 0;

function loadStudents() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.error(e);
    }
    return [];
}

function saveStudents() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
    } catch (e) {
        console.error(e);
    }
    renderAdminTable();
    populateStudentSelect();
}

function getTodayDateISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function checkNonSchoolDayReason() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 5) return "عطلة نهاية الأسبوع (الجمعة)";
    if (dayOfWeek === 6) return "عطلة نهاية الأسبوع (السبت)";

    const todayISO = getTodayDateISO();
    for (const h of UPCOMING_AND_SUMMER_HOLIDAYS) {
        if (todayISO >= h.start && todayISO <= h.end) {
            return h.name;
        }
    }
    return null;
}

function getFixedQrUrl(studentId) {
    const baseUrl = window.location.href.split("?")[0];
    return `${baseUrl}?id=${encodeURIComponent(studentId.trim().toUpperCase())}`;
}

function extractStudentId(input) {
    const clean = input.trim();
    if (clean.includes("id=")) {
        try {
            const url = new URL(clean);
            return (url.searchParams.get("id") || "").toUpperCase();
        } catch (_a) {
            const match = clean.match(/id=([^&]+)/i);
            return match ? decodeURIComponent(match[1]).toUpperCase() : "";
        }
    }
    return clean.toUpperCase();
}

function showPage(pageId) {
    var _a;
    document.querySelectorAll(".page-view").forEach(el => el.classList.remove("active"));
    (_a = document.getElementById(pageId)) === null || _a === void 0 ? void 0 : _a.classList.add("active");
}

function openStudentPage() {
    var _a, _b;
    (_a = document.getElementById("nav-student-btn")) === null || _a === void 0 ? void 0 : _a.classList.add("active");
    (_b = document.getElementById("nav-admin-btn")) === null || _b === void 0 ? void 0 : _b.classList.remove("active");
    showPage("student-page");
}

function openAdminPage() {
    var _a, _b;
    (_a = document.getElementById("nav-admin-btn")) === null || _a === void 0 ? void 0 : _a.classList.add("active");
    (_b = document.getElementById("nav-student-btn")) === null || _b === void 0 ? void 0 : _b.classList.remove("active");

    if (isAdminAuthenticated) {
        showPage("admin-dashboard-page");
        updateDayBanner();
    } else {
        showPage("admin-login-page");
    }
}

function verifyAdminLogin(event) {
    event.preventDefault();
    const passInput = document.getElementById("admin-password-input");
    const errorBox = document.getElementById("login-error");

    if (passInput.value === ADMIN_PASS) {
        isAdminAuthenticated = true;
        errorBox.classList.add("hidden");
        passInput.value = "";
        showPage("admin-dashboard-page");
        renderAdminTable();
        populateStudentSelect();
        renderStudentIdCards();
        renderHolidaysList();
        updateDayBanner();
    } else {
        errorBox.classList.remove("hidden");
    }
}

function logoutAdmin() {
    isAdminAuthenticated = false;
    stopCameraScanner();
    openStudentPage();
}

function renderStudentCard(student) {
    const profileView = document.getElementById("student-profile-view");
    profileView.classList.remove("hidden");

    document.getElementById("p-name").innerText = student.name;
    document.getElementById("p-grade-class").innerText = `${student.grade} — فصل ${student.classroom || "1"}`;
    document.getElementById("p-id").innerText = student.id;
    document.getElementById("p-present").innerText = student.presentDays.toString();
    document.getElementById("p-excused").innerText = student.excusedAbsentDays.toString();
    document.getElementById("p-unexcused").innerText = student.unexcusedAbsentDays.toString();

    const totalDays = student.presentDays + student.excusedAbsentDays + student.unexcusedAbsentDays;
    const rate = totalDays > 0 ? Math.round((student.presentDays / totalDays) * 100) : 100;
    document.getElementById("p-rate").innerText = `${rate}%`;

    const qrContainer = document.getElementById("p-qrcode");
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: getFixedQrUrl(student.id),
        width: 155,
        height: 155,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });

    const achList = document.getElementById("p-achievements-list");
    achList.innerHTML = student.achievements.length
        ? student.achievements.map(a => `<li>🏆 <strong>${a.title}</strong> <span style="color:#64748b; font-size:0.85rem;">(${a.date})</span></li>`).join("")
        : "<li>لا توجد إنجازات مسجلة حتى الآن.</li>";

    const logsList = document.getElementById("p-logs-list");
    logsList.innerHTML = student.attendanceLogs.length
        ? student.attendanceLogs.slice(0, 10).map(log => `<li>${log}</li>`).join("")
        : "<li>لا يوجد سجل حضور أو غياب مسجل بعد.</li>";
}

function handleStudentSearch() {
    const input = document.getElementById("student-search-input");
    const targetId = extractStudentId(input.value);
    const student = students.find(s => s.id === targetId);

    if (!student) {
        alert("رقم الطالب غير مسجل في منصة أثر! يجب تسجيل الطالب أولاً من بوابة المشرف.");
        document.getElementById("student-profile-view").classList.add("hidden");
        return;
    }
    renderStudentCard(student);
}

function getFormattedNow() {
    const now = new Date();
    const dayName = now.toLocaleDateString("ar-SA", { weekday: "long" });
    return `${dayName} (${now.toLocaleDateString("ar-SA")}) - ${now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
}

function recordAttendanceByScanner(rawInput) {
    var _a;
    if (!isAdminAuthenticated) return;

    const resultBox = document.getElementById("scan-result");
    resultBox.classList.remove("hidden", "success", "error", "warning");

    const isDemoMode = (_a = document.getElementById("demo-mode-checkbox")) === null || _a === void 0 ? void 0 : _a.checked;
    const holidayReason = checkNonSchoolDayReason();

    if (holidayReason && !isDemoMode) {
        resultBox.classList.add("warning");
        resultBox.innerHTML = `⛔ التحضير متوقف اليوم بسبب: <strong>${holidayReason}</strong>.<br>يستثني نظام أثر أيام العطل والإجازات القادمة والصيفية تلقائياً.`;
        return;
    }

    const studentId = extractStudentId(rawInput);
    const student = students.find(s => s.id === studentId);

    if (!student) {
        resultBox.classList.add("error");
        resultBox.innerText = `❌ هذا الباركود غير مسجل في منصة أثر: ${studentId}`;
        return;
    }

    const todayISO = getTodayDateISO();
    if (student.lastAttendedDate === todayISO) {
        resultBox.classList.add("warning");
        resultBox.innerHTML = `⚠️ الطالب <strong>${student.name}</strong> (${student.id}) مسجّل حضوره مسبقاً لهذا اليوم (${todayISO}).<br>تم منع التكرار تلقائياً.`;
        return;
    }

    const timeString = getFormattedNow();
    student.presentDays += 1;
    student.lastAttendedDate = todayISO;
    student.attendanceLogs.unshift(`✅ حضور (قارئ الباركود المدرسي): ${timeString}`);
    saveStudents();

    resultBox.classList.add("success");
    resultBox.innerHTML = `✅ تم تسجيل حضور الطالب: <strong>${student.name}</strong> (${student.grade} - فصل ${student.classroom})<br>الوقت: ${timeString}`;
}

function handleAdminScan() {
    const input = document.getElementById("manual-id-input");
    if (input.value) {
        recordAttendanceByScanner(input.value);
        input.value = "";
    }
}

function addNewStudent(event) {
    event.preventDefault();
    if (!isAdminAuthenticated) return;

    const id = document.getElementById("new-id").value.trim().toUpperCase();
    const name = document.getElementById("new-name").value.trim();
    const grade = document.getElementById("new-grade").value;
    const classroom = document.getElementById("new-classroom").value;

    if (!grade || !classroom) {
        alert("يرجى اختيار الصف الدراسي والفصل!");
        return;
    }

    if (students.some(s => s.id === id)) {
        alert("رقم الطالب مسجل مسبقاً!");
        return;
    }

    const newStudent = {
        id,
        name,
        grade,
        classroom,
        presentDays: 0,
        excusedAbsentDays: 0,
        unexcusedAbsentDays: 0,
        lastAttendedDate: "",
        attendanceLogs: [],
        achievements: []
    };

    students.push(newStudent);
    saveStudents();
    appendSingleIdCard(newStudent);
    event.target.reset();
    alert(`تم تسجيل الطالب ${name} (${grade} - فصل ${classroom}) وإصدار باركود أثر الثابت بنجاح!`);
}

function addAchievement(event) {
    event.preventDefault();
    if (!isAdminAuthenticated) return;

    const studentId = document.getElementById("select-student").value;
    if (!studentId) {
        alert("يرجى تسجيل طالب أولاً!");
        return;
    }

    const title = document.getElementById("ach-title").value.trim();
    const date = document.getElementById("ach-date").value;

    const student = students.find(s => s.id === studentId);
    if (student) {
        student.achievements.unshift({ title, date });
        saveStudents();
        event.target.reset();
        alert("تمت إضافة الإنجاز إلى سجل الطالب بنجاح!");
    }
}

function adjustAttendanceMetric(studentId, field, change) {
    if (!isAdminAuthenticated) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const currentVal = student[field] || 0;
    const nextVal = Math.max(0, currentVal + change);
    if (nextVal === currentVal) return;

    student[field] = nextVal;
    const timeString = getFormattedNow();

    if (change > 0) {
        if (field === "presentDays") {
            student.attendanceLogs.unshift(`✅ حضور يدوي (طوارئ): ${timeString}`);
        } else if (field === "excusedAbsentDays") {
            student.attendanceLogs.unshift(`🟡 غياب بعذر: ${timeString}`);
        } else if (field === "unexcusedAbsentDays") {
            student.attendanceLogs.unshift(`🔴 غياب بدون عذر: ${timeString}`);
        }
    } else if (field === "presentDays" && nextVal === 0) {
        student.lastAttendedDate = "";
    }

    saveStudents();
}

function deleteStudent(studentId) {
    if (!isAdminAuthenticated) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    if (!confirm(`⚠️ تأكيد الحذف:\nهل أنت متأكد من حذف الطالب "${student.name}" (${student.id}) وجميع سجلاته نهائياً؟`)) {
        return;
    }

    students = students.filter(s => s.id !== studentId);
    saveStudents();
    renderStudentIdCards();
}

function exportToExcelCSV() {
    if (!isAdminAuthenticated) return;
    if (students.length === 0) {
        alert("لا يوجد طلاب مسجلون لتصديرهم!");
        return;
    }

    const headers = [
        "رقم الطالب",
        "اسم الطالب",
        "الصف الدراسي",
        "الفصل",
        "أيام الحضور",
        "غياب بعذر",
        "غياب بدون عذر",
        "نسبة الانتظام",
        "عدد الإنجازات"
    ];

    const rows = students.map(s => {
        const total = s.presentDays + s.excusedAbsentDays + s.unexcusedAbsentDays;
        const rate = total > 0 ? Math.round((s.presentDays / total) * 100) : 100;
        return [
            `"${s.id}"`,
            `"${s.name.replace(/"/g, '""')}"`,
            `"${s.grade.replace(/"/g, '""')}"`,
            `"${s.classroom || "1"}"`,
            s.presentDays,
            s.excusedAbsentDays,
            s.unexcusedAbsentDays,
            `"${rate}%"`,
            s.achievements.length
        ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `أثر_تقرير_الحضور_والانتظام_${getTodayDateISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportBackupJSON() {
    if (!isAdminAuthenticated) return;
    const backupData = {
        platform: "أثر",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        students: students
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `أثر_نسخة_احتياطية_${getTodayDateISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function triggerBackupRestore() {
    if (!isAdminAuthenticated) return;
    const fileInput = document.getElementById("restore-backup-input");
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

function importBackupJSON(event) {
    if (!isAdminAuthenticated) return;
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(String((e.target && e.target.result) || ""));
            const restoredList = Array.isArray(parsed) ? parsed : parsed.students;

            if (!Array.isArray(restoredList)) {
                alert("❌ ملف النسخة الاحتياطية غير صالح!");
                return;
            }

            if (!confirm(`سيتم استبدال البيانات الحالية بـ (${restoredList.length}) طالب من النسخة الاحتياطية. هل تريد المتابعة؟`)) {
                return;
            }

            students = restoredList.map((s) => ({
                id: String(s.id || "").toUpperCase(),
                name: String(s.name || ""),
                grade: String(s.grade || "الأول ثانوي"),
                classroom: String(s.classroom || "1"),
                presentDays: Number(s.presentDays) || 0,
                excusedAbsentDays: Number(s.excusedAbsentDays) || 0,
                unexcusedAbsentDays: Number(s.unexcusedAbsentDays) || 0,
                lastAttendedDate: String(s.lastAttendedDate || ""),
                attendanceLogs: Array.isArray(s.attendanceLogs) ? s.attendanceLogs : [],
                achievements: Array.isArray(s.achievements) ? s.achievements : []
            }));

            saveStudents();
            renderStudentIdCards();
            alert("✅ تمت استعادة النسخة الاحتياطية بنجاح!");
        } catch (_a) {
            alert("❌ حدث خطأ أثناء قراءة ملف النسخة الاحتياطية.");
        }
    };
    reader.readAsText(file);
}

function clearAllStudents() {
    if (!isAdminAuthenticated) return;
    if (confirm("⚠️ تأكيد المسح الشامل:\nهل أنت متأكد من مسح جميع الطلاب المسجلين وبياناتهم نهائياً؟")) {
        localStorage.removeItem(STORAGE_KEY);
        students = [];
        saveStudents();
        renderStudentIdCards();
    }
}

function viewStudentFromAdmin(studentId) {
    const student = students.find(s => s.id === studentId);
    if (student) {
        openStudentPage();
        renderStudentCard(student);
    }
}

function renderAdminTable() {
    const tbody = document.getElementById("admin-students-tbody");
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:1.5rem;">لا يوجد طلاب مسجلون حالياً. قم بتسجيل الطلاب من النموذج أعلاه.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => `
        <tr>
            <td><strong>${s.id}</strong></td>
            <td>${s.name}</td>
            <td>${s.grade}</td>
            <td>فصل ${s.classroom || "1"}</td>
            <td>
                <div class="absent-controls">
                    <button type="button" class="btn-mini present" title="إضافة حضور يدوي" onclick="adjustAttendanceMetric('${s.id}', 'presentDays', 1)">+</button>
                    <strong>${s.presentDays}</strong>
                    <button type="button" class="btn-mini neutral" title="إنقاص حضور" onclick="adjustAttendanceMetric('${s.id}', 'presentDays', -1)">-</button>
                </div>
            </td>
            <td>
                <div class="absent-controls">
                    <button type="button" class="btn-mini excused" title="إضافة غياب بعذر" onclick="adjustAttendanceMetric('${s.id}', 'excusedAbsentDays', 1)">+</button>
                    <strong>${s.excusedAbsentDays}</strong>
                    <button type="button" class="btn-mini neutral" title="إنقاص غياب بعذر" onclick="adjustAttendanceMetric('${s.id}', 'excusedAbsentDays', -1)">-</button>
                </div>
            </td>
            <td>
                <div class="absent-controls">
                    <button type="button" class="btn-mini danger" title="إضافة غياب بدون عذر" onclick="adjustAttendanceMetric('${s.id}', 'unexcusedAbsentDays', 1)">+</button>
                    <strong>${s.unexcusedAbsentDays}</strong>
                    <button type="button" class="btn-mini neutral" title="إنقاص غياب بدون عذر" onclick="adjustAttendanceMetric('${s.id}', 'unexcusedAbsentDays', -1)">-</button>
                </div>
            </td>
            <td>
                <div style="display:flex; gap:0.4rem; align-items:center;">
                    <button type="button" class="btn primary" style="padding: 0.35rem 0.7rem; font-size:0.85rem;" 
                    onclick="viewStudentFromAdmin('${s.id}')">السجلات</button>
                    <button type="button" class="btn danger-outline" style="padding: 0.35rem 0.7rem; font-size:0.85rem;" 
                    onclick="deleteStudent('${s.id}')">🗑️ حذف</button>
                </div>
            </td>
        </tr>
    `).join("");
}

function appendSingleIdCard(student) {
    const grid = document.getElementById("student-id-cards-grid");
    if (!grid) return;

    const emptyMsg = grid.querySelector(".empty-cards-msg");
    if (emptyMsg) emptyMsg.remove();

    const card = document.createElement("div");
    card.className = "student-id-card";
    card.innerHTML = `
        <div class="id-card-top">✨ أثر | الهوية المدرسية</div>
        <div class="id-card-body">
            <h4>${student.name}</h4>
            <p>${student.grade} — فصل ${student.classroom || "1"}</p>
            <div id="fixed-qr-${student.id}" class="id-card-qr"></div>
            <span class="id-card-code">${student.id}</span>
        </div>
    `;
    grid.appendChild(card);

    const qrBox = document.getElementById(`fixed-qr-${student.id}`);
    if (qrBox) {
        new QRCode(qrBox, {
            text: getFixedQrUrl(student.id),
            width: 140,
            height: 140,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }
}

function renderStudentIdCards() {
    const grid = document.getElementById("student-id-cards-grid");
    if (!grid) return;

    grid.innerHTML = "";
    if (students.length === 0) {
        grid.innerHTML = `<p class="empty-cards-msg" style="color:#64748b;">لا توجد بطاقات حالياً. عند تسجيل أي طالب ستظهر بطاقته الثابتة هنا.</p>`;
        return;
    }

    students.forEach(student => appendSingleIdCard(student));
}

function populateStudentSelect() {
    const select = document.getElementById("select-student");
    if (!select) return;
    if (students.length === 0) {
        select.innerHTML = `<option value="">-- سجل طالباً أولاً --</option>`;
        return;
    }
    select.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.grade} - فصل ${s.classroom || "1"})</option>`).join("");
}

function renderHolidaysList() {
    const list = document.getElementById("holidays-display-list");
    if (!list) return;

    list.innerHTML = UPCOMING_AND_SUMMER_HOLIDAYS
        .map(h => {
            const rangeText = h.start === h.end ? h.start : `من ${h.start} إلى ${h.end}`;
            return `<li>📅 <strong>${h.name}</strong> <span style="color:#64748b; font-size:0.85rem;">(${rangeText})</span></li>`;
        })
        .join("");
}

function updateDayBanner() {
    const dayBanner = document.getElementById("current-day-banner");
    if (!dayBanner) return;

    const dayName = new Date().toLocaleDateString("ar-SA", { weekday: "long" });
    const holidayReason = checkNonSchoolDayReason();

    dayBanner.innerHTML = holidayReason
        ? `اليوم: <strong>${dayName}</strong> — ⛔ مستثنى من المسح التلقائي (<strong>${holidayReason}</strong>)`
        : `اليوم: <strong>${dayName}</strong> — ✅ يوم دراسي فعلي (قارئ الباركود نشط)`;
}

function startCameraScanner() {
    if (isCameraRunning) return;
    const btn = document.getElementById("start-camera-btn");

    try {
        html5QrScanner = new Html5Qrcode("reader");
        html5QrScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
                const nowMs = Date.now();
                if (decodedText !== lastScanCode || nowMs - lastScanTime > 4000) {
                    lastScanCode = decodedText;
                    lastScanTime = nowMs;
                    recordAttendanceByScanner(decodedText);
                }
            },
            () => {}
        ).then(() => {
            isCameraRunning = true;
            if (btn) {
                btn.innerText = "✅ قارئ الباركود يعمل";
                btn.disabled = true;
            }
        }).catch(() => {
            alert("تعذر فتح الكاميرا. تأكد من منح المتصفح إذن الوصول للكاميرا أو استخدم الإدخال اليدوي.");
        });
    } catch (e) {
        alert("مكتبة الكاميرا غير متاحة على هذا المتصفح.");
    }
}

function stopCameraScanner() {
    if (html5QrScanner && isCameraRunning) {
        html5QrScanner.stop().then(() => {
            isCameraRunning = false;
        }).catch(() => {});
    }
}

window.addEventListener("DOMContentLoaded", () => {
    var _a, _b, _c, _d;
    const urlParams = new URLSearchParams(window.location.search);
    const scannedStudentId = urlParams.get("id");

    if (scannedStudentId) {
        (_a = document.getElementById("main-navbar")) === null || _a === void 0 ? void 0 : _a.remove();
        (_b = document.getElementById("student-search-box")) === null || _b === void 0 ? void 0 : _b.remove();
        (_c = document.getElementById("admin-login-page")) === null || _c === void 0 ? void 0 : _c.remove();
        (_d = document.getElementById("admin-dashboard-page")) === null || _d === void 0 ? void 0 : _d.remove();
        showPage("student-page");

        const targetStudent = students.find(s => s.id === scannedStudentId.trim().toUpperCase());
        if (targetStudent) {
            renderStudentCard(targetStudent);
        } else {
            const card = document.querySelector("#student-page .card");
            if (card) {
                card.innerHTML = `<h2>❌ سجل الطالب غير موجود</h2><p class="subtitle">رقم الطالب (${scannedStudentId}) غير مسجل على هذا الجهاز.</p>`;
            }
        }
        return;
    }

    openStudentPage();
});

window.openStudentPage = openStudentPage;
window.openAdminPage = openAdminPage;
window.verifyAdminLogin = verifyAdminLogin;
window.logoutAdmin = logoutAdmin;
window.handleStudentSearch = handleStudentSearch;
window.handleAdminScan = handleAdminScan;
window.addNewStudent = addNewStudent;
window.addAchievement = addAchievement;
window.adjustAttendanceMetric = adjustAttendanceMetric;
window.deleteStudent = deleteStudent;
window.exportToExcelCSV = exportToExcelCSV;
window.exportBackupJSON = exportBackupJSON;
window.triggerBackupRestore = triggerBackupRestore;
window.importBackupJSON = importBackupJSON;
window.clearAllStudents = clearAllStudents;
window.viewStudentFromAdmin = viewStudentFromAdmin;
window.startCameraScanner = startCameraScanner;
