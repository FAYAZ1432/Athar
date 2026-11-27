interface Achievement {
    title: string;
    date: string;
}

interface Student {
    id: string;
    name: string;
    grade: string;
    presentDays: number;
    excusedAbsentDays: number;
    unexcusedAbsentDays: number;
    lastAttendedDate?: string;
    attendanceLogs: string[];
    achievements: Achievement[];
}

interface HolidayPeriod {
    name: string;
    start: string;
    end: string;
}

declare var QRCode: any;
declare var Html5Qrcode: any;

const STORAGE_KEY = "smart_school_portal_v12";
const ADMIN_PASS = "2443422";

const UPCOMING_AND_SUMMER_HOLIDAYS: HolidayPeriod[] = [
    { name: "إجازة نهاية أسبوع مطولة", start: "2026-12-13", end: "2026-12-13" },
    { name: "إجازة منتصف العام الدراسي", start: "2027-01-01", end: "2027-01-09" },
    { name: "إجازة يوم التأسيس", start: "2027-02-22", end: "2027-02-22" },
    { name: "إجازة عيد الفطر المبارك", start: "2027-03-05", end: "2027-03-15" },
    { name: "إجازة عيد الأضحى المبارك", start: "2027-05-14", end: "2027-05-22" },
    { name: "الإجازة الصيفية لنهاية العام الدراسي", start: "2027-05-28", end: "2027-08-21" }
];

let students: Student[] = loadStudents();
let isAdminAuthenticated = false;
let html5QrScanner: any = null;
let isCameraRunning = false;
let lastScanCode = "";
let lastScanTime = 0;

function loadStudents(): Student[] {
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

function saveStudents(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
    } catch (e) {
        console.error(e);
    }
    renderAdminTable();
    populateStudentSelect();
}

