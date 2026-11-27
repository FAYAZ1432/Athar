interface Achievement {
    title: string;
    date: string;
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
}

interface StudentRequest {
    id: string;
    studentId: string;
    studentName: string;
    type: "ACHIEVEMENT" | "EXCUSE";
    title: string;
    date: string;
    submittedAt: string;
}

interface SupervisorAccount {
    name: string;
    password: string;
    isFounder: boolean;
}

declare var QRious: any;
declare var JsBarcode: any;
declare var Html5Qrcode: any;

const STUDENTS_KEY = "athar_students_v3";
const REQUESTS_KEY = "athar_requests_v3";
const SUPERVISORS_KEY = "athar_supervisors_v3";
const MIN_ALLOWED_DATE = "2025-01-01";

// المؤسسون الأساسيون (حسابات محمية لا يمكن لأحدهما إزالة الآخر)
const FOUNDER_ACCOUNTS: SupervisorAccount[] = [
    { name: "فايز الحربي", password: "2443422", isFounder: true },
    { name: "علي المتحمي", password: "2443422", isFounder: true }
];

// الإجازات المطولة والرسمية المدمجة في النظام تلقائياً (دون عرض قوائمها)
const INTERNAL_HOLIDAY_RANGES: Array<{ start: string; end: string }> = [
    { start: "2026-12-13", end: "2026-12-13" },
    { start: "2027-01-01", end: "2027-01-09" },
    { start: "2027-02-22", end: "2027-02-22" },
    { start: "2027-03-05", end: "2027-03-15" },
    { start: "2027-05-14", end: "2027-05-22" },
    { start: "2027-05-28", end: "2027-08-21" }
];

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23e2e8f0'/><circle cx='50' cy='38' r='18' fill='%2364748b'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2364748b'/></svg>";

let students: Student[] = loadJson<Student[]>(STUDENTS_KEY, []);
let studentRequests: StudentRequest[] = loadJson<StudentRequest[]>(REQUESTS_KEY, []);
let supervisors: SupervisorAccount[] = loadSupervisors();

let currentAdmin: SupervisorAccount | null = null;
let currentViewedStudentId: string = "";
let html5QrScanner: any = null;
let isCameraRunning = false;
let lastScanCode = "";
let lastScanTime = 0;

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.error(e);
    }
    return fallback;
}

function loadSupervisors(): SupervisorAccount[] {
    const saved = loadJson<SupervisorAccount[]>(SUPERVISORS_KEY, []);
    const nonFounders = saved.filter(s => !s.isFounder && !FOUNDER_ACCOUNTS.some(f => f.name === s.name));
    return [...FOUNDER_ACCOUNTS, ...nonFounders];
}

function saveSupervisors(): void {
    const nonFounders = supervisors.filter(s => !s.isFounder);
    localStorage.setItem(SUPERVISORS_KEY, JSON.stringify(nonFounders));
    renderSupervisorsTable();
}

function saveStudents(): void {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
    renderAdminTable();
    populateStudentSelect();
}

function saveRequests(): void {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(studentRequests));
    renderAdminRequests();
}

function getTodayDateISO(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// ضبط الحدود المنطقية للتواريخ (من 2025-01-01 حتى اليوم فقط)
function configureDateConstraints(): void {
    const today = getTodayDateISO();
    ["ach-date", "req-ach-date", "req-excuse-date"].forEach(id => {
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

// التحقق التلقائي من عطلة نهاية الأسبوع (الجمعة والسبت) والإجازات المطولة
function checkNonSchoolDay(): boolean {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6) return true;

    const todayISO = getTodayDateISO();
    return INTERNAL_HOLIDAY_RANGES.some(r => todayISO >= r.start && todayISO <= r.end);
}

// توليد QR فائق الوضوح + باركود Code128 للقارئ الليزري
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
        } catch (e) {
            console.error(e);
        }
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
        backBtn.style.display = pageId === "portal-landing-page" ? "none" : "inline-flex";
    }
}

function goToPortalHome(): void {
    stopCameraScanner();
    showPage("portal-landing-page");
}

function openStudentPortal(): void {
    showPage("student-page");
    configureDateConstraints();
}

