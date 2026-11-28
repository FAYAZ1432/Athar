interface Achievement {
    title: string;
    dateHijri: string;
}

interface StudentMessage {
    sender: string;
    text: string;
    dateHijri: string;
}

interface Student {
    id: string;
    name: string;
    grade: string;
    classroom: string;
    photo?: string;
    presentDays: number;
    excusedAbsentDays: number;
    unexcusedAbsentDays: number;
    lastAttendedDate?: string;
    attendanceLogs: string[];
    achievements: Achievement[];
    messages: StudentMessage[];
}

interface StudentRequest {
    id: string;
    studentId: string;
    studentName: string;
    type: "ACHIEVEMENT" | "EXCUSE";
    title: string;
    dateHijri: string;
    fileName: string;
    fileData: string;
}

type SupervisorRole = "منشئ النظام" | "مدير المدرسة" | "وكيل المدرسة" | "أستاذ الغياب" | "مشرف النشاط" | "مرشد المدرسة";

interface SupervisorAccount {
    name: string;
    password: string;
    role: SupervisorRole;
    isFounder: boolean;
}

interface VisitorLog {
    name: string;
    role: string;
    dateHijri: string;
}

interface FeaturedAchievement {
    id: string;
    studentName: string;
    description: string;
    dateHijri: string;
}

declare var QRious: any;
declare var JsBarcode: any;
declare var Html5Qrcode: any;

const STORAGE_KEYS = {
    STUDENTS: "ATHAR_PERMANENT_STUDENTS",
    REQUESTS: "ATHAR_PERMANENT_REQUESTS",
    SUPERVISORS: "ATHAR_PERMANENT_SUPERVISORS",
    VISITORS: "ATHAR_PERMANENT_VISITORS",
    FEATURED: "ATHAR_PERMANENT_FEATURED",
    VISITOR_CONFIG: "ATHAR_PERMANENT_VISITOR_CONFIG"
};

const MIN_ALLOWED_DATE = "2025-01-01";

const FOUNDER_ACCOUNTS: SupervisorAccount[] = [
    { name: "فايز الحربي", password: "2443422", role: "منشئ النظام", isFounder: true },
    { name: "علي المتحمي", password: "2443422", role: "منشئ النظام", isFounder: true }
];

const INTERNAL_HOLIDAY_RANGES: Array<{ start: string; end: string }> = [
    { start: "2026-12-13", end: "2026-12-13" },
    { start: "2027-01-01", end: "2027-01-09" },
    { start: "2027-02-22", end: "2027-02-22" },
    { start: "2027-03-05", end: "2027-03-15" },
    { start: "2027-05-14", end: "2027-05-22" },
    { start: "2027-05-28", end: "2027-08-21" }
];

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23e2e8f0'/><circle cx='50' cy='38' r='18' fill='%2364748b'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2364748b'/></svg>";

function syncToIndexedDB(key: string, value: any): void {
    try {
        const req = indexedDB.open("AtharPermanentDB", 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("store")) db.createObjectStore("store");
        };
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("store", "readwrite");
            tx.objectStore("store").put(value, key);
        };
    } catch {}
}

function restoreFromIndexedDBIfNeeded(): void {
    try {
        const req = indexedDB.open("AtharPermanentDB", 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("store")) db.createObjectStore("store");
        };
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("store", "readonly");
            const store = tx.objectStore("store");
            const getStudents = store.get(STORAGE_KEYS.STUDENTS);
            getStudents.onsuccess = () => {
                if (Array.isArray(getStudents.result) && getStudents.result.length > 0 && students.length === 0) {
                    students = getStudents.result;
                    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
                    renderAdminTable();
                    populateStudentSelect();
                    renderStudentIdCards();
                }
            };
        };
    } catch {}
}

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch {}
    return fallback;
}

function saveData<T>(key: string, data: T): void {
    localStorage.setItem(key, JSON.stringify(data));
    syncToIndexedDB(key, data);
}

let students: Student[] = loadJson<Student[]>(STORAGE_KEYS.STUDENTS, []);
let studentRequests: StudentRequest[] = loadJson<StudentRequest[]>(STORAGE_KEYS.REQUESTS, []);
let visitorLogs: VisitorLog[] = loadJson<VisitorLog[]>(STORAGE_KEYS.VISITORS, []);
let featuredAchievements: FeaturedAchievement[] = loadJson<FeaturedAchievement[]>(STORAGE_KEYS.FEATURED, []);
let visitorConfig = loadJson<{ showHonorBoard: boolean }>(STORAGE_KEYS.VISITOR_CONFIG, { showHonorBoard: true });
let supervisors: SupervisorAccount[] = loadSupervisors();

let currentAdmin: SupervisorAccount | null = null;
let currentViewedStudentId: string = "";
let pendingMetricAction: { studentId: string; field: "presentDays" | "excusedAbsentDays" | "unexcusedAbsentDays"; change: number } | null = null;
let html5QrScanner: any = null;
let isCameraRunning = false;
let lastScanCode = "";
let lastScanTime = 0;

function loadSupervisors(): SupervisorAccount[] {
    const saved = loadJson<SupervisorAccount[]>(STORAGE_KEYS.SUPERVISORS, []);
    const nonFounders = saved.filter(s => !s.isFounder && !FOUNDER_ACCOUNTS.some(f => f.name === s.name));
    return [...FOUNDER_ACCOUNTS, ...nonFounders];
}

function saveSupervisors(): void {
    const nonFounders = supervisors.filter(s => !s.isFounder);
    saveData(STORAGE_KEYS.SUPERVISORS, nonFounders);
    renderSupervisorsTable();
}

function saveStudents(): void {
    saveData(STORAGE_KEYS.STUDENTS, students);
    renderAdminTable();
    renderAdminAchievementsTable();
    populateStudentSelect();
}

function saveRequests(): void {
    saveData(STORAGE_KEYS.REQUESTS, studentRequests);
    renderAdminRequests();
}

