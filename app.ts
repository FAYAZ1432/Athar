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

const STORAGE_KEY = "smart_school_id_v5";

const defaultStudents: Student[] = [
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

function loadStudentsFromStorage(): Student[] {
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

function recordAttendance(rawInput: string): void {
    const urlParams = new URLSearchParams(window.location.search);
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
        : "<li>لا يوجد سجل
