"use strict";
const STUDENTS_KEY = "athar_students_v3";
const REQUESTS_KEY = "athar_requests_v3";
const SUPERVISORS_KEY = "athar_supervisors_v3";
const MIN_ALLOWED_DATE = "2025-01-01";

const FOUNDER_ACCOUNTS = [
    { name: "فايز الحربي", password: "2443422", isFounder: true },
    { name: "علي المتحمي", password: "2443422", isFounder: true }
];

const INTERNAL_HOLIDAY_RANGES = [
    { start: "2026-12-13", end: "2026-12-13" },
    { start: "2027-01-01", end: "2027-01-09" },
    { start: "2027-02-22", end: "2027-02-22" },
    { start: "2027-03-05", end: "2027-03-15" },
    { start: "2027-05-14", end: "2027-05-22" },
    { start: "2027-05-28", end: "2027-08-21" }
];

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23e2e8f0'/><circle cx='50' cy='38' r='18' fill='%2364748b'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2364748b'/></svg>";

let students = loadJson(STUDENTS_KEY, []);
let studentRequests = loadJson(REQUESTS_KEY, []);
let supervisors = loadSupervisors();

let currentAdmin = null;
let currentViewedStudentId = "";
let html5QrScanner = null;
let isCameraRunning = false;
let lastScanCode = "";
let lastScanTime = 0;

function loadJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.error(e);
    }
    return fallback;
}

function loadSupervisors() {
    const saved = loadJson(SUPERVISORS_KEY, []);
    const nonFounders = saved.filter(s => !s.isFounder && !FOUNDER_ACCOUNTS.some(f => f.name === s.name));
    return [...FOUNDER_ACCOUNTS, ...nonFounders];
}

function saveSupervisors() {
    const nonFounders = supervisors.filter(s => !s.isFounder);
    localStorage.setItem(SUPERVISORS_KEY, JSON.stringify(nonFounders));
    renderSupervisorsTable();
}

function saveStudents() {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
    renderAdminTable();
    populateStudentSelect();
}

function saveRequests() {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(studentRequests));
    renderAdminRequests();
}

function getTodayDateISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function configureDateConstraints() {
    const today = getTodayDateISO();
    ["ach-date", "req-ach-date", "req-excuse-date"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.min = MIN_ALLOWED_DATE;
            el.max = today;
        }
    });
}

function isValidHistoricalDate(dateStr) {
    const today = getTodayDateISO();
    return Boolean(dateStr) && dateStr >= MIN_ALLOWED_DATE && dateStr <= today;
}

function checkNonSchoolDay() {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6) return true;

    const todayISO = getTodayDateISO();
    return INTERNAL_HOLIDAY_RANGES.some(r => todayISO >= r.start && todayISO <= r.end);
}

function generateSharpQrDataUrl(studentId, size = 220) {
    const baseUrl = window.location.href.split("?")[0];
    const qrValue = `${baseUrl}?id=${encodeURIComponent(studentId.trim().toUpperCase())}`;

    if (typeof QRious !== "undefined") {
        const qr = new QRious({
            value: qrValue,
            size: size,
            level: "M",
            padding: 16,
            background: "#ffffff",
            foreground: "#000000"
        });
        return qr.toDataURL("image/png");
    }
    return "";
}

function renderLinearBarcode(svgElementId, studentId) {
    const svgEl = document.getElementById(svgElementId);
    if (svgEl && typeof JsBarcode !== "undefined") {
        try {
            JsBarcode(svgEl, studentId.trim().toUpperCase(), {
                format: "CODE128",
                lineColor: "#000000",
                width: 2,
                height: 44,
                displayValue: true,
                fontSize: 13,
                margin: 4
            });
        } catch (e) {
            console.error(e);
        }
    }
}

function extractStudentId(input) {
    const clean = input.trim();
    if (clean.includes("id=")) {
        try {
            const url = new URL(clean);
            return (url.searchParams.get("id") || "").toUpperCase();
        } catch (_a) {
            const match = clean.match(/id=([^&\s]+)/i);
            return match ? decodeURIComponent(match[1]).toUpperCase() : "";
        }
    }
    return clean.toUpperCase();
}

function showPage(pageId) {
    var _a;
    document.querySelectorAll(".page-view").forEach(el => el.classList.remove("active"));
    (_a = document.getElementById(pageId)) === null || _a === void 0 ? void 0 : _a.classList.add("active");

    const backBtn = document.getElementById("header-back-btn");
    if (backBtn) {
        backBtn.style.display = pageId === "portal-landing-page" ? "none" : "inline-flex";
    }
}