function formatToHijri(dateInput?: string | Date): string {
    const dateObj = dateInput
        ? (typeof dateInput === "string" ? new Date(dateInput + "T12:00:00") : dateInput)
        : new Date();

    if (isNaN(dateObj.getTime())) return String(dateInput || "");

    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).formatToParts(dateObj);

    const day = parts.find(p => p.type === "day")?.value || "01";
    const month = parts.find(p => p.type === "month")?.value || "01";
    const year = parts.find(p => p.type === "year")?.value || "1448";

    return `\u202A${day}/${month}/${year} هـ\u202C`;
}

function getHijriNowWithTime(): string {
    const now = new Date();
    const dayName = now.toLocaleDateString("ar-SA", { weekday: "long" });
    const time = now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    return `${dayName} ${formatToHijri(now)} — الساعة ${time}`;
}

function getTodayDateISO(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function configureDateConstraints(): void {
    const today = getTodayDateISO();
    ["ach-date", "req-ach-date", "req-excuse-date", "metric-date-picker"].forEach(id => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) {
            el.min = MIN_ALLOWED_DATE;
            el.max = today;
        }
    });
}

function isValidHistoricalDate(dateStr: string): boolean {
    const today = getTodayDateISO();
    return Boolean(dateStr) && dateStr >= MIN_ALLOWED_DATE && dateStr <= today;
}

function checkNonSchoolDay(): boolean {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6) return true;
    const todayISO = getTodayDateISO();
    return INTERNAL_HOLIDAY_RANGES.some(r => todayISO >= r.start && todayISO <= r.end);
}

function generateSharpQrDataUrl(studentId: string, size: number = 220): string {
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

function renderLinearBarcode(svgElementId: string, studentId: string): void {
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
        } catch {}
    }
}

function extractStudentId(input: string): string {
    const clean = input.trim();
    if (clean.includes("id=")) {
        try {
            const url = new URL(clean);
            return (url.searchParams.get("id") || "").toUpperCase();
        } catch {
            const match = clean.match(/id=([^&\s]+)/i);
            return match ? decodeURIComponent(match[1]).toUpperCase() : "";
        }
    }
    return clean.toUpperCase();
}

function showPage(pageId: string): void {
    document.querySelectorAll(".page-view").forEach(el => el.classList.remove("active"));
    document.getElementById(pageId)?.classList.add("active");

    const backBtn = document.getElementById("header-back-btn");
    if (backBtn) {
        backBtn.style.display = (pageId === "portal-landing-page" || pageId === "admin-dashboard-page") ? "none" : "inline-flex";
    }
}

function goToPortalHome(): void {
    stopCameraScanner();
    showPage("portal-landing-page");
}

function openVisitorPortal(): void {
    showPage("visitor-page");
    document.getElementById("visitor-gate-box")?.classList.remove("hidden");
    document.getElementById("visitor-content-area")?.classList.add("hidden");
}

function enterVisitorArea(event: Event): void {
    event.preventDefault();
    const role = (document.getElementById("visitor-role-select") as HTMLSelectElement).value;
    const name = (document.getElementById("visitor-name-input") as HTMLInputElement).value.trim();

    const newLog: VisitorLog = {
        name,
        role,
        dateHijri: getHijriNowWithTime()
    };
    visitorLogs.unshift(newLog);
    saveData(STORAGE_KEYS.VISITORS, visitorLogs);

    document.getElementById("visitor-gate-box")?.classList.add("hidden");
    document.getElementById("visitor-content-area")?.classList.remove("hidden");
    document.getElementById("visitor-welcome-title")!.innerText = `أهلاً بك ${role}: ${name}`;
    document.getElementById("visitor-hijri-today")!.innerText = `التاريخ الهجري: ${formatToHijri()}`;

    renderVisitorContent();
}

function exitVisitorArea(): void {
    (document.getElementById("visitor-name-input") as HTMLInputElement).value = "";
    goToPortalHome();
}

function renderVisitorContent(): void {
    const honorSection = document.getElementById("visitor-honor-section");
    if (honorSection) {
        if (visitorConfig.showHonorBoard) {
            honorSection.classList.remove("hidden");
            const sorted = [...students].sort((a, b) => b.presentDays - a.presentDays);
            const medals = ["المركز الأول", "المركز الثاني", "المركز الثالث"];

            document.getElementById("visitor-podium")!.innerHTML = sorted.slice(0, 3).map((s, idx) => `
                <div class="podium-card">
                    <div class="podium-rank">${medals[idx]}</div>
                    <h4>${s.name}</h4>
                    <p class="muted-text" style="margin-bottom:0.4rem;">${s.grade} — فصل ${s.classroom}</p>
                    <strong style="color:var(--teal);">${s.presentDays} يوم حضور</strong>
                </div>
            `).join("");

            document.getElementById("visitor-honor-tbody")!.innerHTML = sorted.map((s, idx) => {
                const total = s.presentDays + s.excusedAbsentDays + s.unexcusedAbsentDays;
                const rate = total > 0 ? Math.round((s.presentDays / total) * 100) : 100;
                return `
                    <tr>
                        <td><strong>#${idx + 1}</strong></td>
                        <td><strong>${s.name}</strong></td>
                        <td>${s.grade} — فصل ${s.classroom}</td>
                        <td><strong style="color:var(--teal);">${s.presentDays}</strong></td>
                        <td><strong>${rate}%</strong></td>
                    </tr>
                `;
            }).join("");
        } else {
            honorSection.classList.add("hidden");
        }
    }

    const featuredContainer = document.getElementById("visitor-featured-list")!;
    featuredContainer.innerHTML = featuredAchievements.length
        ? featuredAchievements.map(f => `
            <div class="request-item-card">
                <h4 style="color:var(--navy-dark);">${f.studentName}</h4>
                <p style="margin:0.4rem 0;">${f.description}</p>
                <span style="font-size:0.85rem; color:var(--text-muted);">التاريخ: ${f.dateHijri}</span>
            </div>
        `).join("")
        : `<p class="muted-text">لا توجد إنجازات منشورة حالياً.</p>`;
}