function openLeaderboardPage(): void {
    showPage("leaderboard-page");
    renderLeaderboard();
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

    const badge = document.getElementById("active-admin-badge");
    if (badge) {
        badge.innerText = `${currentAdmin.name} ${currentAdmin.isFounder ? "(مؤسس النظام)" : "(مشرف)"}`;
    }

    // إظهار قسم إدارة المشرفين للمؤسسين (فايز الحربي وعلي المتحمي) فقط
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

    const laserInput = document.getElementById("manual-id-input") as HTMLInputElement;
    if (laserInput) setTimeout(() => laserInput.focus(), 100);
}

function logoutAdmin(): void {
    currentAdmin = null;
    stopCameraScanner();
    goToPortalHome();
}

// لوحة الشرف التفاعلية (الأكثر حضوراً وانتظاماً أولاً)
function renderLeaderboard(): void {
    const gradeFilter = (document.getElementById("lb-grade-filter") as HTMLSelectElement)?.value || "ALL";
    const classFilter = (document.getElementById("lb-class-filter") as HTMLSelectElement)?.value || "ALL";

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

    const podium = document.getElementById("leaderboard-podium")!;
    const tbody = document.getElementById("leaderboard-tbody")!;

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

// عرض ملف الطالب وبطاقته
function renderStudentCard(student: Student): void {
    currentViewedStudentId = student.id;
    const profileView = document.getElementById("student-profile-view")!;
    profileView.classList.remove("hidden");
    configureDateConstraints();

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

    const achList = document.getElementById("p-achievements-list")!;
    achList.innerHTML = student.achievements.length
        ? student.achievements.map(a => `<li>🏆 <strong>${a.title}</strong> <span style="color:#64748b; font-size:0.85rem;">(بتاريخ: ${a.date})</span></li>`).join("")
        : "<li>لا توجد إنجازات معتمدة حتى الآن.</li>";

    const logsList = document.getElementById("p-logs-list")!;
    logsList.innerHTML = student.attendanceLogs.length
        ? student.attendanceLogs.slice(0, 15).map(log => `<li>${log}</li>`).join("")
        : "<li>لا يوجد سجل حضور أو غياب مسجل بعد.</li>";
}

function handleStudentSearch(): void {
    const input = document.getElementById("student-search-input") as HTMLInputElement;
    const targetId = extractStudentId(input.value);
    const student = students.find(s => s.id === targetId);

    if (!student) {
        alert("الرقم المدرسي غير مسجل في منصة أثر!");
        document.getElementById("student-profile-view")!.classList.add("hidden");
        return;
    }
    renderStudentCard(student);
}

function printStudentSingleCard(): void {
    document.body.classList.add("printing-single-card");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-single-card"), 500);
}

// رفع الصورة الشخصية للطالب (مع ضغطها تلقائياً للحفاظ على سرعة التخزين)
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
        img.src = String(e.target?.result || "");
    };
    reader.readAsDataURL(file);
}