function goToPortalHome() {
    stopCameraScanner();
    showPage("portal-landing-page");
}

function openStudentPortal() {
    showPage("student-page");
    configureDateConstraints();
}

function openLeaderboardPage() {
    showPage("leaderboard-page");
    renderLeaderboard();
}

function openAdminPortal() {
    if (currentAdmin) {
        showPage("admin-dashboard-page");
        setupAdminDashboard();
    } else {
        showPage("admin-login-page");
    }
}

function verifyAdminLogin(event) {
    event.preventDefault();
    const nameInput = document.getElementById("admin-name-input").value.trim();
    const passInput = document.getElementById("admin-password-input").value;
    const errorBox = document.getElementById("login-error");

    const matchedAdmin = supervisors.find(s => s.name === nameInput && s.password === passInput);
    if (matchedAdmin) {
        currentAdmin = matchedAdmin;
        errorBox.classList.add("hidden");
        document.getElementById("admin-name-input").value = "";
        document.getElementById("admin-password-input").value = "";
        showPage("admin-dashboard-page");
        setupAdminDashboard();
    } else {
        errorBox.classList.remove("hidden");
    }
}

function setupAdminDashboard() {
    if (!currentAdmin) return;
    configureDateConstraints();

    const badge = document.getElementById("active-admin-badge");
    if (badge) {
        badge.innerText = `${currentAdmin.name} ${currentAdmin.isFounder ? "(مؤسس النظام)" : "(مشرف)"}`;
    }

    const foundersSection = document.getElementById("founders-supervisors-section");
    if (foundersSection) {
        if (currentAdmin.isFounder) {
            foundersSection.classList.remove("hidden");
            renderSupervisorsTable();
        } else {
            foundersSection.classList.add("hidden");
        }
    }

    renderAdminTable();
    populateStudentSelect();
    renderStudentIdCards();
    renderAdminRequests();
    updateDayBanner();

    const laserInput = document.getElementById("manual-id-input");
    if (laserInput) setTimeout(() => laserInput.focus(), 100);
}

function logoutAdmin() {
    currentAdmin = null;
    stopCameraScanner();
    goToPortalHome();
}

function renderLeaderboard() {
    var _a, _b;
    const gradeFilter = ((_a = document.getElementById("lb-grade-filter")) === null || _a === void 0 ? void 0 : _a.value) || "ALL";
    const classFilter = ((_b = document.getElementById("lb-class-filter")) === null || _b === void 0 ? void 0 : _b.value) || "ALL";

    const filtered = students
        .filter(s => (gradeFilter === "ALL" || s.grade === gradeFilter) && (classFilter === "ALL" || (s.classroom || "1") === classFilter))
        .sort((a, b) => {
            if (b.presentDays !== a.presentDays) return b.presentDays - a.presentDays;
            const totalA = a.presentDays + a.excusedAbsentDays + a.unexcusedAbsentDays;
            const totalB = b.presentDays + b.excusedAbsentDays + b.unexcusedAbsentDays;
            const rateA = totalA > 0 ? a.presentDays / totalA : 1;
            const rateB = totalB > 0 ? b.presentDays / totalB : 1;
            if (rateB !== rateA) return rateB - rateA;
            return b.achievements.length - a.achievements.length;
        });

    const podium = document.getElementById("leaderboard-podium");
    const tbody = document.getElementById("leaderboard-tbody");

    if (filtered.length === 0) {
        podium.innerHTML = "";
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:1.5rem;">لا يوجد طلاب مطابقون للتصفية الحالية.</td></tr>`;
        return;
    }

    const medals = ["🥇 المركز الأول", "🥈 المركز الثاني", "🥉 المركز الثالث"];
    podium.innerHTML = filtered.slice(0, 3).map((s, idx) => `
        <div class="podium-card">
            <div class="podium-rank">${medals[idx]}</div>
            <h4>${s.name}</h4>
            <p class="muted-text" style="margin-bottom:0.4rem;">${s.grade} — فصل ${s.classroom || "1"}</p>
            <strong style="color:var(--teal); font-size:1.1rem;">${s.presentDays} يوم حضور</strong>
        </div>
    `).join("");

    tbody.innerHTML = filtered.map((s, idx) => {
        const total = s.presentDays + s.excusedAbsentDays + s.unexcusedAbsentDays;
        const rate = total > 0 ? Math.round((s.presentDays / total) * 100) : 100;
        const absentTotal = s.excusedAbsentDays + s.unexcusedAbsentDays;
        return `
            <tr>
                <td><strong>#${idx + 1}</strong></td>
                <td><strong>${s.name}</strong></td>
                <td>${s.grade} — فصل ${s.classroom || "1"}</td>
                <td><strong style="color:var(--teal);">${s.presentDays}</strong></td>
                <td>${absentTotal}</td>
                <td><strong>${rate}%</strong></td>
                <td>🏆 ${s.achievements.length}</td>
            </tr>
        `;
    }).join("");
}