function openStudentPortal(): void {
    showPage("student-page");
    configureDateConstraints();

    if (currentViewedStudentId) {
        const student = students.find(s => s.id === currentViewedStudentId);
        if (student) {
            document.getElementById("student-search-box")?.classList.add("hidden");
            renderStudentCard(student);
            return;
        }
    }
    document.getElementById("student-search-box")?.classList.remove("hidden");
    document.getElementById("student-profile-view")?.classList.add("hidden");
}

function handleStudentSearch(): void {
    const input = document.getElementById("student-search-input") as HTMLInputElement;
    const targetId = extractStudentId(input.value);
    const student = students.find(s => s.id === targetId);

    if (!student) {
        alert("الرقم المدرسي غير مسجل في منصة أثر!");
        return;
    }

    document.getElementById("student-search-box")?.classList.add("hidden");
    input.value = "";
    renderStudentCard(student);
}

function logoutStudent(): void {
    currentViewedStudentId = "";
    document.getElementById("student-profile-view")?.classList.add("hidden");
    document.getElementById("student-search-box")?.classList.remove("hidden");
    goToPortalHome();
}

function renderStudentCard(student: Student): void {
    currentViewedStudentId = student.id;
    const profileView = document.getElementById("student-profile-view")!;
    profileView.classList.remove("hidden");
    configureDateConstraints();

    document.getElementById("student-welcome-header")!.innerText = `مرحباً، ${student.name}`;
    document.getElementById("student-hijri-date-header")!.innerText = `التاريخ الهجري اليوم: ${formatToHijri()}`;

    document.getElementById("p-name")!.innerText = student.name;
    document.getElementById("p-grade-class")!.innerText = `${student.grade} — فصل ${student.classroom || "1"}`;
    document.getElementById("p-id")!.innerText = student.id;
    document.getElementById("p-present")!.innerText = student.presentDays.toString();
    document.getElementById("p-excused")!.innerText = student.excusedAbsentDays.toString();
    document.getElementById("p-unexcused")!.innerText = student.unexcusedAbsentDays.toString();

    const avatarImg = document.getElementById("p-avatar") as HTMLImageElement;
    if (avatarImg) avatarImg.src = student.photo || DEFAULT_AVATAR;

    const totalDays = student.presentDays + student.excusedAbsentDays + student.unexcusedAbsentDays;
    const rate = totalDays > 0 ? Math.round((student.presentDays / totalDays) * 100) : 100;
    document.getElementById("p-rate")!.innerText = `${rate}%`;

    const qrImg = document.getElementById("p-qrcode-img") as HTMLImageElement;
    if (qrImg) qrImg.src = generateSharpQrDataUrl(student.id, 220);
    renderLinearBarcode("p-barcode-svg", student.id);

    const msgs = student.messages || [];
    document.getElementById("p-messages-list")!.innerHTML = msgs.length
        ? msgs.map(m => `<li><strong>من (${m.sender}):</strong> ${m.text} <span style="color:#64748b; font-size:0.85rem;">(${m.dateHijri})</span></li>`).join("")
        : "<li>لا توجد رسائل أو ردود حالياً.</li>";

    document.getElementById("p-achievements-list")!.innerHTML = student.achievements.length
        ? student.achievements.map(a => `<li><strong>${a.title}</strong> <span style="color:#64748b; font-size:0.85rem;">(التاريخ: ${a.dateHijri})</span></li>`).join("")
        : "<li>لا توجد إنجازات معتمدة حتى الآن.</li>";

    document.getElementById("p-logs-list")!.innerHTML = student.attendanceLogs.length
        ? student.attendanceLogs.slice(0, 20).map(log => `<li>${log}</li>`).join("")
        : "<li>لا يوجد سجل حضور أو غياب مسجل بعد.</li>";
}

function printStudentSingleCard(): void {
    document.body.classList.add("printing-single-card");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-single-card"), 500);
}

function handleStudentPhotoUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
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
                const compressed = canvas.toDataURL("image/jpeg", 0.78);
                const student = students.find(s => s.id === currentViewedStudentId);
                if (student) {
                    student.photo = compressed;
                    saveStudents();
                    renderStudentCard(student);
                    alert("تم تحديث صورتك الشخصية بنجاح!");
                }
            }
        };
        img.src = String(e.target?.result || "");
    };
    reader.readAsDataURL(file);
}

function submitStudentRequest(event: Event, type: "ACHIEVEMENT" | "EXCUSE"): void {
    event.preventDefault();
    const student = students.find(s => s.id === currentViewedStudentId);
    if (!student) return;

    const titleEl = document.getElementById(type === "ACHIEVEMENT" ? "req-ach-title" : "req-excuse-reason") as HTMLInputElement;
    const dateEl = document.getElementById(type === "ACHIEVEMENT" ? "req-ach-date" : "req-excuse-date") as HTMLInputElement;
    const fileEl = document.getElementById(type === "ACHIEVEMENT" ? "req-ach-file" : "req-excuse-file") as HTMLInputElement;

    if (!isValidHistoricalDate(dateEl.value)) {
        alert(`التاريخ غير صحيح! يجب أن يكون بين ${MIN_ALLOWED_DATE} وتاريخ اليوم.`);
        return;
    }

    const file = fileEl.files?.[0];
    if (!file) {
        alert("إرفاق الملف ضروري لإرسال الطلب!");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const req: StudentRequest = {
            id: "REQ-" + Date.now(),
            studentId: student.id,
            studentName: student.name,
            type,
            title: titleEl.value.trim(),
            dateHijri: formatToHijri(dateEl.value),
            fileName: file.name,
            fileData: String(e.target?.result || "")
        };

        studentRequests.unshift(req);
        saveRequests();
        (event.target as HTMLFormElement).reset();
        alert("تم إرسال الطلب مع الملف المرفق إلى المشرف بنجاح!");
    };
    reader.readAsDataURL(file);
}

function openAdminPortal(): void {
    if (currentAdmin) {
        showPage("admin-dashboard-page");
        setupAdminDashboard();
    } else {
        showPage("admin-login-page");
    }
}

