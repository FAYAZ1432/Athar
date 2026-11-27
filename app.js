"use strict";
const STORAGE_KEY = "smart_school_portal_v8";
const ADMIN_PASS = "2443422";

let students = loadStudents();
let isAdminAuthenticated = false;
let scannerInstance = null;
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

function encodeStudentData(student) {
    const arr = [
        student.id,
        student.name,
        student.grade,
        student.presentDays,
        student.absentDays,
        student.achievements.map(a => `${a.title}|${a.date}`),
        student.attendanceLogs.slice(0, 4)
    ];
    return btoa(unescape(encodeURIComponent(JSON.stringify(arr))));
}

function decodeStudentData(encoded) {
    try {
        const arr = JSON.parse(decodeURIComponent(escape(atob(encoded))));
        if (!Array.isArray(arr) || arr.length < 5) return null;
        return {
            id: String(arr[0]),
            name: String(arr[1]),
            grade: String(arr[2]),
            presentDays: Number(arr[3]) || 0,
            absentDays: Number(arr[4]) || 0,
            achievements: Array.isArray(arr[5])
                ? arr[5].map(item => {
                      const [title, date] = item.split("|");
                      return { title: title || "", date: date || "" };
                  })
                : [],
            attendanceLogs: Array.isArray(arr[6]) ? arr[6] : []
        };
    } catch (_a) {
        return null;
    }
}

function generateStudentQrUrl(student) {
    const baseUrl = window.location.href.split("?")[0];
    return `${baseUrl}?id=${encodeURIComponent(student.id)}&d=${encodeURIComponent(encodeStudentData(student))}`;
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
        initAdminScanner();
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
        saveStudents();
        initAdminScanner();
    } else {
        errorBox.classList.remove("hidden");
    }
}

function logoutAdmin() {
    isAdminAuthenticated = false;
    openStudentPage();
}

function renderStudentCard(student) {
    const profileView = document.getElementById("student-profile-view");
    profileView.classList.remove("hidden");

    document.getElementById("p-name").innerText = student.name;
    document.getElementById("p-grade").innerText = student.grade;
    document.getElementById("p-id").innerText = student.id;
    document.getElementById("p-present").innerText = student.presentDays.toString();
    document.getElementById("p-absent").innerText = student.absentDays.toString();

    const totalDays = student.presentDays + student.absentDays;
    const rate = totalDays > 0 ? Math.round((student.presentDays / totalDays) * 100) : 100;
    document.getElementById("p-rate").innerText = `${rate}%`;

    const qrContainer = document.getElementById("p-qrcode");
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: generateStudentQrUrl(student),
        width: 165,
        height: 165,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
    });

    const achList = document.getElementById("p-achievements-list");
    achList.innerHTML = student.achievements.length
        ? student.achievements.map(a => `<li>🏆 <strong>${a.title}</strong> <span style="color:#64748b; font-size:0.85rem;">(${a.date})</span></li>`).join("")
        : "<li>لا توجد إنجازات مسجلة حتى الآن.</li>";

    const logsList = document.getElementById("p-logs-list");
    logsList.innerHTML = student.attendanceLogs.length
        ? student.attendanceLogs.slice(0, 7).map(log => `<li>✅ حضور: ${log}</li>`).join("")
        : "<li>لا يوجد سجل حضور مسجل بعد.</li>";
}

function handleStudentSearch() {
    const input = document.getElementById("student-search-input");
    const targetId = extractStudentId(input.value);
    const student = students.find(s => s.id === targetId);

    if (!student) {
        alert("رقم الطالب غير مسجل! يجب تسجيل الطالب أولاً من بوابة المشرف.");
        document.getElementById("student-profile-view").classList.add("hidden");
        return;
    }
    renderStudentCard(student);
}

function isSchoolDay() {
    const day = new Date().getDay();
    return day >= 0 && day <= 4;
}