function renderStudentCard(student) {
    currentViewedStudentId = student.id;
    const profileView = document.getElementById("student-profile-view");
    profileView.classList.remove("hidden");
    configureDateConstraints();

    document.getElementById("p-name").innerText = student.name;
    document.getElementById("p-grade-class").innerText = `${student.grade} — فصل ${student.classroom || "1"}`;
    document.getElementById("p-id").innerText = student.id;
    document.getElementById("p-present").innerText = student.presentDays.toString();
    document.getElementById("p-excused").innerText = student.excusedAbsentDays.toString();
    document.getElementById("p-unexcused").innerText = student.unexcusedAbsentDays.toString();

    const avatarImg = document.getElementById("p-avatar");
    if (avatarImg) avatarImg.src = student.photo || DEFAULT_AVATAR;

    const totalDays = student.presentDays + student.excusedAbsentDays + student.unexcusedAbsentDays;
    const rate = totalDays > 0 ? Math.round((student.presentDays / totalDays) * 100) : 100;
    document.getElementById("p-rate").innerText = `${rate}%`;

    const qrImg = document.getElementById("p-qrcode-img");
    if (qrImg) qrImg.src = generateSharpQrDataUrl(student.id, 220);
    renderLinearBarcode("p-barcode-svg", student.id);

    const achList = document.getElementById("p-achievements-list");
    achList.innerHTML = student.achievements.length
        ? student.achievements.map(a => `<li>🏆 <strong>${a.title}</strong> <span style="color:#64748b; font-size:0.85rem;">(بتاريخ: ${a.date})</span></li>`).join("")
        : "<li>لا توجد إنجازات معتمدة حتى الآن.</li>";

    const logsList = document.getElementById("p-logs-list");
    logsList.innerHTML = student.attendanceLogs.length
        ? student.attendanceLogs.slice(0, 15).map(log => `<li>${log}</li>`).join("")
        : "<li>لا يوجد سجل حضور أو غياب مسجل بعد.</li>";
}

function handleStudentSearch() {
    const input = document.getElementById("student-search-input");
    const targetId = extractStudentId(input.value);
    const student = students.find(s => s.id === targetId);

    if (!student) {
        alert("الرقم المدرسي غير مسجل في منصة أثر!");
        document.getElementById("student-profile-view").classList.add("hidden");
        return;
    }
    renderStudentCard(student);
}

function printStudentSingleCard() {
    document.body.classList.add("printing-single-card");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-single-card"), 500);
}

function handleStudentPhotoUpload(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file || !currentViewedStudentId) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 180;
            canvas.height = 180;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(img, 0, 0, 180, 180);
                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.78);
                const student = students.find(s => s.id === currentViewedStudentId);
                if (student) {
                    student.photo = compressedBase64;
                    saveStudents();
                    renderStudentCard(student);
                    alert("✅ تم تحديث صورتك الشخصية في بطاقة الهوية بنجاح!");
                }
            }
        };
        img.src = String((e.target && e.target.result) || "");
    };
    reader.readAsDataURL(file);
}

function submitStudentRequest(event, type) {
    event.preventDefault();
    const student = students.find(s => s.id === currentViewedStudentId);
    if (!student) return;

    const titleEl = document.getElementById(type === "ACHIEVEMENT" ? "req-ach-title" : "req-excuse-reason");
    const dateEl = document.getElementById(type === "ACHIEVEMENT" ? "req-ach-date" : "req-excuse-date");

    if (!isValidHistoricalDate(dateEl.value)) {
        alert(`⚠️ التاريخ غير صحيح! يجب أن يكون بين ${MIN_ALLOWED_DATE} وتاريخ اليوم (${getTodayDateISO()}).`);
        return;
    }

    const req = {
        id: "REQ-" + Date.now(),
        studentId: student.id,
        studentName: student.name,
        type,
        title: titleEl.value.trim(),
        date: dateEl.value,
        submittedAt: getFormattedNow()
    };

    studentRequests.unshift(req);
    saveRequests();
    event.target.reset();
    alert(type === "ACHIEVEMENT"
        ? "✅ تم إرسال طلب توثيق الإنجاز إلى المشرف للمراجعة والاعتماد!"
        : "✅ تم رفع عذر الغياب إلى المشرف بنجاح!");
}