function verifyAdminLogin(event: Event): void {
    event.preventDefault();
    const nameInput = (document.getElementById("admin-name-input") as HTMLInputElement).value.trim();
    const passInput = (document.getElementById("admin-password-input") as HTMLInputElement).value;
    const errorBox = document.getElementById("login-error")!;

    const matchedAdmin = supervisors.find(s => s.name === nameInput && s.password === passInput);
    if (matchedAdmin) {
        currentAdmin = matchedAdmin;
        errorBox.classList.add("hidden");
        (document.getElementById("admin-name-input") as HTMLInputElement).value = "";
        (document.getElementById("admin-password-input") as HTMLInputElement).value = "";
        showPage("admin-dashboard-page");
        setupAdminDashboard();
    } else {
        errorBox.classList.remove("hidden");
    }
}

function setupAdminDashboard(): void {
    if (!currentAdmin) return;
    configureDateConstraints();

    document.getElementById("active-admin-title")!.innerText = `${currentAdmin.name} — ${currentAdmin.role}`;

    const role = currentAdmin.role;
    const isCreator = currentAdmin.isFounder || role === "منشئ النظام";
    const isPrincipal = role === "مدير المدرسة";
    const canManageAttendance = isCreator || isPrincipal || role === "وكيل المدرسة" || role === "أستاذ الغياب";
    const canManageAchievements = isCreator || isPrincipal || role === "مشرف النشاط" || role === "مرشد المدرسة";
    const canManageSupervisors = isCreator || isPrincipal;

    toggleSection("sec-attendance-scanner", canManageAttendance);
    toggleSection("sec-send-student-notice", canManageAttendance);
    toggleSection("sec-students-table", canManageAttendance);

    toggleSection("sec-add-achievement", canManageAchievements);
    toggleSection("sec-achievements-management", canManageAchievements);

    toggleSection("id-cards-section", isCreator);
    toggleSection("founders-supervisors-section", canManageSupervisors);

    const honorCheck = document.getElementById("toggle-visitor-honor") as HTMLInputElement;
    if (honorCheck) honorCheck.checked = visitorConfig.showHonorBoard;

    renderAdminTable();
    renderAdminAchievementsTable();
    populateStudentSelect();
    if (isCreator) renderStudentIdCards();
    if (canManageSupervisors) renderSupervisorsTable();
    renderAdminRequests();
    renderAdminVisitorControls();
    updateDayBanner();
}

function toggleSection(id: string, show: boolean): void {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) el.classList.remove("hidden");
    else el.classList.add("hidden");
}

function logoutAdmin(): void {
    currentAdmin = null;
    stopCameraScanner();
    goToPortalHome();
}

function playBeep(success: boolean): void {
    try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
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
    } catch {}
}

function recordAttendanceByScanner(rawInput: string): void {
    if (!currentAdmin) return;
    const resultBox = document.getElementById("scan-result")!;
    resultBox.classList.remove("hidden", "success", "error", "warning");

    const isDemoMode = (document.getElementById("demo-mode-checkbox") as HTMLInputElement)?.checked;
    if (checkNonSchoolDay() && !isDemoMode) {
        playBeep(false);
        resultBox.classList.add("warning");
        resultBox.innerHTML = `اليوم إجازة — التحضير التلقائي متوقف.`;
        return;
    }

    const studentId = extractStudentId(rawInput);
    const student = students.find(s => s.id === studentId);

    if (!student) {
        playBeep(false);
        resultBox.classList.add("error");
        resultBox.innerText = `هذا الباركود غير مسجل في منصة أثر: ${studentId}`;
        return;
    }

    const todayISO = getTodayDateISO();
    if (student.lastAttendedDate === todayISO) {
        playBeep(false);
        resultBox.classList.add("warning");
        resultBox.innerHTML = `الطالب <strong>${student.name}</strong> مسجّل حضوره مسبقاً اليوم (${formatToHijri()}).`;
        return;
    }

    const hijriNow = getHijriNowWithTime();
    student.presentDays += 1;
    student.lastAttendedDate = todayISO;
    student.attendanceLogs.unshift(`حضور (باركود): ${hijriNow}`);
    saveStudents();
    playBeep(true);

    resultBox.classList.add("success");
    resultBox.innerHTML = `تم تسجيل حضور الطالب: <strong>${student.name}</strong><br>التاريخ: ${hijriNow}`;
}

function handleAdminScan(): void {
    const input = document.getElementById("manual-id-input") as HTMLInputElement;
    if (input.value.trim()) {
        recordAttendanceByScanner(input.value);
        input.value = "";
        input.focus();
    }
}

function adjustAttendanceMetric(studentId: string, field: "presentDays" | "excusedAbsentDays" | "unexcusedAbsentDays", change: number): void {
    if (!currentAdmin) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const currentVal = student[field] || 0;
    const nextVal = Math.max(0, currentVal + change);
    if (nextVal === currentVal) return;

    pendingMetricAction = { studentId, field, change };
    const titleMap = {
        presentDays: change > 0 ? "تحديد تاريخ الحضور" : "تحديد تاريخ خصم الحضور",
        excusedAbsentDays: change > 0 ? "تحديد تاريخ الغياب بعذر" : "تحديد تاريخ تعديل الغياب بعذر",
        unexcusedAbsentDays: change > 0 ? "تحديد تاريخ الغياب بدون عذر" : "تحديد تاريخ تعديل الغياب"
    };

    document.getElementById("date-prompt-title")!.innerText = titleMap[field];
    const picker = document.getElementById("metric-date-picker") as HTMLInputElement;
    picker.value = getTodayDateISO();
    document.getElementById("date-prompt-modal")?.classList.remove("hidden");
}

function closeDatePromptModal(): void {
    pendingMetricAction = null;
    document.getElementById("date-prompt-modal")?.classList.add("hidden");
}

