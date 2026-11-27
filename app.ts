interface Achievement {
    title: string;
    date: string;
}

interface Student {
    id: string;
    name: string;
    grade: string;
    presentDays: number;
    absentDays: number;
    attendanceLogs: string[];
    achievements: Achievement[];
}

declare var QRCode: any;
declare var Html5QrcodeScanner: any;

const STORAGE_KEY = "smart_school_id_v4";

const defaultStudents: Student[] = [
    {
        id: "STU-101",
        name: "فايز الحربي",
        grade: "الثالث ثانوي - الموهوبون",
        presentDays: 45,
        absentDays: 1,
        attendanceLogs: ["الأحد - 06:55 ص", "الإثنين - 06:50 ص"],
        achievements: [
            { title: "ابتكار نظام الهوية المدرسية الذكية", date: "2026-11-20" },
            { title: "شهادة تميز في البرمجة والتقنية", date: "2026-10-15" }
        ]
    },
    {
        id: "STU-102",
        name: "علي المتحمي",
        grade: "الثالث ثانوي - الموهوبون",
        presentDays: 46,
        absentDays: 0,
        attendanceLogs: ["الأحد - 06:52 ص", "الإثنين - 06:48 ص"],
        achievements: [
            { title: "تصميم وتطوير نظام الهوية المدرسية الذكية", date: "2026-11-20" },
            { title: "المركز الأول في مسابقة الابتكار التقني", date: "2026-09-28" }
        ]
    }
];

function loadStudentsFromStorage(): Student[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.error("Storage read error:", e);
    }
    return JSON.parse(JSON.stringify(defaultStudents));
}

let students: Student[] = loadStudentsFromStorage();
let lastScanTime = 0;

function saveData(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
    } catch (e) {
        console.error("Storage save error:", e);
    }
    renderAdminTable();
    populateStudentSelect();
}

// تشفير مضغوط وخفيف للبيانات داخل رابط QR لسهولة القراءة السريعة بالكاميرا
function encodeStudentCompact(student: Student): string {
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

function decodeStudentCompact(encoded: string): Student | null {
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
                ? arr[5].map((item: string) => {
                      const [title, date] = item.split("|");
                      return { title: title || "", date: date || "" };
                  })
                : [],
            attendanceLogs: Array.isArray(arr[6]) ? arr[6] : []
        };
    } catch {
        return null;
    }
}

function generateStudentProfileUrl(student: Student): string {
    const baseUrl = window.location.href.split("?")[0];
    const compactData = encodeStudentCompact(student);
    return `${baseUrl}?id=${encodeURIComponent(student.id)}&d=${encodeURIComponent(compactData)}`;
}

function extractStudentId(scannedData: string): string {
    const clean = scannedData.trim();
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

// التحقق الصارم: هل اليوم من الأحد (0) إلى الخميس (4)؟
function isSchoolDay(): boolean {
    const dayOfWeek = new Date().getDay();
    return dayOfWeek >= 0 && dayOfWeek <= 4;
}

function switchTab(tabName: string): void {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));

    const targetSection = document.getElementById(`${tabName}-section`);
    if (targetSection) targetSection.classList.add("active");

    const buttons = document.querySelectorAll(".tab-btn");
    if (tabName === "gate") buttons[0]?.classList.add("active");
    if (tabName === "profile") buttons[1]?.classList.add("active");
    if (tabName === "admin") buttons[2]?.classList.add("active");
}

