"use strict";
const STORAGE_KEY = "smart_school_id_v5";

const defaultStudents = [
    {
        id: "STU-101",
        name: "محمد أحمد العتيبي",
        grade: "الثالث ثانوي",
        presentDays: 42,
        absentDays: 1,
        attendanceLogs: ["الأحد - 06:55 ص", "الإثنين - 06:50 ص"],
        achievements: [
            { title: "المركز الأول في مسابقة الروبوت والذكاء الاصطناعي", date: "2026-11-15" },
            { title: "شهادة الطالب المثالي في الانضباط المدرسي", date: "2026-10-10" }
        ]
    }
];

function loadStudentsFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.error("Storage read error:", e);
    }
    return JSON.parse(JSON.stringify(defaultStudents));
}

let students = loadStudentsFromStorage();
let lastScanTime = 0;

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
    } catch (e) {
        console.error("Storage save error:", e);
    }
    renderAdminTable();
    populateStudentSelect();
}

function encodeStudentCompact(student) {
    const arr = [
        student.id,
        student.name,
        student.grade,
        student.presentDays,
        student.absentDays,
        student.achievements.map(a => `${a.title}|${a.date}`),
        student.attendanceLogs.slice(0, 3)
    ];
    return btoa(unescape(encodeURIComponent(JSON.stringify(arr))));
}

function decodeStudentCompact(encoded) {
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

function generateStudentProfileUrl(student) {
    const baseUrl = window.location.href.split("?")[0];
    const compactData = encodeStudentCompact(student);
    return `${baseUrl}?id=${encodeURIComponent(student.id)}&d=${encodeURIComponent(compactData)}`;
}

function extractStudentId(scannedData) {
    const clean = scannedData.trim();
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

function isSchoolDay() {
    const dayOfWeek = new Date().getDay();
    return dayOfWeek >= 0 && dayOfWeek <= 4;
}

function switchTab(tabName) {
    var _a, _b, _c;
    document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));

    const targetSection = document.getElementById(`${tabName}-section`);
    if (targetSection) targetSection.classList.add("active");

    const buttons = document.querySelectorAll(".tab-btn");
    if (tabName === "gate") (_a = buttons[0]) === null || _a === void 0 ? void 0 : _a.classList.add("active");
    if (tabName === "profile") (_b = buttons[1]) === null || _b === void 0 ? void 0 : _b.classList.add("active");
    if (tabName === "admin") (_c = buttons[2]) === null || _c === void 0 ? void 0 : _c.classList.add("active");
}