// إرسال طلب إنجاز أو عذر غياب من الطالب إلى المشرف
function submitStudentRequest(event: Event, type: "ACHIEVEMENT" | "EXCUSE"): void {
    event.preventDefault();
    const student = students.find(s => s.id === currentViewedStudentId);
    if (!student) return;

    const titleEl = document.getElementById(type === "ACHIEVEMENT" ? "req-ach-title" : "req-excuse-reason") as HTMLInputElement;
    const dateEl = document.getElementById(type === "ACHIEVEMENT" ? "req-ach-date" : "req-excuse-date") as HTMLInputElement;

    if (!isValidHistoricalDate(dateEl.value)) {
        alert(`⚠️ التاريخ غير صحيح! يجب أن يكون بين ${MIN_ALLOWED_DATE} وتاريخ اليوم (${getTodayDateISO()}).`);
        return;
    }

    const req: StudentRequest = {
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
    (event.target as HTMLFormElement).reset();
    alert(type === "ACHIEVEMENT"
        ? "✅ تم إرسال طلب توثيق الإنجاز إلى المشرف للمراجعة والاعتماد!"
        : "✅ تم رفع عذر الغياب إلى المشرف بنجاح!");
}

function getFormattedNow(): string {
    const now = new Date();
    const dayName = now.toLocaleDateString("ar-SA", { weekday: "long" });
    return `${dayName} ${getTodayDateISO()} — الساعة ${now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
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

// قارئ الباركود المدرسي
function recordAttendanceByScanner(rawInput: string): void {
    if (!currentAdmin) return;

    const resultBox = document.getElementById("scan-result")!;
    resultBox.classList.remove("hidden", "success", "error", "warning");

    const isDemoMode = (document.getElementById("demo-mode-checkbox") as HTMLInputElement)?.checked;
    if (checkNonSchoolDay() && !isDemoMode) {
        playBeep(false);
        resultBox.classList.add("warning");
        resultBox.innerHTML = `⛔ اليوم عطلة نهاية أسبوع أو إجازة مطولة — التحضير التلقائي متوقف.`;
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

function handleAdminScan(): void {
    const input = document.getElementById("manual-id-input") as HTMLInputElement;
    if (input.value.trim()) {
        recordAttendanceByScanner(input.value);
        input.value = "";
        input.focus();
    }
}

function addNewStudent(event: Event): void {
    event.preventDefault();
    if (!currentAdmin) return;

    const id = (document.getElementById("new-id") as HTMLInputElement).value.trim().toUpperCase();
    const name = (document.getElementById("new-name") as HTMLInputElement).value.trim();
    const grade = (document.getElementById("new-grade") as HTMLSelectElement).value;
    const classroom = (document.getElementById("new-classroom") as HTMLSelectElement).value;

    if (!grade || !classroom) {
        alert("يرجى اختيار الصف الدراسي والفصل!");
        return;
    }
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
        achievements: []
    };

    students.push(newStudent);
    saveStudents();
    appendSingleIdCard(newStudent);
    (event.target as HTMLFormElement).reset();
    alert(`✅ تم تسجيل الطالب ${name} وإصدار بطاقة أثر بنجاح!`);
}

function addAchievement(event: Event): void {
    event.preventDefault();
    if (!currentAdmin) return;

    const studentId = (document.getElementById("select-student") as HTMLSelectElement).value;
    const title = (document.getElementById("ach-title") as HTMLInputElement).value.trim();
    const date = (document.getElementById("ach-date") as HTMLInputElement).value;

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
        (event.target as HTMLFormElement).reset();
        alert("✅ تم توثيق الإنجاز في سجل الطالب بنجاح!");
    }
}

// معالجة طلبات الطلاب الواردة (اعتماد / رفض)
function renderAdminRequests(): void {
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

function approveStudentRequest(reqId: string): void {
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

function rejectStudentRequest(reqId: string): void {
    if (!currentAdmin) return;
    studentRequests = studentRequests.filter(r => r.id !== reqId);
    saveRequests();
}

function adjustAttendanceMetric(studentId: string, field: "presentDays" | "excusedAbsentDays" | "unexcusedAbsentDays", change: number): void {
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

// نافذة تعديل سجل الطالب لتصحيح أخطاء التحضير
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
    student.attendanceLogs.unshift(`✏️ تعديل سجل (${note || "تصحيح بيانات التحضير"}): ${getFormattedNow()} — المشرف: ${currentAdmin.name}`);

    saveStudents();
    renderStudentIdCards();
    closeEditModal();
    alert("✅ تم حفظ التعديلات وتحديث سجل الطالب بنجاح!");
}

function deleteStudent(studentId: string): void {
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

// إدارة حسابات المشرفين (حصرية للمؤسسين فايز وعلي فقط)
function addNewSupervisor(event: Event): void {
    event.preventDefault();
    if (!currentAdmin || !currentAdmin.isFounder) return;

    const name = (document.getElementById("sup-new-name") as HTMLInputElement).value.trim();
    const password = (document.getElementById("sup-new-pass") as HTMLInputElement).value.trim();

    if (supervisors.some(s => s.name === name)) {
        alert("اسم المشرف موجود مسبقاً!");
        return;
    }

    supervisors.push({ name, password, isFounder: false });
    saveSupervisors();
    (event.target as HTMLFormElement).reset();
    alert(`✅ تمت إضافة المشرف "${name}" بنجاح!`);
}

function removeSupervisor(supName: string): void {
    if (!currentAdmin || !currentAdmin.isFounder) return;

    const target = supervisors.find(s => s.name === supName);
    if (!target) return;

    // حماية مطلقة للمؤسسين: لا يمكن لفايز أو علي إزالة أحدهما الآخر
    if (target.isFounder) {
        alert("⛔ حسابات المؤسسين (فايز الحربي وعلي المتحمي) محمية ولا يمكن إزالتها نهائياً!");
        return;
    }

    if (!confirm(`هل أنت متأكد من إزالة المشرف "${supName}"؟`)) return;
    supervisors = supervisors.filter(s => s.name !== supName);
    saveSupervisors();
}

function renderSupervisorsTable(): void {
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

function exportToExcelCSV(): void {
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

function exportBackupJSON(): void {
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

function triggerBackupRestore(): void {
    if (!currentAdmin) return;
    const fileInput = document.getElementById("restore-backup-input") as HTMLInputElement;
    if (fileInput) { fileInput.value = ""; fileInput.click(); }
}

function importBackupJSON(event: Event): void {
    if (!currentAdmin) return;
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
            if (!confirm(`سيتم استبدال البيانات الحالية بـ (${restoredList.length}) طالب. هل تريد المتابعة؟`)) return;

            students = restoredList.map((s: any) => ({
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
        } catch {
            alert("❌ خطأ أثناء قراءة ملف النسخة الاحتياطية.");
        }
    };
    reader.readAsText(file);
}

function viewStudentFromAdmin(studentId: string): void {
    const student = students.find(s => s.id === studentId);
    if (student) {
        openStudentPortal();
        renderStudentCard(student);
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
                    <button type="button" class="btn btn-outline" style="padding:0.35rem 0.65rem; font-size:0.82rem;" onclick="openEditStudentModal('${s.id}')">✏️ تعديل</button>
                    <button type="button" class="btn btn-danger-outline" style="padding:0.35rem 0.65rem; font-size:0.82rem;" onclick="deleteStudent('${s.id}')">🗑️ حذف</button>
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
    const select = document.getElementById("select-student");
    if (!select) return;
    if (students.length === 0) {
        select.innerHTML = `<option value="">-- سجل طالباً أولاً --</option>`;
        return;
    }
    select.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.grade} - فصل ${s.classroom || "1"})</option>`).join("");
}