// تسجيل الحضور عند ماسح البوابة فقط
function recordAttendance(rawInput: string): void {
    const urlParams = new URLSearchParams(window.location.search);
    // منع التحضير نهائياً إذا كان الرابط مفتوحاً لعرض ملف الطالب بالجوال
    if (urlParams.has("id") || urlParams.has("d")) return;

    const resultBox = document.getElementById("scan-result")!;
    resultBox.classList.remove("hidden", "success", "error", "warning");

    const demoCheckbox = document.getElementById("demo-mode-checkbox") as HTMLInputElement | null;
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

function handleManualScan(): void {
    const input = document.getElementById("manual-id-input") as HTMLInputElement;
    if (input.value) {
        recordAttendance(input.value);
        input.value = "";
    }
}

function renderStudentCard(student: Student): void {
    const profileView = document.getElementById("student-profile-view")!;
    profileView.classList.remove("hidden");

    document.getElementById("p-name")!.innerText = student.name;
    document.getElementById("p-grade")!.innerText = student.grade;
    document.getElementById("p-id")!.innerText = student.id;
    document.getElementById("p-present")!.innerText = student.presentDays.toString();
    document.getElementById("p-absent")!.innerText = student.absentDays.toString();

    const totalDays = student.presentDays + student.absentDays;
    const rate = totalDays > 0 ? Math.round((student.presentDays / totalDays) * 100) : 100;
    document.getElementById("p-rate")!.innerText = `${rate}%`;

    const qrContainer = document.getElementById("p-qrcode")!;
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: generateStudentProfileUrl(student),
        width: 165,
        height: 165,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
    });

    const achList = document.getElementById("p-achievements-list")!;
    achList.innerHTML = student.achievements.length
        ? student.achievements.map(a => `<li>🏆 <strong>${a.title}</strong> <span style="color:#64748b; font-size:0.85rem;">(${a.date})</span></li>`).join("")
        : "<li>لا توجد إنجازات مسجلة بعد.</li>";

    const logsList = document.getElementById("p-logs-list")!;
    logsList.innerHTML = student.attendanceLogs.length
        ? student.attendanceLogs.slice(0, 7).map(log => `<li>✅ حضور: ${log}</li>`).join("")
        : "<li>لا يوجد سجل حضور بعد.</li>";
}

function handleProfileSearch(): void {
    const input = document.getElementById("profile-search-input") as HTMLInputElement;
    loadStudentProfileById(input.value);
}

function loadStudentProfileById(rawId: string): void {
    const targetId = extractStudentId(rawId);
    const student = students.find(s => s.id === targetId);
    if (!student) {
        alert("رقم الطالب غير موجود في السجل!");
        document.getElementById("student-profile-view")!.classList.add("hidden");
        return;
    }
    renderStudentCard(student);
}

function updateAbsence(studentId: string, change: number): void {
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.absentDays = Math.max(0, student.absentDays + change);
        saveData();
    }
}

function addNewStudent(event: Event): void {
    event.preventDefault();
    const id = (document.getElementById("new-id") as HTMLInputElement).value.trim().toUpperCase();
    const name = (document.getElementById("new-name") as HTMLInputElement).value.trim();
    const grade = (document.getElementById("new-grade") as HTMLInputElement).value.trim();

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
    (event.target as HTMLFormElement).reset();
    alert(`تم حفظ الطالب ${name} وإنشاء الباركود الخاص به!`);
}

function addAchievement(event: Event): void {
    event.preventDefault();
    const studentId = (document.getElementById("select-student") as HTMLSelectElement).value;
    const title = (document.getElementById("ach-title") as HTMLInputElement).value.trim();
    const date = (document.getElementById("ach-date") as HTMLInputElement).value;

    const student = students.find(s => s.id === studentId);
    if (student) {
        student.achievements.unshift({ title, date });
        saveData();
        (event.target as HTMLFormElement).reset();
        alert("تمت إضافة الإنجاز وحفظه في ملف الطالب!");
    }
}

function resetSystemData(): void {
    if (confirm("هل تريد استعادة البيانات الافتراضية للنظام؟")) {
        localStorage.removeItem(STORAGE_KEY);
        students = loadStudentsFromStorage();
        saveData();
    }
}

function renderAdminTable(): void {
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

function populateStudentSelect(): void {
    const select = document.getElementById("select-student");
    if (!select) return;
    select.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join("");
}

window.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get("id");
    const compactData = urlParams.get("d");

    // إذا فُتح الرابط عبر مسح الباركود بالجوال -> اعرض الملف فقط وامنع التحضير والكاميرا نهائياً
    if (studentId || compactData) {
        document.getElementById("main-navbar")?.remove();
        document.getElementById("profile-search-bar")?.remove();
        document.getElementById("gate-section")?.remove();
        document.getElementById("admin-section")?.remove();
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

    // وضع البوابة والإدارة
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
        html5QrcodeScanner.render((decodedText: string) => {
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

(window as any).switchTab = switchTab;
(window as any).handleManualScan = handleManualScan;
(window as any).handleProfileSearch = handleProfileSearch;
(window as any).loadStudentProfileById = loadStudentProfileById;
(window as any).addNewStudent = addNewStudent;
(window as any).addAchievement = addAchievement;
(window as any).updateAbsence = updateAbsence;
(window as any).resetSystemData = resetSystemData;