function confirmMetricDate(event: Event): void {
    event.preventDefault();
    if (!currentAdmin || !pendingMetricAction) return;

    const dateVal = (document.getElementById("metric-date-picker") as HTMLInputElement).value;
    if (!isValidHistoricalDate(dateVal)) {
        alert("التاريخ غير صحيح!");
        return;
    }

    const { studentId, field, change } = pendingMetricAction;
    const student = students.find(s => s.id === studentId);
    if (student) {
        student[field] = Math.max(0, (student[field] || 0) + change);
        const hijriDate = formatToHijri(dateVal);

        if (field === "presentDays") {
            student.attendanceLogs.unshift(`${change > 0 ? "حضور يدوي" : "خصم حضور"}: بتاريخ ${hijriDate} (${currentAdmin.name})`);
        } else if (field === "excusedAbsentDays") {
            student.attendanceLogs.unshift(`${change > 0 ? "غياب بعذر" : "تعديل غياب بعذر"}: بتاريخ ${hijriDate} (${currentAdmin.name})`);
        } else {
            student.attendanceLogs.unshift(`${change > 0 ? "غياب بدون عذر" : "تعديل غياب بدون عذر"}: بتاريخ ${hijriDate} (${currentAdmin.name})`);
        }
        saveStudents();
    }

    closeDatePromptModal();
}

function addNewStudent(event: Event): void {
    event.preventDefault();
    if (!currentAdmin) return;

    const id = (document.getElementById("new-id") as HTMLInputElement).value.trim().toUpperCase();
    const name = (document.getElementById("new-name") as HTMLInputElement).value.trim();
    const grade = (document.getElementById("new-grade") as HTMLSelectElement).value;
    const classroom = (document.getElementById("new-classroom") as HTMLSelectElement).value;

    if (students.some(s => s.id === id)) {
        alert("الرقم المدرسي مسجل مسبقاً!");
        return;
    }

    const newStudent: Student = {
        id,
        name,
        grade,
        classroom,
        presentDays: 0,
        excusedAbsentDays: 0,
        unexcusedAbsentDays: 0,
        lastAttendedDate: "",
        attendanceLogs: [],
        achievements: [],
        messages: []
    };

    students.push(newStudent);
    saveStudents();
    if (currentAdmin.isFounder) appendSingleIdCard(newStudent);
    (event.target as HTMLFormElement).reset();
    alert(`تم تسجيل الطالب ${name} بنجاح!`);
}

function addAchievement(event: Event): void {
    event.preventDefault();
    if (!currentAdmin) return;

    const studentId = (document.getElementById("select-student") as HTMLSelectElement).value;
    const title = (document.getElementById("ach-title") as HTMLInputElement).value.trim();
    const dateVal = (document.getElementById("ach-date") as HTMLInputElement).value;

    if (!isValidHistoricalDate(dateVal)) {
        alert("التاريخ غير صحيح!");
        return;
    }

    const student = students.find(s => s.id === studentId);
    if (student) {
        student.achievements.unshift({ title, dateHijri: formatToHijri(dateVal) });
        saveStudents();
        (event.target as HTMLFormElement).reset();
        alert("تم توثيق الإنجاز بالتاريخ الهجري بنجاح!");
    }
}

function deleteStudentAchievement(studentId: string, achIndex: number): void {
    if (!currentAdmin) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    if (!confirm("هل تريد حذف هذا الإنجاز من سجل الطالب؟")) return;
    student.achievements.splice(achIndex, 1);
    saveStudents();
}

function renderAdminAchievementsTable(): void {
    const tbody = document.getElementById("admin-achievements-tbody");
    if (!tbody) return;

    const rows: string[] = [];
    students.forEach(s => {
        s.achievements.forEach((a, idx) => {
            rows.push(`
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${a.title}</td>
                    <td>${a.dateHijri}</td>
                    <td><button type="button" class="btn btn-danger-outline" onclick="deleteStudentAchievement('${s.id}', ${idx})">حذف الإنجاز</button></td>
                </tr>
            `);
        });
    });

    tbody.innerHTML = rows.length
        ? rows.join("")
        : `<tr><td colspan="4" style="text-align:center; color:#64748b; padding:1rem;">لا توجد إنجازات مسجلة حالياً.</td></tr>`;
}

function renderAdminRequests(): void {
    const container = document.getElementById("admin-requests-list");
    const countBadge = document.getElementById("pending-requests-count");
    if (!container || !currentAdmin) return;

    const role = currentAdmin.role;
    const isCreatorOrPrincipal = currentAdmin.isFounder || role === "منشئ النظام" || role === "مدير المدرسة";
    const isAttendanceRole = role === "وكيل المدرسة" || role === "أستاذ الغياب";
    const isActivityRole = role === "مشرف النشاط" || role === "مرشد المدرسة";

    const visibleRequests = studentRequests.filter(r => {
        if (isCreatorOrPrincipal) return true;
        if (isAttendanceRole && r.type === "EXCUSE") return true;
        if (isActivityRole && r.type === "ACHIEVEMENT") return true;
        return false;
    });

    if (countBadge) countBadge.innerText = `${visibleRequests.length} طلبات`;

    if (visibleRequests.length === 0) {
        container.innerHTML = `<p class="muted-text" style="margin-bottom:0;">لا توجد طلبات معلقة ضمن صلاحيتك حالياً.</p>`;
        return;
    }

    container.innerHTML = visibleRequests.map(r => `
        <div class="request-item-card">
            <span class="gateway-badge ${r.type === 'EXCUSE' ? 'honor-b' : ''}">
                ${r.type === "ACHIEVEMENT" ? "طلب إنجاز" : "عذر غياب"}
            </span>
            <h4 style="color:var(--navy-dark);">${r.studentName} (${r.studentId})</h4>
            <p style="font-size:0.9rem; margin:0.3rem 0;"><strong>التفاصيل:</strong> ${r.title}</p>
            <p style="font-size:0.85rem; color:var(--text-muted);"><strong>التاريخ الهجري:</strong> ${r.dateHijri}</p>
            <p style="margin:0.5rem 0;">
                <a href="${r.fileData}" download="${r.fileName}" target="_blank" style="color:var(--blue); font-weight:700; text-decoration:underline;">
                    عرض / تحميل الملف المرفق (${r.fileName})
                </a>
            </p>
            <input type="text" id="reply-input-${r.id}" placeholder="اكتب ردك للطالب هنا (اختياري)..." style="padding:0.5rem; font-size:0.85rem; margin-bottom:0.6rem;">
            <div style="display:flex; gap:0.5rem;">
                <button type="button" class="btn btn-success" style="padding:0.4rem 0.8rem; font-size:0.85rem;" onclick="processStudentRequest('${r.id}', true)">اعتماد والرد</button>
                <button type="button" class="btn btn-danger-outline" style="padding:0.4rem 0.8rem; font-size:0.85rem;" onclick="processStudentRequest('${r.id}', false)">رفض والرد</button>
            </div>
        </div>
    `).join("");
}

