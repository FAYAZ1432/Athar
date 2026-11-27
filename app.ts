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

const initialStudents: Student[] = [
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

let students: Student[] = JSON.parse(localStorage.getItem("smart_school_v2") || "null") || initialStudents;

function saveData(): void {
    localStorage.setItem("smart_school_v2", JSON.stringify(students));
    renderAdminTable();
    populateStudentSelect();
}

function extractStudentId(scannedData: string): string {
    const clean = scannedData.trim();
    if (clean.includes("student=")) {
        try {
            const url = new URL(clean);
            return (url.searchParams.get("student") || "").toUpperCase();
        } catch {
            const parts = clean.split("student=");
            return parts[1].split("&")[0].toUpperCase();
        }
    }
    return clean.toUpperCase();
}

function generateStudentProfileUrl(studentId: string): string {
    const baseUrl = window.location.href.split("?")[0];
    return `${baseUrl}?student=${studentId}`;
}

function switchTab(tabName: string): void {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));

    const targetSection = document.getElementById(`${tabName}-section`);
    if (targetSection) targetSection.classList.add("active");

    const buttons = document.querySelectorAll(".tab-btn");
    if (tabName === "gate") buttons[0].classList.add("active");
    if (tabName === "profile") buttons[1].classList.add("active");
    if (tabName === "admin") buttons[2].classList.add("active");
}

function recordAttendance(rawInput: string): void {
    const resultBox = document.getElementById("scan-result")!;
    resultBox.classList.remove("hidden", "success", "error", "warning");

    // 0 = الأحد، 1 = الإثنين، 2 = الثلاثاء، 3 = الأربعاء، 4 = الخميس
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isDemoMode = (document.getElementById("demo-mode-checkbox") as HTMLInputElement)?.checked;

    if ((dayOfWeek === 5 || dayOfWeek === 6) && !isDemoMode) {
        resultBox.classList.add("warning");
        resultBox.innerText = "⛔ عذراً، التحضير متاح في أيام الدراسة فقط (من الأحد إلى الخميس).";
        return;
    }

    const studentId = extractStudentId(rawInput);
    const student = students.find(s => s.id === studentId);

    if (!student) {
        resultBox.classList.add("error");
        resultBox.innerText = `❌ الباركود غير مسجل في النظام: ${studentId}`;
        return;
    }

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

function loadStudentProfile(studentIdParam?: string): void {
    const input = document.getElementById("profile-search-input") as HTMLInputElement;
    const targetId = extractStudentId(studentIdParam || input.value);
    const student = students.find(s => s.id === targetId);
    const profileView = document.getElementById("student-profile-view")!;

    if (!student) {
        alert("رقم الطالب غير موجود!");
        profileView.classList.add("hidden");
        return;
    }

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
        text: generateStudentProfileUrl(student.id),
        width: 120,
        height: 120
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
    alert(`تم إنشاء بطاقة الطالب ${name} بنجاح!`);
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
        alert("تمت إضافة الإنجاز إلى ملف الطالب!");
    }
}

function renderAdminTable(): void {
    const tbody = document.getElementById("admin-students-tbody")!;
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
                onclick="switchTab('profile'); loadStudentProfile('${s.id}')">عرض الباركود والملف</button>
            </td>
        </tr>
    `).join("");
}

function populateStudentSelect(): void {
    const select = document.getElementById("select-student")!;
    select.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join("");
}

window.addEventListener("DOMContentLoaded", () => {
    saveData();

    const urlParams = new URLSearchParams(window.location.search);
    const studentParam = urlParams.get("student");

    if (studentParam) {
        document.getElementById("main-navbar")?.classList.add("hidden");
        document.getElementById("profile-search-bar")?.classList.add("hidden");
        switchTab("profile");
        loadStudentProfile(studentParam);
        return;
    }

    try {
        const html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 220 }, false);
        html5QrcodeScanner.render((decodedText: string) => {
            recordAttendance(decodedText);
        });
    } catch (e) {
        console.log("الكاميرا غير متاحة.");
    }
});

(window as any).switchTab = switchTab;
(window as any).handleManualScan = handleManualScan;
(window as any).loadStudentProfile = loadStudentProfile;
(window as any).addNewStudent = addNewStudent;
(window as any).addAchievement = addAchievement;
(window as any).updateAbsence = updateAbsence;