function getFormattedNow() {
    const now = new Date();
    const dayName = now.toLocaleDateString("ar-SA", { weekday: "long" });
    return `${dayName} ${getTodayDateISO()} — الساعة ${now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
}

function playBeep(success) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = success ? 880 : 320;
        gain.gain.value = 0.12;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, success ? 150 : 300);
    } catch (_a) {}
}

function recordAttendanceByScanner(rawInput) {
    var _a;
    if (!currentAdmin) return;

    const resultBox = document.getElementById("scan-result");
    resultBox.classList.remove("hidden", "success", "error", "warning");

    const isDemoMode = (_a = document.getElementById("demo-mode-checkbox")) === null || _a === void 0 ? void 0 : _a.checked;
    if (checkNonSchoolDay() && !isDemoMode) {
        playBeep(false);
        resultBox.classList.add("warning");
        resultBox.innerHTML = `⛔ اليوم إجازة — التحضير التلقائي متوقف.`;
        return;
    }

    const studentId = extractStudentId(rawInput);
    const student = students.find(s => s.id === studentId);

    if (!student) {
        playBeep(false);
        resultBox.classList.add("error");
        resultBox.innerText = `❌ هذا الباركود غير مسجل في منصة أثر: ${studentId}`;
        return;
    }

    const todayISO = getTodayDateISO();
    if (student.lastAttendedDate === todayISO) {
        playBeep(false);
        resultBox.classList.add("warning");
        resultBox.innerHTML = `⚠️ الطالب <strong>${student.name}</strong> (${student.id}) مسجّل حضوره مسبقاً اليوم (${todayISO}).`;
        return;
    }

    const timeString = getFormattedNow();
    student.presentDays += 1;
    student.lastAttendedDate = todayISO;
    student.attendanceLogs.unshift(`✅ حضور (قارئ الباركود): ${timeString}`);
    saveStudents();
    playBeep(true);

    resultBox.classList.add("success");
    resultBox.innerHTML = `✅ تم تسجيل حضور الطالب: <strong>${student.name}</strong> (${student.grade} - فصل ${student.classroom})<br>التاريخ: ${timeString}`;
}

function handleAdminScan() {
    const input = document.getElementById("manual-id-input");
    if (input.value.trim()) {
        recordAttendanceByScanner(input.value);
        input.value = "";
        input.focus();
    }
}

function addNewStudent(event) {
    event.preventDefault();
    if (!currentAdmin) return;

    const id = document.getElementById("new-id").value.trim().toUpperCase();
    const name = document.getElementById("new-name").value.trim();
    const grade = document.getElementById("new-grade").value;
    const classroom = document.getElementById("new-classroom").value;

    if (!grade || !classroom) {
        alert("يرجى اختيار الصف الدراسي والفصل!");
        return;
    }
    if (students.some(s => s.id === id)) {
        alert("الرقم المدرسي مسجل مسبقاً!");
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
    alert(`✅ تم تسجيل الطالب ${name} وإصدار بطاقة أثر بنجاح!`);
}

function addAchievement(event) {
    event.preventDefault();
    if (!currentAdmin) return;

    const studentId = document.getElementById("select-student").value;
    const title = document.getElementById("ach-title").value.trim();
    const date = document.getElementById("ach-date").value;

    if (!studentId) {
        alert("يرجى تسجيل طالب أولاً!");
        return;
    }
    if (!isValidHistoricalDate(date)) {
        alert(`⚠️ التاريخ غير صحيح! يجب أن يكون بين ${MIN_ALLOWED_DATE} وتاريخ اليوم (${getTodayDateISO()}).`);
        return;
    }

    const student = students.find(s => s.id === studentId);
    if (student) {
        student.achievements.unshift({ title, date });
        saveStudents();
        event.target.reset();
        alert("✅ تم توثيق الإنجاز في سجل الطالب بنجاح!");
    }
}

function renderAdminRequests() {
    const container = document.getElementById("admin-requests-list");
    const countBadge = document.getElementById("pending-requests-count");
    if (!container) return;

    if (countBadge) countBadge.innerText = `${studentRequests.length} طلبات`;

    if (studentRequests.length === 0) {
        container.innerHTML = `<p class="muted-text" style="margin-bottom:0;">لا توجد طلبات معلقة من الطلاب حالياً.</p>`;
        return;
    }

    container.innerHTML = studentRequests.map(r => `
        <div class="request-item-card">
            <span class="gateway-badge ${r.type === 'EXCUSE' ? 'honor-b' : ''}" style="margin-bottom:0.5rem;">
                ${r.type === "ACHIEVEMENT" ? "🏅 طلب إنجاز" : "📝 عذر غياب"}
            </span>
            <h4 style="color:var(--navy-dark);">${r.studentName} (${r.studentId})</h4>
            <p style="font-size:0.9rem; margin:0.3rem 0;"><strong>التفاصيل:</strong> ${r.title}</p>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.8rem;"><strong>التاريخ:</strong> ${r.date}</p>
            <div style="display:flex; gap:0.5rem;">
                <button type="button" class="btn btn-success" style="padding:0.4rem 0.8rem; font-size:0.85rem;" onclick="approveStudentRequest('${r.id}')">✅ اعتماد</button>
                <button type="button" class="btn btn-danger-outline" style="padding:0.4rem 0.8rem; font-size:0.85rem;" onclick="rejectStudentRequest('${r.id}')">✖ رفض</button>
            </div>
        </div>
    `).join("");
}

function approveStudentRequest(reqId) {
    if (!currentAdmin) return;
    const req = studentRequests.find(r => r.id === reqId);
    if (!req) return;

    const student = students.find(s => s.id === req.studentId);
    if (student) {
        if (req.type === "ACHIEVEMENT") {
            student.achievements.unshift({ title: req.title, date: req.date });
        } else {
            student.excusedAbsentDays += 1;
            student.attendanceLogs.unshift(`🟡 غياب بعذر معتمد (${req.title}) — بتاريخ ${req.date} (اعتماد: ${currentAdmin.name})`);
        }
        saveStudents();
    }

    studentRequests = studentRequests.filter(r => r.id !== reqId);
    saveRequests();
}

function rejectStudentRequest(reqId) {
    if (!currentAdmin) return;
    studentRequests = studentRequests.filter(r => r.id !== reqId);
    saveRequests();
}

function adjustAttendanceMetric(studentId, field, change) {
    if (!currentAdmin) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const currentVal = student[field] || 0;
    const nextVal = Math.max(0, currentVal + change);
    if (nextVal === currentVal) return;

    student[field] = nextVal;
    const timeString = getFormattedNow();

    if (change > 0) {
        if (field === "presentDays") {
            student.attendanceLogs.unshift(`✅ حضور يدوي: ${timeString} (بواسطة: ${currentAdmin.name})`);
        } else if (field === "excusedAbsentDays") {
            student.attendanceLogs.unshift(`🟡 غياب بعذر: ${timeString} (بواسطة: ${currentAdmin.name})`);
        } else if (field === "unexcusedAbsentDays") {
            student.attendanceLogs.unshift(`🔴 غياب بدون عذر: ${timeString} (بواسطة: ${currentAdmin.name})`);
        }
    } else if (field === "presentDays" && nextVal === 0) {
        student.lastAttendedDate = "";
    }

    saveStudents();
}

function openEditStudentModal(studentId) {
    var _a;
    if (!currentAdmin) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById("edit-stu-id").value = student.id;
    document.getElementById("edit-stu-name").value = student.name;
    document.getElementById("edit-stu-grade").value = student.grade;
    document.getElementById("edit-stu-classroom").value = student.classroom || "1";
    document.getElementById("edit-stu-present").value = String(student.presentDays);
    document.getElementById("edit-stu-excused").value = String(student.excusedAbsentDays);
    document.getElementById("edit-stu-unexcused").value = String(student.unexcusedAbsentDays);
    document.getElementById("edit-stu-note").value = "";

    (_a = document.getElementById("edit-student-modal")) === null || _a === void 0 ? void 0 : _a.classList.remove("hidden");
}

function closeEditModal() {
    var _a;
    (_a = document.getElementById("edit-student-modal")) === null || _a === void 0 ? void 0 : _a.classList.add("hidden");
}

function saveEditedStudent(event) {
    event.preventDefault();
    if (!currentAdmin) return;

    const id = document.getElementById("edit-stu-id").value;
    const student = students.find(s => s.id === id);
    if (!student) return;

    student.name = document.getElementById("edit-stu-name").value.trim();
    student.grade = document.getElementById("edit-stu-grade").value;
    student.classroom = document.getElementById("edit-stu-classroom").value;
    student.presentDays = Math.max(0, Number(document.getElementById("edit-stu-present").value) || 0);
    student.excusedAbsentDays = Math.max(0, Number(document.getElementById("edit-stu-excused").value) || 0);
    student.unexcusedAbsentDays = Math.max(0, Number(document.getElementById("edit-stu-unexcused").value) || 0);

    const note = document.getElementById("edit-stu-note").value.trim();
    student.attendanceLogs.unshift(`✏️ تعديل سجل (${note || "تصحيح بيانات التحضير"}): ${getFormattedNow()} — المشرف: ${currentAdmin.name}`);

    saveStudents();
    renderStudentIdCards();
    closeEditModal();
    alert("✅ تم حفظ التعديلات وتحديث سجل الطالب بنجاح!");
}

function deleteStudent(studentId) {
    if (!currentAdmin) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    if (!confirm(`⚠️ تأكيد الحذف:\nهل أنت متأكد من حذف الطالب "${student.name}" (${student.id}) وجميع سجلاته نهائياً؟`)) {
        return;
    }

    students = students.filter(s => s.id !== studentId);
    saveStudents();
    renderStudentIdCards();
}

function addNewSupervisor(event) {
    event.preventDefault();
    if (!currentAdmin || !currentAdmin.isFounder) return;

    const name = document.getElementById("sup-new-name").value.trim();
    const password = document.getElementById("sup-new-pass").value.trim();

    if (supervisors.some(s => s.name === name)) {
        alert("اسم المشرف موجود مسبقاً!");
        return;
    }

    supervisors.push({ name, password, isFounder: false });
    saveSupervisors();
    event.target.reset();
    alert(`✅ تمت إضافة المشرف "${name}" بنجاح!`);
}

function removeSupervisor(supName) {
    if (!currentAdmin || !currentAdmin.isFounder) return;

    const target = supervisors.find(s => s.name === supName);
    if (!target) return;

    if (target.isFounder) {
        alert("⛔ حسابات المؤسسين (فايز الحربي وعلي المتحمي) محمية ولا يمكن إزالتها نهائياً!");
        return;
    }

    if (!confirm(`هل أنت متأكد من إزالة المشرف "${supName}"؟`)) return;
    supervisors = supervisors.filter(s => s.name !== supName);
    saveSupervisors();
}

function renderSupervisorsTable() {
    const tbody = document.getElementById("supervisors-tbody");
    if (!tbody || !currentAdmin || !currentAdmin.isFounder) return;

    tbody.innerHTML = supervisors.map(s => `
        <tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.isFounder ? "👑 مؤسس النظام (صلاحية كاملة محمية)" : "🛡️ مشرف مدرسي"}</td>
            <td>
                ${s.isFounder
                    ? `<span style="color:var(--teal); font-weight:700;">🔒 محمي</span>`
                    : `<button type="button" class="btn btn-danger-outline" onclick="removeSupervisor('${s.name}')">🗑️ إزالة المشرف</button>`
                }
            </td>
        </tr>
    `).join("");
}

function exportToExcelCSV() {
    if (!currentAdmin) return;
    if (students.length === 0) {
        alert("لا يوجد طلاب مسجلون لتصديرهم!");
        return;
    }

    const headers = ["رقم الطالب", "اسم الطالب", "الصف", "الفصل", "أيام الحضور", "غياب بعذر", "غياب بدون عذر", "نسبة الانتظام", "الإنجازات"];
    const rows = students.map(s => {
        const total = s.presentDays + s.excusedAbsentDays + s.unexcusedAbsentDays;
        const rate = total > 0 ? Math.round((s.presentDays / total) * 100) : 100;
        return [
            `"${s.id}"`,
            `"${s.name.replace(/"/g, '""')}"`,
            `"${s.grade}"`,
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
    link.download = `أثر_تقرير_الانتظام_${getTodayDateISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportBackupJSON() {
    if (!currentAdmin) return;
    const backupData = {
        platform: "أثر",
        school: "مدرسة الموهوبين التقنية",
        exportedAt: new Date().toISOString(),
        students,
        supervisors: supervisors.filter(s => !s.isFounder)
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
    if (!currentAdmin) return;
    const fileInput = document.getElementById("restore-backup-input");
    if (fileInput) { fileInput.value = ""; fileInput.click(); }
}

function importBackupJSON(event) {
    if (!currentAdmin) return;
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
            if (!confirm(`سيتم استبدال البيانات الحالية بـ (${restoredList.length}) طالب. هل تريد المتابعة؟`)) return;

            students = restoredList.map((s) => ({
                id: String(s.id || "").toUpperCase(),
                name: String(s.name || ""),
                grade: String(s.grade || "الأول ثانوي"),
                classroom: String(s.classroom || "1"),
                photo: s.photo || "",
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
            alert("❌ خطأ أثناء قراءة ملف النسخة الاحتياطية.");
        }
    };
    reader.readAsText(file);
}

function viewStudentFromAdmin(studentId) {
    const student = students.find(s => s.id === studentId);
    if (student) {
        openStudentPortal();
        renderStudentCard(student);
    }
}

function renderAdminTable() {
    const tbody = document.getElementById("admin-students-tbody");
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:1.5rem;">لا يوجد طلاب مسجلون حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => `
        <tr>
            <td><strong>${s.id}</strong></td>
            <td>${s.name}</td>
            <td>${s.grade} — فصل ${s.classroom || "1"}</td>
            <td>
                <div class="absent-controls">
                    <button type="button" class="btn-mini present" onclick="adjustAttendanceMetric('${s.id}', 'presentDays', 1)">+</button>
                    <strong>${s.presentDays}</strong>
                    <button type="button" class="btn-mini neutral" onclick="adjustAttendanceMetric('${s.id}', 'presentDays', -1)">-</button>
                </div>
            </td>
            <td>
                <div class="absent-controls">
                    <button type="button" class="btn-mini excused" onclick="adjustAttendanceMetric('${s.id}', 'excusedAbsentDays', 1)">+</button>
                    <strong>${s.excusedAbsentDays}</strong>
                    <button type="button" class="btn-mini neutral" onclick="adjustAttendanceMetric('${s.id}', 'excusedAbsentDays', -1)">-</button>
                </div>
            </td>
            <td>
                <div class="absent-controls">
                    <button type="button" class="btn-mini danger" onclick="adjustAttendanceMetric('${s.id}', 'unexcusedAbsentDays', 1)">+</button>
                    <strong>${s.unexcusedAbsentDays}</strong>
                    <button type="button" class="btn-mini neutral" onclick="adjustAttendanceMetric('${s.id}', 'unexcusedAbsentDays', -1)">-</button>
                </div>
            </td>
            <td>
                <div style="display:flex; gap:0.35rem; align-items:center;">
                    <button type="button" class="btn btn-primary" style="padding:0.35rem 0.65rem; font-size:0.82rem;" onclick="viewStudentFromAdmin('${s.id}')">الملف</button>
                    <button type="button" class="btn btn-outline" style="padding:0.35rem 0.65rem; font-size:0.82rem;" onclick="openEditStudentModal('${s.id}')">✏️ تعديل</button>
                    <button type="button" class="btn btn-danger-outline" style="padding:0.35rem 0.65rem; font-size:0.82rem;" onclick="deleteStudent('${s.id}')">🗑️ حذف</button>
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

    const qrDataUrl = generateSharpQrDataUrl(student.id, 220);

    const card = document.createElement("div");
    card.className = "student-id-card";
    card.innerHTML = `
        <div class="id-card-top">✨ منصة أثر • مدرسة الموهوبين التقنية</div>
        <div class="id-card-body">
            <h4>${student.name}</h4>
            <p style="color:var(--text-muted); font-size:0.85rem;">${student.grade} — فصل ${student.classroom || "1"}</p>
            <img src="${qrDataUrl}" alt="QR ${student.id}" class="id-card-qr-img">
            <svg id="card-1d-${student.id}" class="barcode-1d-svg"></svg>
        </div>
    `;
    grid.appendChild(card);
    renderLinearBarcode(`card-1d-${student.id}`, student.id);
}