function updateDayBanner(): void {
    const dayBanner = document.getElementById("current-day-banner");
    if (!dayBanner) return;

    const dayName = new Date().toLocaleDateString("ar-SA", { weekday: "long" });
    dayBanner.innerHTML = checkNonSchoolDay()
        ? `اليوم: <strong>${dayName}</strong> (${getTodayDateISO()}) — ⛔ إجازة رسمية / نهاية أسبوع (التحضير متوقف تلقائياً)`
        : `اليوم: <strong>${dayName}</strong> (${getTodayDateISO()}) — ✅ يوم دراسي فعلي (قارئ الباركود نشط)`;
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
            if (btn) { btn.innerText = "✅ الكاميرا تعمل"; btn.disabled = true; }
        }).catch(() => {
            alert("تعذر فتح الكاميرا. استخدم قارئ الباركود الليزري مباشرة.");
        });
    } catch {
        alert("مكتبة الكاميرا غير متاحة.");
    }
}

function stopCameraScanner(): void {
    if (html5QrScanner && isCameraRunning) {
        html5QrScanner.stop().then(() => { isCameraRunning = false; }).catch(() => {});
    }
}

window.addEventListener("DOMContentLoaded", () => {
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
                studentPage.innerHTML = `<div class="panel-card"><h2>❌ سجل الطالب غير موجود</h2><p class="muted-text">الرقم المدرسي (${scannedStudentId}) غير مسجل.</p></div>`;
            }
        }
        return;
    }

    goToPortalHome();
});

(window as any).goToPortalHome = goToPortalHome;
(window as any).openStudentPortal = openStudentPortal;
(window as any).openAdminPortal = openAdminPortal;
(window as any).openLeaderboardPage = openLeaderboardPage;
(window as any).renderLeaderboard = renderLeaderboard;
(window as any).verifyAdminLogin = verifyAdminLogin;
(window as any).logoutAdmin = logoutAdmin;
(window as any).handleStudentSearch = handleStudentSearch;
(window as any).printStudentSingleCard = printStudentSingleCard;
(window as any).handleStudentPhotoUpload = handleStudentPhotoUpload;
(window as any).submitStudentRequest = submitStudentRequest;
(window as any).handleAdminScan = handleAdminScan;
(window as any).addNewStudent = addNewStudent;
(window as any).addAchievement = addAchievement;
(window as any).approveStudentRequest = approveStudentRequest;
(window as any).rejectStudentRequest = rejectStudentRequest;
(window as any).adjustAttendanceMetric = adjustAttendanceMetric;
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