function processStudentRequest(reqId: string, approved: boolean): void {
    if (!currentAdmin) return;
    const req = studentRequests.find(r => r.id === reqId);
    if (!req) return;

    const replyText = (document.getElementById(`reply-input-${reqId}`) as HTMLInputElement)?.value.trim();
    const student = students.find(s => s.id === req.studentId);

    if (student) {
        if (!student.messages) student.messages = [];
        if (approved) {
            if (req.type === "ACHIEVEMENT") {
                student.achievements.unshift({ title: req.title, dateHijri: req.dateHijri });
            } else {
                student.excusedAbsentDays += 1;
                student.attendanceLogs.unshift(`غياب بعذر معتمد (${req.title}) — بتاريخ ${req.dateHijri}`);
            }
            student.messages.unshift({
                sender: `${currentAdmin.name} (${currentAdmin.role})`,
                text: `تم اعتماد طلبك (${req.title}). ${replyText ? "الرد: " + replyText : ""}`,
                dateHijri: formatToHijri()
            });
        } else {
            student.messages.unshift({
                sender: `${currentAdmin.name} (${currentAdmin.role})`,
                text: `تم رفض طلبك (${req.title}). ${replyText ? "السبب: " + replyText : ""}`,
                dateHijri: formatToHijri()
            });
        }
        saveStudents();
    }

    studentRequests = studentRequests.filter(r => r.id !== reqId);
    saveRequests();
}

function sendNoticeToStudent(event: Event): void {
    event.preventDefault();
    if (!currentAdmin) return;

    const studentId = (document.getElementById("notice-student-select") as HTMLSelectElement).value;
    const text = (document.getElementById("notice-text-input") as HTMLInputElement).value.trim();
    const student = students.find(s => s.id === studentId);

    if (student) {
        if (!student.messages) student.messages = [];
        student.messages.unshift({
            sender: `${currentAdmin.name} (${currentAdmin.role})`,
            text,
            dateHijri: formatToHijri()
        });
        saveStudents();
        (event.target as HTMLFormElement).reset();
        alert(`تم إرسال الرسالة إلى ملف الطالب ${student.name} بنجاح!`);
    }
}

function saveVisitorSettings(): void {
    const honorCheck = document.getElementById("toggle-visitor-honor") as HTMLInputElement;
    visitorConfig.showHonorBoard = honorCheck ? honorCheck.checked : true;
    saveData(STORAGE_KEYS.VISITOR_CONFIG, visitorConfig);
}

function addFeaturedVisitorItem(event: Event): void {
    event.preventDefault();
    if (!currentAdmin) return;

    const studentName = (document.getElementById("featured-student-name") as HTMLInputElement).value.trim();
    const description = (document.getElementById("featured-ach-desc") as HTMLInputElement).value.trim();

    featuredAchievements.unshift({
        id: "FEAT-" + Date.now(),
        studentName,
        description,
        dateHijri: formatToHijri()
    });
    saveData(STORAGE_KEYS.FEATURED, featuredAchievements);
    renderAdminVisitorControls();
    (event.target as HTMLFormElement).reset();
}

function deleteFeaturedVisitorItem(id: string): void {
    featuredAchievements = featuredAchievements.filter(f => f.id !== id);
    saveData(STORAGE_KEYS.FEATURED, featuredAchievements);
    renderAdminVisitorControls();
}

function renderAdminVisitorControls(): void {
    const featList = document.getElementById("admin-featured-list");
    if (featList) {
        featList.innerHTML = featuredAchievements.length
            ? featuredAchievements.map(f => `
                <li style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
                    <span><strong>${f.studentName}:</strong> ${f.description}</span>
                    <button type="button" class="btn btn-danger-outline" style="padding:0.2rem 0.6rem;" onclick="deleteFeaturedVisitorItem('${f.id}')">حذف</button>
                </li>
            `).join("")
            : "<li>لا توجد إنجازات منشورة للزوار حالياً.</li>";
    }

    const visList = document.getElementById("admin-visitors-log-list");
    if (visList) {
        visList.innerHTML = visitorLogs.length
            ? visitorLogs.slice(0, 20).map(v => `<li><strong>${v.name}</strong> (${v.role}) — ${v.dateHijri}</li>`).join("")
            : "<li>لم يسجل دخول أي زائر بعد.</li>";
    }
}

function openEditStudentModal(studentId: string): void {
    if (!currentAdmin) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    (document.getElementById("edit-stu-id") as HTMLInputElement).value = student.id;
    (document.getElementById("edit-stu-name") as HTMLInputElement).value = student.name;
    (document.getElementById("edit-stu-grade") as HTMLSelectElement).value = student.grade;
    (document.getElementById("edit-stu-classroom") as HTMLSelectElement).value = student.classroom || "1";
    (document.getElementById("edit-stu-present") as HTMLInputElement).value = String(student.presentDays);
    (document.getElementById("edit-stu-excused") as HTMLInputElement).value = String(student.excusedAbsentDays);
    (document.getElementById("edit-stu-unexcused") as HTMLInputElement).value = String(student.unexcusedAbsentDays);
    (document.getElementById("edit-stu-note") as HTMLInputElement).value = "";

    document.getElementById("edit-student-modal")?.classList.remove("hidden");
}