function recordAttendance(rawInput) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("id") || urlParams.has("d")) return;

    const resultBox = document.getElementById("scan-result");
    resultBox.classList.remove("hidden", "success", "error", "warning");

    const demoCheckbox = document.getElementById("demo-mode-checkbox");
    const isDemoMode = demoCheckbox ? demoCheckbox.checked : false;

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
        resultBox.innerText = `❌ الباركود غير مسجل في النظام: ${studentId}`;
        return;
    }

    const now = new Date();
    const dayName = now.toLocaleDateString("ar-SA", { weekday: "long" });
    const timeString = `${dayName} (${now.toLocaleDateString("ar-SA")}) - ${now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;

    student.presentDays += 1;
    student.attendanceLogs.unshift(timeString);
    saveData();

    resultBox.classList.add("success");
    resultBox.innerHTML = `✅ تم تسجيل حضور الطالب: <strong>${student.name}</strong> (${student.grade})<br>الوقت: ${timeString}`;
}

function handleManualScan() {
    const input = document.getElementById("manual-id-input");
    if (input.value) {
        recordAttendance(input.value);
        input.value = "";
    }
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
        text: generateStudentProfileUrl(student),
        width: 165,
        height: 165,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
    });

    const achList = document.getElementById("p-achievements-list");
    achList.innerHTML = student.achievements.length
        ? student.achievements.map(a => `<li>🏆 <strong>${a.title}</strong> <span style="color:#64748b; font-size:0.85rem;">(${a.date})</span></li>`).join("")
        : "<li>لا توجد إنجازات مسجلة بعد.</li>";

    const logsList = document.getElementById("p-logs-list");
    logsList.innerHTML = student.attendanceLogs.length
        ? student.attendanceLogs.slice(0, 7).map(log => `<li>✅ حضور: ${log}</li>`).join("")
        : "<li>لا يوجد سجل حضور بعد.</li>";
}

function handleProfileSearch() {
    const input = document.getElementById("profile-search-input");
    loadStudentProfileById(input.value);
}

function loadStudentProfileById(rawId) {
    const targetId = extractStudentId(rawId);
    const student = students.find(s => s.id === targetId);
    if (!student) {
        alert("رقم الطالب غير موجود في السجل!");
        document.getElementById("student-profile-view").classList.add("hidden");
        return;
    }
    renderStudentCard(student);
}

function updateAbsence(studentId, change) {
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.absentDays = Math.max(0, student.absentDays + change);
        saveData();
    }
}

function addNewStudent(event) {
    event.preventDefault();
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

    saveData();
    event.target.reset();
    alert(`تم حفظ الطالب ${name} وإنشاء الباركود الخاص به!`);
}

function addAchievement(event) {
    event.preventDefault();
    const studentId = document.getElementById("select-student").value;
    const title = document.getElementById("ach-title").value.trim();
    const date = document.getElementById("ach-date").value;

    const student = students.find(s => s.id === studentId);
    if (student) {
        student.achievements.unshift({ title, date });
        saveData();
        event.target.reset();
        alert("تمت إضافة الإنجاز وحفظه في ملف الطالب!");
    }
}

function resetSystemData() {
    if (confirm("هل تريد استعادة البيانات الافتراضية للنظام؟")) {
        localStorage.removeItem(STORAGE_KEY);
        students = loadStudentsFromStorage();
        saveData();
    }
}

function renderAdminTable() {
    const tbody = document.getElementById("admin-students-tbody");
    if (!tbody) return;
    tbody.innerHTML = students.map(s => `
        <tr>
            <td><strong>${s.id}</strong></td>
            <td>${s.name}</td>
            <td>${s.grade}</td>
            <td>${s.presentDays} يوم</td>
            <td>
                <div class="absent-controls">
                    <button class="btn-mini plus" title="إضافة يوم غياب" onclick="updateAbsence('${s.id}', 1)">+</button>
                    <strong>${s.absentDays}</strong>
                    <button class="btn-mini minus" title="إنقاص يوم غياب" onclick="updateAbsence('${s.id}', -1)">-</button>
                </div>
            </td>
            <td>
                <button class="btn primary" style="padding: 0.35rem 0.75rem; font-size:0.85rem;" 
                onclick="switchTab('profile'); loadStudentProfileById('${s.id}')">عرض الباركود والملف</button>
            </td>
        </tr>
    `).join("");
}

function populateStudentSelect() {
    const select = document.getElementById("select-student");
    if (!select) return;
    select.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join("");
}

window.addEventListener("DOMContentLoaded", () => {
    var _a, _b, _c, _d;
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get("id");
    const compactData = urlParams.get("d");

    if (studentId || compactData) {
        (_a = document.getElementById("main-navbar")) === null || _a === void 0 ? void 0 : _a.remove();
        (_b = document.getElementById("profile-search-bar")) === null || _b === void 0 ? void 0 : _b.remove();
        (_c = document.getElementById("gate-section")) === null || _c === void 0 ? void 0 : _c.remove();
        (_d = document.getElementById("admin-section")) === null || _d === void 0 ? void 0 : _d.remove();
        switchTab("profile");

        let targetStudent = studentId ? students.find(s => s.id === studentId.toUpperCase()) : undefined;
        if (!targetStudent && compactData) {
            const decoded = decodeStudentCompact(compactData);
            if (decoded) targetStudent = decoded;
        }

        if (targetStudent) {
            renderStudentCard(targetStudent);
        } else {
            alert("تعذر قراءة بيانات الطالب.");
        }
        return;
    }

    saveData();

    const dayBanner = document.getElementById("current-day-banner");
    if (dayBanner) {
        const dayName = new Date().toLocaleDateString("ar-SA", { weekday: "long" });
        dayBanner.innerHTML = !isSchoolDay()
            ? `اليوم: <strong>${dayName}</strong> (عطلة رسمية - التحضير متوقف تلقائياً)`
            : `اليوم: <strong>${dayName}</strong> (يوم دراسي - ماسح البوابة نشط)`;
    }

    try {
        const html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 220 }, false);
        html5QrcodeScanner.render((decodedText) => {
            const nowMs = Date.now();
            if (nowMs - lastScanTime > 3000) {
                lastScanTime = nowMs;
                recordAttendance(decodedText);
            }
        });
    } catch (e) {
        console.log("الكاميرا غير متاحة.");
    }
});

window.switchTab = switchTab;
window.handleManualScan = handleManualScan;
window.handleProfileSearch = handleProfileSearch;
window.loadStudentProfileById = loadStudentProfileById;
window.addNewStudent = addNewStudent;
window.addAchievement = addAchievement;
window.updateAbsence = updateAbsence;
window.resetSystemData = resetSystemData;