function getTodayDateISO(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function checkNonSchoolDayReason(): string | null {
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

function getFixedQrValue(studentId: string): string {
    return studentId.trim().toUpperCase();
}

function extractStudentId(input: string): string {
    const clean = input.trim();
    if (clean.includes("id=")) {
        try {
            const url = new URL(clean);
            return (url.searchParams.get("id") || "").toUpperCase();
        } catch {
            const match = clean.match(/id=([^&]+)/i);
            return match ? decodeURIComponent(match[1]).toUpperCase() : "";
        }
    }
    return clean.toUpperCase();
}

function showPage(pageId: string): void {
    document.querySelectorAll(".page-view").forEach(el => el.classList.remove("active"));
    document.getElementById(pageId)?.classList.add("active");
}

function openStudentPage(): void {
    document.getElementById("nav-student-btn")?.classList.add("active");
    document.getElementById("nav-admin-btn")?.classList.remove("active");
    showPage("student-page");
}

function openAdminPage(): void {
    document.getElementById("nav-admin-btn")?.classList.add("active");
    document.getElementById("nav-student-btn")?.classList.remove("active");

    if (isAdminAuthenticated) {
        showPage("admin-dashboard-page");
        updateDayBanner();
    } else {
        showPage("admin-login-page");
    }
}

function verifyAdminLogin(event: Event): void {
    event.preventDefault();
    const passInput = document.getElementById("admin-password-input") as HTMLInputElement;
    const errorBox = document.getElementById("login-error")!;

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

function logoutAdmin(): void {
    isAdminAuthenticated = false;
    stopCameraScanner();
    openStudentPage();
}

function renderStudentCard(student: Student): void {
    const profileView = document.getElementById("student-profile-view")!;
    profileView.classList.remove("hidden");

    document.getElementById("p-name")!.innerText = student.name;
    document.getElementById("p-grade")!.innerText = student.grade;
    document.getElementById("p-id")!.innerText = student.id;
    document.getElementById("p-present")!.innerText = student.presentDays.toString();
    document.getElementById("p-excused")!.innerText = student.excusedAbsentDays.toString();
    document.getElementById("p-unexcused")!.innerText = student.unexcusedAbsentDays.toString();

    const totalDays = student.presentDays + student.excusedAbsentDays + student.unexcusedAbsentDays;
    const rate = totalDays > 0 ? Math.round((student.presentDays / totalDays) * 100) : 100;
    document.getElementById("p-rate")!.innerText = `${rate}%`;

    const qrContainer = document.getElementById("p-qrcode")!;
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: getFixedQrValue(student.id),
        width: 155,
        height: 155,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    const achList = document.getElementById("p-achievements-list")!;
    achList.innerHTML = student.achievements.length
        ? student.achievements.map(a => `<li>🏆 <strong>${a.title}</strong> <span style="color:#64748b; font-size:0.85rem;">(${a.date})</span></li>`).join("")
        : "<li>لا توجد إنجازات مسجلة حتى الآن.</li>";

    const logsList = document.getElementById("p-logs-list")!;
    logsList.innerHTML = student.attendanceLogs.length
        ? student.attendanceLogs.slice(0, 10).map(log => `<li>${log}</li>`).join("")
        : "<li>لا يوجد سجل حضور أو غياب مسجل بعد.</li>";
}

function handleStudentSearch(): void {
    const input = document.getElementById("student-search-input") as HTMLInputElement;
    const targetId = extractStudentId(input.value);
    const student = students.find(s => s.id === targetId);

    if (!student) {
        alert("رقم الطالب غير مسجل! يجب تسجيل الطالب أولاً من بوابة المشرف.");
        document.getElementById("student-profile-view")!.classList.add("hidden");
        return;
    }
    renderStudentCard(student);
}

function getFormattedNow(): string {
    const now = new Date();
    const dayName = now.toLocaleDateString("ar-SA", { weekday: "long" });
    return `${dayName} (${now.toLocaleDateString("ar-SA")}) - ${now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
}

function recordAttendanceByScanner(rawInput: string): void {
    if (!isAdminAuthenticated) return;

    const resultBox = document.getElementById("scan-result")!;
    resultBox.classList.remove("hidden", "success", "error", "warning");

    const isDemoMode = (document.getElementById("demo-mode-checkbox") as HTMLInputElement)?.checked;
    const holidayReason = checkNonSchoolDayReason();

    if (holidayReason && !isDemoMode) {
        resultBox.classList.add("warning");
        resultBox.innerHTML = `⛔ التحضير متوقف اليوم بسبب: <strong>${holidayReason}</strong>.<br>يستثني النظام أيام العطل والإجازات القادمة والصيفية تلقائياً.`;
        return;
    }

    const studentId = extractStudentId(rawInput);
    const student = students.find(s => s.id === studentId);

    if (!student) {
        resultBox.classList.add("error");
        resultBox.innerText = `❌ هذا الباركود غير مسجل في النظام: ${studentId}`;
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
    student.attendanceLogs.unshift(`✅ حضور (ماسح QR): ${timeString}`);
    saveStudents();

    resultBox.classList.add("success");
    resultBox.innerHTML = `✅ تم تسجيل حضور الطالب: <strong>${student.name}</strong> (${student.grade})<br>الوقت: ${timeString}`;
}

function handleAdminScan(): void {
    const input = document.getElementById("manual-id-input") as HTMLInputElement;
    if (input.value) {
        recordAttendanceByScanner(input.value);
        input.value = "";
    }
}

function addNewStudent(event: Event): void {
    event.preventDefault();
    if (!isAdminAuthenticated) return;

    const id = (document.getElementById("new-id") as HTMLInputElement).value.trim().toUpperCase();
    const name = (document.getElementById("new-name") as HTMLInputElement).value.trim();
    const grade = (document.getElementById("new-grade") as HTMLInputElement).value.trim();

    if (students.some(s => s.id === id)) {
        alert("رقم الطالب مسجل مسبقاً!");
        return;
    }

    const newStudent: Student = {
        id,
        name,
        grade,
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
    (event.target as HTMLFormElement).reset();
    alert(`تم تسجيل الطالب ${name} وإصدار بطاقته ذات الباركود الثابت بنجاح!`);
}

function addAchievement(event: Event): void {
    event.preventDefault();
    if (!isAdminAuthenticated) return;

    const studentId = (document.getElementById("select-student") as HTMLSelectElement).value;
    if (!studentId) {
        alert("يرجى تسجيل طالب أولاً!");
        return;
    }

    const title = (document.getElementById("ach-title") as HTMLInputElement).value.trim();
    const date = (document.getElementById("ach-date") as HTMLInputElement).value;

    const student = students.find(s => s.id === studentId);
    if (student) {
        student.achievements.unshift({ title, date });
        saveStudents();
        (event.target as HTMLFormElement).reset();
        alert("تمت إضافة الإنجاز إلى ملف الطالب بنجاح (وبقي الباركود ثابتاً)!");
    }
}

function adjustAttendanceMetric(studentId: string, field: "presentDays" | "excusedAbsentDays" | "unexcusedAbsentDays", change: number): void {
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

function deleteStudent(studentId: string): void {
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

function exportToExcelCSV(): void {
    if (!isAdminAuthenticated) return;
    if (students.length === 0) {
        alert("لا يوجد طلاب مسجلون لتصديرهم!");
        return;
    }

    const headers = [
        "رقم الطالب",
        "اسم الطالب",
        "الصف الدراسي",
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
    link.download = `تقرير_الحضور_والانتظام_${getTodayDateISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportBackupJSON(): void {
    if (!isAdminAuthenticated) return;
    const backupData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        students: students
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `نسخة_احتياطية_الهوية_المدرسية_${getTodayDateISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function triggerBackupRestore(): void {
    if (!isAdminAuthenticated) return;
    const fileInput = document.getElementById("restore-backup-input") as HTMLInputElement;
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

function importBackupJSON(event: Event): void {
    if (!isAdminAuthenticated) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(String(e.target?.result || ""));
            const restoredList = Array.isArray(parsed) ? parsed : parsed.students;

            if (!Array.isArray(restoredList)) {
                alert("❌ ملف النسخة الاحتياطية غير صالح!");
                return;
            }

            if (!confirm(`سيتم استبدال البيانات الحالية بـ (${restoredList.length}) طالب من النسخة الاحتياطية. هل تريد المتابعة؟`)) {
                return;
            }

            students = restoredList.map((s: any) => ({
                id: String(s.id || "").toUpperCase(),
                name: String(s.name || ""),
                grade: String(s.grade || ""),
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
        } catch {
            alert("❌ حدث خطأ أثناء قراءة ملف النسخة الاحتياطية.");
        }
    };
    reader.readAsText(file);
}

function clearAllStudents(): void {
    if (!isAdminAuthenticated) return;
    if (confirm("⚠️ تأكيد المسح الشامل:\nهل أنت متأكد من مسح جميع الطلاب المسجلين وبياناتهم نهائياً؟")) {
        localStorage.removeItem(STORAGE_KEY);
        students = [];
        saveStudents();
        renderStudentIdCards();
    }
}

function viewStudentFromAdmin(studentId: string): void {
    const student = students.find(s => s.id === studentId);
    if (student) {
        openStudentPage();
        renderStudentCard(student);
    }
}

function renderAdminTable(): void {
    const tbody = document.getElementById("admin-students-tbody");
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:1.5rem;">لا يوجد طلاب مسجلون حالياً. قم بتسجيل الطلاب من النموذج أعلاه.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => `
        <tr>
            <td><strong>${s.id}</strong></td>
            <td>${s.name}</td>
            <td>${s.grade}</td>
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
                    onclick="viewStudentFromAdmin('${s.id}')">الملف</button>
                    <button type="button" class="btn danger-outline" style="padding: 0.35rem 0.7rem; font-size:0.85rem;" 
                    onclick="deleteStudent('${s.id}')">🗑️ حذف</button>
                </div>
            </td>
        </tr>
    `).join("");
}

function appendSingleIdCard(student: Student): void {
    const grid = document.getElementById("student-id-cards-grid");
    if (!grid) return;

    const emptyMsg = grid.querySelector(".empty-cards-msg");
    if (emptyMsg) emptyMsg.remove();

    const card = document.createElement("div");
    card.className = "student-id-card";
    card.innerHTML = `
        <div class="id-card-top">🪪 بطاقة الهوية المدرسية</div>
        <div class="id-card-body">
            <h4>${student.name}</h4>
            <p>${student.grade}</p>
            <div id="fixed-qr-${student.id}" class="id-card-qr"></div>
            <span class="id-card-code">${student.id}</span>
        </div>
    `;
    grid.appendChild(card);

    const qrBox = document.getElementById(`fixed-qr-${student.id}`);
    if (qrBox) {
        new QRCode(qrBox, {
            text: getFixedQrValue(student.id),
            width: 140,
            height: 140,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

function renderStudentIdCards(): void {
    const grid = document.getElementById("student-id-cards-grid");
    if (!grid) return;

    grid.innerHTML = "";
    if (students.length === 0) {
        grid.innerHTML = `<p class="empty-cards-msg" style="color:#64748b;">لا توجد بطاقات حالياً. عند تسجيل أي طالب ستظهر بطاقته الثابتة هنا.</p>`;
        return;
    }

    students.forEach(student => appendSingleIdCard(student));
}

function populateStudentSelect(): void {
    const select = document.getElementById("select-student");
    if (!select) return;
    if (students.length === 0) {
        select.innerHTML = `<option value="">-- سجل طالباً أولاً --</option>`;
        return;
    }
    select.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join("");
}

function renderHolidaysList(): void {
    const list = document.getElementById("holidays-display-list");
    if (!list) return;

    list.innerHTML = UPCOMING_AND_SUMMER_HOLIDAYS
        .map(h => {
            const rangeText = h.start === h.end ? h.start : `من ${h.start} إلى ${h.end}`;
            return `<li>📅 <strong>${h.name}</strong> <span style="color:#64748b; font-size:0.85rem;">(${rangeText})</span></li>`;
        })
        .join("");
}

function updateDayBanner(): void {
    const dayBanner = document.getElementById("current-day-banner");
    if (!dayBanner) return;

    const dayName = new Date().toLocaleDateString("ar-SA", { weekday: "long" });
    const holidayReason = checkNonSchoolDayReason();

    dayBanner.innerHTML = holidayReason
        ? `اليوم: <strong>${dayName}</strong> — ⛔ مستثنى من المسح التلقائي (<strong>${holidayReason}</strong>)`
        : `اليوم: <strong>${dayName}</strong> — ✅ يوم دراسي فعلي (ماسح الحضور نشط)`;
}

function startCameraScanner(): void {
    if (isCameraRunning) return;
    const btn = document.getElementById("start-camera-btn") as HTMLButtonElement;

    try {
        html5QrScanner = new Html5Qrcode("reader");
        html5QrScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText: string) => {
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
                btn.innerText = "✅ كاميرا الماسح تعمل";
                btn.disabled = true;
            }
        }).catch(() => {
            alert("تعذر فتح الكاميرا. تأكد من منح المتصفح إذن الوصول للكاميرا أو استخدم الإدخال اليدوي.");
        });
    } catch (e) {
        alert("مكتبة الكاميرا غير متاحة على هذا المتصفح.");
    }
}

function stopCameraScanner(): void {
    if (html5QrScanner && isCameraRunning) {
        html5QrScanner.stop().then(() => {
            isCameraRunning = false;
        }).catch(() => {});
    }
}

window.addEventListener("DOMContentLoaded", () => {
    openStudentPage();
});

(window as any).openStudentPage = openStudentPage;
(window as any).openAdminPage = openAdminPage;
(window as any).verifyAdminLogin = verifyAdminLogin;
(window as any).logoutAdmin = logoutAdmin;
(window as any).handleStudentSearch = handleStudentSearch;
(window as any).handleAdminScan = handleAdminScan;
(window as any).addNewStudent = addNewStudent;
(window as any).addAchievement = addAchievement;
(window as any).adjustAttendanceMetric = adjustAttendanceMetric;
(window as any).deleteStudent = deleteStudent;
(window as any).exportToExcelCSV = exportToExcelCSV;
(window as any).exportBackupJSON = exportBackupJSON;
(window as any).triggerBackupRestore = triggerBackupRestore;
(window as any).importBackupJSON = importBackupJSON;
(window as any).clearAllStudents = clearAllStudents;
(window as any).viewStudentFromAdmin = viewStudentFromAdmin;
(window as any).startCameraScanner = startCameraScanner;