function closeEditModal(): void {
    document.getElementById("edit-student-modal")?.classList.add("hidden");
}

function saveEditedStudent(event: Event): void {
    event.preventDefault();
    if (!currentAdmin) return;

    const id = (document.getElementById("edit-stu-id") as HTMLInputElement).value;
    const student = students.find(s => s.id === id);
    if (!student) return;

    student.name = (document.getElementById("edit-stu-name") as HTMLInputElement).value.trim();
    student.grade = (document.getElementById("edit-stu-grade") as HTMLSelectElement).value;
    student.classroom = (document.getElementById("edit-stu-classroom") as HTMLSelectElement).value;
    student.presentDays = Math.max(0, Number((document.getElementById("edit-stu-present") as HTMLInputElement).value) || 0);
    student.excusedAbsentDays = Math.max(0, Number((document.getElementById("edit-stu-excused") as HTMLInputElement).value) || 0);
    student.unexcusedAbsentDays = Math.max(0, Number((document.getElementById("edit-stu-unexcused") as HTMLInputElement).value) || 0);

    const note = (document.getElementById("edit-stu-note") as HTMLInputElement).value.trim();
    student.attendanceLogs.unshift(`تعديل سجل (${note || "تصحيح"}): ${getHijriNowWithTime()} — ${currentAdmin.name}`);

    saveStudents();
    if (currentAdmin.isFounder) renderStudentIdCards();
    closeEditModal();
    alert("تم حفظ التعديلات بنجاح!");
}

function deleteStudent(studentId: string): void {
    if (!currentAdmin) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    if (!confirm(`تأكيد حذف الطالب "${student.name}" (${student.id}) نهائياً؟`)) return;
    students = students.filter(s => s.id !== studentId);
    saveStudents();
    if (currentAdmin.isFounder) renderStudentIdCards();
}

function addNewSupervisor(event: Event): void {
    event.preventDefault();
    if (!currentAdmin) return;
    const canManage = currentAdmin.isFounder || currentAdmin.role === "منشئ النظام" || currentAdmin.role === "مدير المدرسة";
    if (!canManage) return;

    const name = (document.getElementById("sup-new-name") as HTMLInputElement).value.trim();
    const role = (document.getElementById("sup-new-role") as HTMLSelectElement).value as SupervisorRole;
    const password = (document.getElementById("sup-new-pass") as HTMLInputElement).value.trim();

    if (supervisors.some(s => s.name === name)) {
        alert("اسم المشرف موجود مسبقاً!");
        return;
    }

    supervisors.push({ name, password, role, isFounder: false });
    saveSupervisors();
    (event.target as HTMLFormElement).reset();
    alert(`تمت إضافة "${name}" بصفة (${role}) بنجاح!`);
}

function removeSupervisor(supName: string): void {
    if (!currentAdmin) return;
    const target = supervisors.find(s => s.name === supName);
    if (!target) return;

    if (target.isFounder) {
        alert("لا يمكن إزالة منشئ النظام!");
        return;
    }

    if (!confirm(`هل أنت متأكد من إزالة المشرف "${supName}"؟`)) return;
    supervisors = supervisors.filter(s => s.name !== supName);
    saveSupervisors();
}

function renderSupervisorsTable(): void {
    const tbody = document.getElementById("supervisors-tbody");
    if (!tbody || !currentAdmin) return;

    tbody.innerHTML = supervisors.map(s => `
        <tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.role}</td>
            <td>
                ${s.isFounder
                    ? `<span style="color:var(--teal); font-weight:700;">منشئ النظام</span>`
                    : `<button type="button" class="btn btn-danger-outline" onclick="removeSupervisor('${s.name}')">إزالة</button>`
                }
            </td>
        </tr>
    `).join("");
}