function recordAttendanceByAdmin(rawInput) {
    var _a;
    if (!isAdminAuthenticated) return;

    const resultBox = document.getElementById("scan-result");
    resultBox.classList.remove("hidden", "success", "error", "warning");

    const isDemoMode = (_a = document.getElementById("demo-mode-checkbox")) === null || _a === void 0 ? void 0 : _a.checked;

    if (!isSchoolDay() && !isDemoMode) {
        const dayArabic = new Date().getDay() === 5 ? "الجمعة" : "السبت";
        resultBox.classList.add("warning");
        resultBox.innerHTML = `⛔ اليوم هو <strong>${dayArabic}</strong> (عطلة نهاية الأسبوع).<br>التحضير متاح أيام الدراسة فقط (من الأحد إلى الخميس).`;
        return;
    }

    const studentId = extractStudentId(rawInput);
    const student = students.find(s => s.id === studentId);

    if (!student) {
        resultBox.classList.add("error");
        resultBox.innerText = `❌ هذا الباركود غير مسجل في النظام: ${studentId}`;
        return;
    }

    const now = new Date();
    const dayName = now.toLocaleDateString("ar-SA", { weekday: "long" });
    const timeString = `${dayName} (${now.toLocaleDateString("ar-SA")}) - ${now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;

    student.presentDays += 1;
    student.attendanceLogs.unshift(timeString);
    saveStudents();

    resultBox.classList.add("success");
    resultBox.innerHTML = `✅ تم تسجيل حضور الطالب: <strong>${student.name}</strong> (${student.grade})<br>الوقت: ${timeString}`;
}

function handleAdminScan() {
    const input = document.getElementById("manual-id-input");
    if (input.value) {
        recordAttendanceByAdmin(input.value);
        input.value = "";
    }
}

function addNewStudent(event) {
    event.preventDefault();
    if (!isAdminAuthenticated) return;

    const id = document.getElementById("new-id").value.trim().toUpperCase();
    const name = document.getElementById("new-name").value.trim();
    const grade = document.getElementById("new-grade").value.trim();

    if (students.some(s => s.id === id)) {
        alert("رقم الطالب مسجل مسبقاً!");
        return;
    }

    students.push({
        id,
        name,
        grade,
        presentDays: 0,
        absentDays: 0,
        attendanceLogs: [],
        achievements: []
    });

    saveStudents();
    event.target.reset();
    alert(`تم تسجيل الطالب ${name} وتوليد الباركود الخاص به بنجاح!`);
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
        alert("تمت إضافة الإنجاز إلى ملف الطالب بنجاح!");
    }
}

function updateAbsence(studentId, change) {
    if (!isAdminAuthenticated) return;
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.absentDays = Math.max(0, student.absentDays + change);
        saveStudents();
    }
}

function clearAllStudents() {
    if (!isAdminAuthenticated) return;
    if (confirm("هل أنت متأكد من مسح جميع الطلاب المسجلين؟")) {
        localStorage.removeItem(STORAGE_KEY);
        students = [];
        saveStudents();
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
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b; padding:1.5rem;">لا يوجد طلاب مسجلون حالياً. قم بتسجيل الطلاب من النموذج أعلاه.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => `
        <tr>
            <td><strong>${s.id}</strong></td>
            <td>${s.name}</td>
            <td>${s.grade}</td>
            <td>${s.presentDays} يوم</td>
            <td>
                <div class="absent-controls">
                    <button class="btn-mini plus" title="إضافة غياب" onclick="updateAbsence('${s.id}', 1)">+</button>
                    <strong>${s.absentDays}</strong>
                    <button class="btn-mini minus" title="إنقاص غياب" onclick="updateAbsence('${s.id}', -1)">-</button>
                </div>
            </td>
            <td>
                <button class="btn primary" style="padding: 0.35rem 0.75rem; font-size:0.85rem;" 
                onclick="viewStudentFromAdmin('${s.id}')">فتح بطاقة الطالب والباركود</button>
            </td>
        </tr>
    `).join("");
}

function populateStudentSelect() {
    const select = document.getElementById("select-student");
    if (!select) return;
    if (students.length === 0) {
        select.innerHTML = `<option value="">-- سجل طالباً أولاً --</option>`;
        return;
    }
    select.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join("");
}

function initAdminScanner() {
    const dayBanner = document.getElementById("current-day-banner");
    if (dayBanner) {
        const dayName = new Date().toLocaleDateString("ar-SA", { weekday: "long" });
        dayBanner.innerHTML = !isSchoolDay()
            ? `اليوم: <strong>${dayName}</strong> (عطلة نهاية الأسبوع - التحضير متوقف تلقائياً)`
            : `اليوم: <strong>${dayName}</strong> (يوم دراسي - ماسح التحضير نشط)`;
    }

    if (scannerInstance) return;
    try {
        scannerInstance = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 220 }, false);
        scannerInstance.render((decodedText) => {
            const nowMs = Date.now();
            if (nowMs - lastScanTime > 3000) {
                lastScanTime = nowMs;
                recordAttendanceByAdmin(decodedText);
            }
        });
    } catch (e) {
        console.log("الكاميرا غير متاحة.");
    }
}

window.addEventListener("DOMContentLoaded", () => {
    var _a, _b, _c, _d;
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get("id");
    const encodedData = urlParams.get("d");

    if (studentId || encodedData) {
        (_a = document.getElementById("main-navbar")) === null || _a === void 0 ? void 0 : _a.remove();
        (_b = document.getElementById("student-search-box")) === null || _b === void 0 ? void 0 : _b.remove();
        (_c = document.getElementById("admin-login-page")) === null || _c === void 0 ? void 0 : _c.remove();
        (_d = document.getElementById("admin-dashboard-page")) === null || _d === void 0 ? void 0 : _d.remove();
        showPage("student-page");

        let targetStudent = studentId ? students.find(s => s.id === studentId.toUpperCase()) : undefined;
        if (!targetStudent && encodedData) {
            const decoded = decodeStudentData(encodedData);
            if (decoded) targetStudent = decoded;
        }

        if (targetStudent) {
            renderStudentCard(targetStudent);
        } else {
            alert("بيانات الطالب غير متوفرة.");
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
window.updateAbsence = updateAbsence;
window.clearAllStudents = clearAllStudents;
window.viewStudentFromAdmin = viewStudentFromAdmin;