function renderStudentIdCards() {
    const grid = document.getElementById("student-id-cards-grid");
    if (!grid) return;

    grid.innerHTML = "";
    if (students.length === 0) {
        grid.innerHTML = `<p class="empty-cards-msg" style="color:#64748b;">لا توجد بطاقات حالياً.</p>`;
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

function updateDayBanner() {
    const dayBanner = document.getElementById("current-day-banner");
    if (!dayBanner) return;

    const dayName = new Date().toLocaleDateString("ar-SA", { weekday: "long" });
    dayBanner.innerHTML = checkNonSchoolDay()
        ? `اليوم: <strong>${dayName}</strong> (${getTodayDateISO()}) — ⛔ اليوم إجازة (التحضير متوقف تلقائياً)`
        : `اليوم: <strong>${dayName}</strong> (${getTodayDateISO()}) — ✅ يوم دراسي فعلي (قارئ الباركود نشط)`;
}

function startCameraScanner() {
    if (isCameraRunning) return;
    const btn = document.getElementById("start-camera-btn");

    try {
        html5QrScanner = new Html5Qrcode("reader");
        html5QrScanner.start(
            { facingMode: "environment" },
            { fps: 12, qrbox: { width: 220, height: 220 } },
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
            if (btn) { btn.innerText = "✅ الكاميرا تعمل"; btn.disabled = true; }
        }).catch(() => {
            alert("تعذر فتح الكاميرا. استخدم قارئ الباركود الليزري مباشرة.");
        });
    } catch (_a) {
        alert("مكتبة الكاميرا غير متاحة.");
    }
}

function stopCameraScanner() {
    if (html5QrScanner && isCameraRunning) {
        html5QrScanner.stop().then(() => { isCameraRunning = false; }).catch(() => {});
    }
}

window.addEventListener("DOMContentLoaded", () => {
    var _a, _b, _c, _d, _e;
    configureDateConstraints();
    const urlParams = new URLSearchParams(window.location.search);
    const scannedStudentId = urlParams.get("id");

    if (scannedStudentId) {
        (_a = document.getElementById("portal-landing-page")) === null || _a === void 0 ? void 0 : _a.remove();
        (_b = document.getElementById("student-search-box")) === null || _b === void 0 ? void 0 : _b.remove();
        (_c = document.getElementById("admin-login-page")) === null || _c === void 0 ? void 0 : _c.remove();
        (_d = document.getElementById("admin-dashboard-page")) === null || _d === void 0 ? void 0 : _d.remove();
        (_e = document.getElementById("header-back-btn")) === null || _e === void 0 ? void 0 : _e.remove();
        showPage("student-page");

        const targetStudent = students.find(s => s.id === scannedStudentId.trim().toUpperCase());
        if (targetStudent) {
            renderStudentCard(targetStudent);
        } else {
            const studentPage = document.getElementById("student-page");
            if (studentPage) {
                studentPage.innerHTML = `<div class="panel-card"><h2>❌ سجل الطالب غير موجود</h2><p class="muted-text">الرقم المدرسي (${scannedStudentId}) غير مسجل.</p></div>`;
            }
        }
        return;
    }

    goToPortalHome();
});

window.goToPortalHome = goToPortalHome;
window.openStudentPortal = openStudentPortal;
window.openAdminPortal = openAdminPortal;
window.openLeaderboardPage = openLeaderboardPage;
window.renderLeaderboard = renderLeaderboard;
window.verifyAdminLogin = verifyAdminLogin;
window.logoutAdmin = logoutAdmin;
window.handleStudentSearch = handleStudentSearch;
window.printStudentSingleCard = printStudentSingleCard;
window.handleStudentPhotoUpload = handleStudentPhotoUpload;
window.submitStudentRequest = submitStudentRequest;
window.handleAdminScan = handleAdminScan;
window.addNewStudent = addNewStudent;
window.addAchievement = addAchievement;
window.approveStudentRequest = approveStudentRequest;
window.rejectStudentRequest = rejectStudentRequest;
window.adjustAttendanceMetric = adjustAttendanceMetric;
window.openEditStudentModal = openEditStudentModal;
window.closeEditModal = closeEditModal;
window.saveEditedStudent = saveEditedStudent;
window.deleteStudent = deleteStudent;
window.addNewSupervisor = addNewSupervisor;
window.removeSupervisor = removeSupervisor;
window.exportToExcelCSV = exportToExcelCSV;
window.exportBackupJSON = exportBackupJSON;
window.triggerBackupRestore = triggerBackupRestore;
window.importBackupJSON = importBackupJSON;
window.viewStudentFromAdmin = viewStudentFromAdmin;
window.startCameraScanner = startCameraScanner;