function exportToExcelCSV(): void {
    if (!currentAdmin || students.length === 0) return;
    const headers = ["رقم الطالب", "اسم الطالب", "الصف", "الفصل", "أيام الحضور", "غياب بعذر", "غياب بدون عذر", "نسبة الانتظام", "الإنجازات"];
    const rows = students.map(s => {
        const total = s.presentDays + s.excusedAbsentDays + s.unexcusedAbsentDays;
        const rate = total > 0 ? Math.round((s.presentDays / total) * 100) : 100;
        return [`"${s.id}"`, `"${s.name}"`, `"${s.grade}"`, `"${s.classroom}"`, s.presentDays, s.excusedAbsentDays, s.unexcusedAbsentDays, `"${rate}%"`, s.achievements.length].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `أثر_تقرير_الانتظام.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportBackupJSON(): void {
    if (!currentAdmin) return;
    const backupData = {
        platform: "أثر",
        students,
        supervisors: supervisors.filter(s => !s.isFounder),
        featuredAchievements,
        visitorLogs
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `أثر_نسخة_احتياطية.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function triggerBackupRestore(): void {
    const fileInput = document.getElementById("restore-backup-input") as HTMLInputElement;
    if (fileInput) { fileInput.value = ""; fileInput.click(); }
}

function importBackupJSON(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(String(e.target?.result || ""));
            const restoredList = Array.isArray(parsed) ? parsed : parsed.students;
            if (!Array.isArray(restoredList)) return;
            students = restoredList;
            saveStudents();
            if (currentAdmin?.isFounder) renderStudentIdCards();
            alert("تمت استعادة النسخة الاحتياطية بنجاح!");
        } catch {
            alert("خطأ أثناء قراءة الملف.");
        }
    };
    reader.readAsText(file);
}

function viewStudentFromAdmin(studentId: string): void {
    const student = students.find(s => s.id === studentId);
    if (student) {
        currentViewedStudentId = student.id;
        openStudentPortal();
    }
}

function renderAdminTable(): void {
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
                    <button type="button" class="btn btn-outline" style="padding:0.35rem 0.65rem; font-size:0.82rem;" onclick="openEditStudentModal('${s.id}')">تعديل</button>
                    <button type="button" class="btn btn-danger-outline" style="padding:0.35rem 0.65rem; font-size:0.82rem;" onclick="deleteStudent('${s.id}')">حذف</button>
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

    const qrDataUrl = generateSharpQrDataUrl(student.id, 220);

    const card = document.createElement("div");
    card.className = "student-id-card";
    card.innerHTML = `
        <div class="id-card-top">البطاقة الطلابية • مدرسة الموهوبين التقنية</div>
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

function renderStudentIdCards(): void {
    const grid = document.getElementById("student-id-cards-grid");
    if (!grid) return;

    grid.innerHTML = "";
    if (students.length === 0) {
        grid.innerHTML = `<p class="empty-cards-msg" style="color:#64748b;">لا توجد بطاقات حالياً.</p>`;
        return;
    }
    students.forEach(student => appendSingleIdCard(student));
}

function populateStudentSelect(): void {
    const optionsHtml = students.length
        ? students.map(s => `<option value="${s.id}">${s.name} (${s.grade} - فصل ${s.classroom || "1"})</option>`).join("")
        : `<option value="">-- سجل طالباً أولاً --</option>`;

    ["select-student", "notice-student-select"].forEach(selId => {
        const el = document.getElementById(selId);
        if (el) el.innerHTML = optionsHtml;
    });
}

function updateDayBanner(): void {
    const dayBanner = document.getElementById("current-day-banner");
    if (!dayBanner) return;

    const dayName = new Date().toLocaleDateString("ar-SA", { weekday: "long" });
    dayBanner.innerHTML = checkNonSchoolDay()
        ? `اليوم: <strong>${dayName}</strong> (${formatToHijri()}) — اليوم إجازة (التحضير متوقف تلقائياً)`
        : `اليوم: <strong>${dayName}</strong> (${formatToHijri()}) — يوم دراسي فعلي (قارئ الباركود نشط)`;
}

function startCameraScanner(): void {
    if (isCameraRunning) return;
    const btn = document.getElementById("start-camera-btn") as HTMLButtonElement;

    try {
        html5QrScanner = new Html5Qrcode("reader");
        html5QrScanner.start(
            { facingMode: "environment" },
            { fps: 12, qrbox: { width: 220, height: 220 } },
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
            if (btn) { btn.innerText = "الكاميرا تعمل"; btn.disabled = true; }
        }).catch(() => {
            alert("تعذر فتح الكاميرا.");
        });
    } catch {}
}

function stopCameraScanner(): void {
    if (html5QrScanner && isCameraRunning) {
        html5QrScanner.stop().then(() => { isCameraRunning = false; }).catch(() => {});
    }
}

window.addEventListener("DOMContentLoaded", () => {
    restoreFromIndexedDBIfNeeded();
    configureDateConstraints();

    const urlParams = new URLSearchParams(window.location.search);
    const scannedStudentId = urlParams.get("id");

    if (scannedStudentId) {
        document.getElementById("portal-landing-page")?.remove();
        document.getElementById("student-search-box")?.remove();
        document.getElementById("admin-login-page")?.remove();
        document.getElementById("admin-dashboard-page")?.remove();
        document.getElementById("header-back-btn")?.remove();
        showPage("student-page");

        const targetStudent = students.find(s => s.id === scannedStudentId.trim().toUpperCase());
        if (targetStudent) {
            renderStudentCard(targetStudent);
        } else {
            const studentPage = document.getElementById("student-page");
            if (studentPage) {
                studentPage.innerHTML = `<div class="panel-card"><h2>سجل الطالب غير موجود</h2><p class="muted-text">الرقم المدرسي (${scannedStudentId}) غير مسجل.</p></div>`;
            }
        }
        return;
    }

    goToPortalHome();
});

(window as any).goToPortalHome = goToPortalHome;
(window as any).openStudentPortal = openStudentPortal;
(window as any).openAdminPortal = openAdminPortal;
(window as any).openVisitorPortal = openVisitorPortal;
(window as any).enterVisitorArea = enterVisitorArea;
(window as any).exitVisitorArea = exitVisitorArea;
(window as any).verifyAdminLogin = verifyAdminLogin;
(window as any).logoutAdmin = logoutAdmin;
(window as any).handleStudentSearch = handleStudentSearch;
(window as any).logoutStudent = logoutStudent;
(window as any).printStudentSingleCard = printStudentSingleCard;
(window as any).handleStudentPhotoUpload = handleStudentPhotoUpload;
(window as any).submitStudentRequest = submitStudentRequest;
(window as any).handleAdminScan = handleAdminScan;
(window as any).addNewStudent = addNewStudent;
(window as any).addAchievement = addAchievement;
(window as any).deleteStudentAchievement = deleteStudentAchievement;
(window as any).processStudentRequest = processStudentRequest;
(window as any).sendNoticeToStudent = sendNoticeToStudent;
(window as any).saveVisitorSettings = saveVisitorSettings;
(window as any).addFeaturedVisitorItem = addFeaturedVisitorItem;
(window as any).deleteFeaturedVisitorItem = deleteFeaturedVisitorItem;
(window as any).adjustAttendanceMetric = adjustAttendanceMetric;
(window as any).closeDatePromptModal = closeDatePromptModal;
(window as any).confirmMetricDate = confirmMetricDate;
(window as any).openEditStudentModal = openEditStudentModal;
(window as any).closeEditModal = closeEditModal;
(window as any).saveEditedStudent = saveEditedStudent;
(window as any).deleteStudent = deleteStudent;
(window as any).addNewSupervisor = addNewSupervisor;
(window as any).removeSupervisor = removeSupervisor;
(window as any).exportToExcelCSV = exportToExcelCSV;
(window as any).exportBackupJSON = exportBackupJSON;
(window as any).triggerBackupRestore = triggerBackupRestore;
(window as any).importBackupJSON = importBackupJSON;
(window as any).viewStudentFromAdmin = viewStudentFromAdmin;
(window as any).startCameraScanner = startCameraScanner;
