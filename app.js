"use strict";
class SmartSchoolSystem {
    constructor() {
        this.students = [];
        this.STORAGE_KEY = 'smart_school_id_data_v1';
        this.activeProfileId = null;
        this.loadData();
        this.initEventListeners();
        this.renderAll();
        this.checkUrlForStudentScan();
    }
    loadData() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            this.students = JSON.parse(saved);
        }
        else {
            this.students = [
                {
                    id: 'STU-144801',
                    fullName: 'فايز الحربي',
                    grade: 'الثالث الثانوي',
                    section: 'موهوبون - أ',
                    presentDays: 42,
                    lateDays: 1,
                    absentDays: 0,
                    attendanceLogs: [
                        { date: '1448/04/15', time: '06:48 ص', status: 'present', method: 'بوابة QR الذكية' },
                        { date: '1448/04/14', time: '06:51 ص', status: 'present', method: 'بوابة QR الذكية' }
                    ],
                    achievements: [
                        {
                            id: 'ACH-1',
                            title: 'المركز الأول في الأولمبياد الوطني للإبداع العلمي - مسار التقنية والابتكار',
                            category: 'جائزة ابتكار',
                            date: '1448/04/10',
                            issuer: 'مؤسسة الملك عبدالعزيز ورجاله للموهبة والإبداع'
                        },
                        {
                            id: 'ACH-2',
                            title: 'شهادة التميز والانضباط المدرسي المثالي',
                            category: 'شهادة تفوق',
                            date: '1448/03/25',
                            issuer: 'إدارة المدرسة'
                        }
                    ]
                },
                {
                    id: 'STU-144802',
                    fullName: 'عبدالله السبيعي',
                    grade: 'الثاني الثانوي',
                    section: 'عام - ب',
                    presentDays: 38,
                    lateDays: 3,
                    absentDays: 2,
                    attendanceLogs: [
                        { date: '1448/04/15', time: '07:05 ص', status: 'late', method: 'بوابة QR الذكية' }
                    ],
                    achievements: [
                        {
                            id: 'ACH-3',
                            title: 'وسام المبادرة التطوعية في خدمة البيئة المدرسية',
                            category: 'مشاركة مجتمعية',
                            date: '1448/03/18',
                            issuer: 'رائد النشاط الطلابي'
                        }
                    ]
                },
                {
                    id: 'STU-144803',
                    fullName: 'سعود القحطاني',
                    grade: 'الأول الثانوي',
                    section: 'موهوبون - أ',
                    presentDays: 40,
                    lateDays: 0,
                    absentDays: 1,
                    attendanceLogs: [
                        { date: '1448/04/15', time: '06:45 ص', status: 'present', method: 'بوابة QR الذكية' }
                    ],
                    achievements: [
                        {
                            id: 'ACH-4',
                            title: 'المركز الثاني في مسابقة الروبوت والذكاء الاصطناعي',
                            category: 'مسابقة علمية',
                            date: '1448/04/02',
                            issuer: 'إدارة التعليم'
                        }
                    ]
                }
            ];
            this.saveData();
        }
    }
    saveData() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.students));
    }
    calculateAttendanceRate(student) {
        const total = student.presentDays + student.lateDays + student.absentDays;
        if (total === 0)
            return 100;
        const weightedPresent = student.presentDays + student.lateDays * 0.5;
        return Math.round((weightedPresent / total) * 100);
    }
    checkUrlForStudentScan() {
        const params = new URLSearchParams(window.location.search);
        const scannedId = params.get('student');
        if (scannedId) {
            const exists = this.students.find((s) => s.id === scannedId);
            if (exists) {
                this.openStudentProfile(scannedId);
            }
        }
    }
    scanAtGate(studentId) {
        const student = this.students.find((s) => s.id.toUpperCase() === studentId.trim().toUpperCase());
        const feedbackEl = document.getElementById('gate-feedback');
        if (!student) {
            feedbackEl.className = 'gate-feedback error';
            feedbackEl.innerHTML = `❌ الرمز غير مسجل في النظام: <strong>${studentId}</strong>`;
            return;
        }
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('ar-SA');
        student.presentDays += 1;
        student.attendanceLogs.unshift({
            date: dateStr,
            time: timeStr,
            status: 'present',
            method: 'بوابة QR الذكية'
        });
        this.saveData();
        this.renderAll();
        feedbackEl.className = 'gate-feedback success';
        feedbackEl.innerHTML = `
      <div>
        ✅ <strong>تم التعرف على الطالب وتسجيل حضوره بنجاح!</strong><br>
        <span>الطالب: <b>${student.fullName}</b> (${student.grade}) — وقت الدخول: <b>${timeStr}</b></span>
      </div>
      <button class="btn btn-sm btn-light" onclick="schoolApp.openStudentProfile('${student.id}')">فتح الملف الرقمي</button>
    `;
    }
    recordManualAttendance(studentId, status) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('ar-SA');
        if (status === 'present')
            student.presentDays += 1;
        if (status === 'late')
            student.lateDays += 1;
        if (status === 'absent')
            student.absentDays += 1;
        student.attendanceLogs.unshift({
            date: dateStr,
            time: status === 'absent' ? '—' : timeStr,
            status,
            method: 'رصد إداري'
        });
        this.saveData();
        this.renderAll();
    }
    addNewStudent(fullName, grade, section) {
        const randomNum = Math.floor(144804 + Math.random() * 899);
        const newStudent = {
            id: `STU-${randomNum}`,
            fullName,
            grade,
            section,
            presentDays: 1,
            lateDays: 0,
            absentDays: 0,
            attendanceLogs: [
                {
                    date: new Date().toLocaleDateString('ar-SA'),
                    time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
                    status: 'present',
                    method: 'رصد إداري'
                }
            ],
            achievements: []
        };
        this.students.unshift(newStudent);
        this.saveData();
        this.renderAll();
        this.openStudentProfile(newStudent.id);
    }
    deleteStudent(studentId) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        const confirmed = confirm(`هل أنت متأكد من حذف ملف الطالب "${student.fullName}" نهائياً؟`);
        if (!confirmed)
            return;
        this.students = this.students.filter((s) => s.id !== studentId);
        this.saveData();
        this.renderAll();
        if (this.activeProfileId === studentId) {
            document.getElementById('profile-modal')?.classList.remove('open');
            this.activeProfileId = null;
        }
    }
    addAchievement(studentId, title, category, issuer) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        student.achievements.unshift({
            id: `ACH-${Date.now()}`,
            title,
            category,
            date: new Date().toLocaleDateString('ar-SA'),
            issuer
        });
        this.saveData();
        this.renderAll();
        if (this.activeProfileId === studentId) {
            this.openStudentProfile(studentId);
        }
    }
    openStudentProfile(studentId) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        this.activeProfileId = student.id;
        const rate = this.calculateAttendanceRate(student);
        document.getElementById('card-student-name').textContent = student.fullName;
        document.getElementById('card-student-grade').textContent = `${student.grade} — ${student.section}`;
        document.getElementById('card-student-id').textContent = student.id;
        const qrContainer = document.getElementById('card-qr-box');
        qrContainer.innerHTML = '';
        const baseUrl = window.location.href.split('?')[0];
        const profileUrl = `${baseUrl}?student=${encodeURIComponent(student.id)}`;
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: profileUrl,
                width: 115,
                height: 115,
                colorDark: '#0b2533',
                colorLight: '#ffffff'
            });
        }
        document.getElementById('profile-present').textContent = String(student.presentDays);
        document.getElementById('profile-late').textContent = String(student.lateDays);
        document.getElementById('profile-absent').textContent = String(student.absentDays);
        document.getElementById('profile-rate').textContent = `${rate}%`;
        const achList = document.getElementById('profile-achievements-list');
        if (student.achievements.length === 0) {
            achList.innerHTML = `<p class="empty-msg">لا توجد إنجازات مسجلة بعد. يمكنك إضافة إنجاز من لوحة الإدارة.</p>`;
        }
        else {
            achList.innerHTML = student.achievements
                .map((ach) => `
          <div class="achievement-item">
            <span class="badge-category">${ach.category}</span>
            <h4>${ach.title}</h4>
            <small>الجهة المانحة: ${ach.issuer} | التاريخ: ${ach.date}</small>
          </div>
        `)
                .join('');
        }
        const logsList = document.getElementById('profile-logs-list');
        logsList.innerHTML = student.attendanceLogs
            .slice(0, 6)
            .map((log) => {
            const label = log.status === 'present' ? 'حاضر' : log.status === 'late' ? 'متأخر' : 'غائب';
            return `
          <tr>
            <td>${log.date}</td>
            <td>${log.time}</td>
            <td><span class="status-pill ${log.status}">${label}</span></td>
            <td>${log.method}</td>
          </tr>
        `;
        })
            .join('');
        const modal = document.getElementById('profile-modal');
        modal.classList.add('open');
    }
    renderAll() {
        const searchInput = document.getElementById('search-input')?.value.trim().toLowerCase() || '';
        const filtered = this.students.filter((s) => s.fullName.toLowerCase().includes(searchInput) ||
            s.id.toLowerCase().includes(searchInput) ||
            s.grade.toLowerCase().includes(searchInput));
        const totalStudents = this.students.length;
        const totalAchievements = this.students.reduce((acc, s) => acc + s.achievements.length, 0);
        const avgRate = totalStudents === 0
            ? 0
            : Math.round(this.students.reduce((acc, s) => acc + this.calculateAttendanceRate(s), 0) / totalStudents);
        document.getElementById('stat-students').textContent = String(totalStudents);
        document.getElementById('stat-rate').textContent = `${avgRate}%`;
        document.getElementById('stat-achievements').textContent = String(totalAchievements);
        const gateSelect = document.getElementById('gate-student-select');
        const achSelect = document.getElementById('ach-student-select');
        const optionsHtml = this.students
            .map((s) => `<option value="${s.id}">${s.fullName} (${s.id})</option>`)
            .join('');
        gateSelect.innerHTML = optionsHtml;
        achSelect.innerHTML = optionsHtml;
        const tbody = document.getElementById('students-tbody');
        tbody.innerHTML = filtered
            .map((student) => {
            const rate = this.calculateAttendanceRate(student);
            return `
          <tr>
            <td><strong>${student.id}</strong></td>
            <td>${student.fullName}</td>
            <td>${student.grade} (${student.section})</td>
            <td>
              <div class="progress-wrap">
                <div class="progress-bar" style="width: ${rate}%"></div>
              </div>
              <small>${rate}% (${student.presentDays} حضور / ${student.absentDays} غياب)</small>
            </td>
            <td><span class="ach-count">🏆 ${student.achievements.length}</span></td>
            <td class="actions-cell">
              <button class="btn btn-present" onclick="schoolApp.recordManualAttendance('${student.id}', 'present')">حاضر</button>
              <button class="btn btn-late" onclick="schoolApp.recordManualAttendance('${student.id}', 'late')">متأخر</button>
              <button class="btn btn-absent" onclick="schoolApp.recordManualAttendance('${student.id}', 'absent')">غائب</button>
              <button class="btn btn-qr" onclick="schoolApp.openStudentProfile('${student.id}')">🪪 البطاقة</button>
              <button class="btn btn-delete" onclick="schoolApp.deleteStudent('${student.id}')">🗑️ حذف</button>
            </td>
          </tr>
        `;
        })
            .join('');
    }
    initEventListeners() {
        document.getElementById('gate-scan-btn')?.addEventListener('click', () => {
            const select = document.getElementById('gate-student-select');
            if (select.value)
                this.scanAtGate(select.value);
        });
        document.getElementById('search-input')?.addEventListener('input', () => this.renderAll());
        document.getElementById('add-student-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('new-student-name');
            const gradeInput = document.getElementById('new-student-grade');
            const sectionInput = document.getElementById('new-student-section');
            if (nameInput.value.trim()) {
                this.addNewStudent(nameInput.value.trim(), gradeInput.value, sectionInput.value.trim() || 'عام');
                nameInput.value = '';
                sectionInput.value = '';
            }
        });
        document.getElementById('add-ach-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const studentSelect = document.getElementById('ach-student-select');
            const titleInput = document.getElementById('ach-title');
            const catSelect = document.getElementById('ach-category');
            const issuerInput = document.getElementById('ach-issuer');
            if (titleInput.value.trim()) {
                this.addAchievement(studentSelect.value, titleInput.value.trim(), catSelect.value, issuerInput.value.trim() || 'إدارة المدرسة');
                titleInput.value = '';
                issuerInput.value = '';
            }
        });
        document.getElementById('close-modal-btn')?.addEventListener('click', () => {
            document.getElementById('profile-modal')?.classList.remove('open');
            this.activeProfileId = null;
        });
    }
}
const schoolApp = new SmartSchoolSystem();
window.schoolApp = schoolApp;
