"use strict";
function escapeText(value) {
    const span = document.createElement('span');
    span.textContent = value;
    return span.innerHTML;
}
class SmartSchoolSystem {
    constructor() {
        this.students = [];
        this.STORAGE_KEY = 'athar_portfolios_v1';
        this.LEGACY_STORAGE_KEY = 'athar_smart_school_permanent_v3';
        this.activeProfileId = null;
        this.isStudentPortalMode = false;
        this.loadData();
        this.checkStudentPortalMode();
        if (!this.isStudentPortalMode && document.body.dataset.view !== 'profile') {
            this.initEventListeners();
            this.renderAll();
        }
    }
    portfolioRecords(records) {
        return records.map(({ id, fullName, grade, section, achievements }) => ({
            id, fullName, grade, section, achievements
        }));
    }
    loadData() {
        try {
            const current = localStorage.getItem(this.STORAGE_KEY);
            // Leave the original browser records untouched as a local backup.
            const saved = current ?? localStorage.getItem(this.LEGACY_STORAGE_KEY);
            const parsed = JSON.parse(saved ?? "[]");
            this.students = Array.isArray(parsed) ? this.portfolioRecords(parsed) : [];
            if (current === null && saved !== null)
                this.saveData();
        }
        catch {
            this.students = [];
        }
    }
    saveData() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.students));
        }
        catch {
            alert('تعذر الحفظ في المتصفح. تأكد أنك لا تستخدم وضع التصفح الخفي.');
        }
    }
    encodeStudentPayload(student) {
        const ultraCompact = [
            student.fullName,
            student.grade,
            student.section,
            student.achievements.slice(0, 4).map((ac) => [
                ac.title,
                ac.category,
                ac.date,
                ac.issuer
            ])
        ];
        const json = JSON.stringify(ultraCompact);
        const bytes = new TextEncoder().encode(json);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) {
            bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    decodeStudentPayload(studentId, encoded) {
        try {
            const cleanEncoded = encoded.trim().replace(/\s+/g, '');
            let b64 = cleanEncoded.replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4)
                b64 += '=';
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
                bytes[i] = bin.charCodeAt(i);
            }
            const json = new TextDecoder().decode(bytes);
            const arr = JSON.parse(json);
            if (Array.isArray(arr)) {
                const awards = arr.length >= 9 ? arr[8] : arr[3];
                return {
                    id: studentId,
                    fullName: String(arr[0] || 'طالب مسجل'),
                    grade: String(arr[1] || '—'),
                    section: String(arr[2] || '—'),
                    achievements: Array.isArray(awards)
                        ? awards.map((ac, idx) => ({
                            id: `ACH-${idx}`,
                            title: String(ac[0] || ''),
                            category: (ac[1] || 'شهادة تفوق'),
                            date: String(ac[2] || ''),
                            issuer: String(ac[3] || 'إدارة المدرسة')
                        }))
                        : []
                };
            }
            return null;
        }
        catch {
            return null;
        }
    }
    buildStudentPortalUrl(student) {
        const baseUrl = new URL('../profile/', document.baseURI).href;
        const encodedPayload = this.encodeStudentPayload(student);
        return `${baseUrl}?student=${encodeURIComponent(student.id)}&data=${encodedPayload}`;
    }
    copyStudentPortalUrl() {
        if (!this.activeProfileId)
            return;
        const student = this.students.find((s) => s.id === this.activeProfileId);
        if (!student)
            return;
        const url = this.buildStudentPortalUrl(student);
        navigator.clipboard
            .writeText(url)
            .then(() => alert('✅ تم نسخ رابط بوابة الطالب بنجاح! يمكنك إرساله الآن عبر الواتساب.'))
            .catch(() => prompt('انسخ الرابط التالي يدوياً:', url));
    }
    checkStudentPortalMode() {
        const params = new URLSearchParams(window.location.search);
        const scannedId = params.get('student');
        const encodedData = params.get('data');
        if (!scannedId && document.body.dataset.view !== 'profile')
            return;
        const lookupId = scannedId ?? '';
        this.isStudentPortalMode = true;
        document.body.classList.add('student-portal-mode');
        const localStudent = this.students.find((s) => s.id.toUpperCase() === lookupId.toUpperCase());
        const decodedStudent = encodedData ? this.decodeStudentPayload(lookupId, encodedData) : null;
        const targetStudent = localStudent || decodedStudent;
        const portalContainer = document.getElementById('student-portal-view');
        const adminContainer = document.getElementById('admin-dashboard-view');
        if (adminContainer)
            adminContainer.style.display = 'none';
        if (portalContainer)
            portalContainer.style.display = 'block';
        if (!targetStudent) {
            portalContainer.innerHTML = `
        <div class="panel" style="text-align:center; padding:32px; margin-top:24px;">
          <h2>⚠️ تعذر قراءة بيانات البطاقة</h2>
          <p style="color:#64748b; font-size:0.9rem;">يرجى إعادة فتح البطاقة من جهاز المدرسة لتوليد رمز QR محدّث ثم مسحه مرة أخرى.</p>
        </div>
      `;
            return;
        }
        this.renderStudentPortal(targetStudent);
    }
    renderStudentPortal(student) {
        document.getElementById('portal-student-name').textContent = student.fullName;
        document.getElementById('portal-student-grade').textContent = `${student.grade} — ${student.section}`;
        const achList = document.getElementById('portal-achievements-list');
        if (student.achievements.length === 0) {
            achList.innerHTML = `<p class="empty-msg">لا توجد إنجازات مسجلة في ملفك حتى الآن.</p>`;
        }
        else {
            achList.innerHTML = student.achievements
                .map((ach) => `
          <div class="achievement-item">
            <span class="badge-category">${escapeText(ach.category)}</span>
            <h4>${escapeText(ach.title)}</h4>
            <small>الجهة المانحة: ${escapeText(ach.issuer)} | التاريخ: ${escapeText(ach.date)}</small>
          </div>
        `)
                .join('');
        }
    }
    addNewStudent(fullName, grade, section) {
        const randomNum = Math.floor(100000 + Math.random() * 899999);
        const newStudent = {
            id: `STU-${randomNum}`,
            fullName,
            grade,
            section,
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
        if (!student) {
            alert('يرجى إضافة طالب أولاً قبل توثيق الإنجازات.');
            return;
        }
        student.achievements.unshift({
            id: `ACH-${Date.now()}`,
            title,
            category,
            date: new Date().toLocaleDateString('ar-SA'),
            issuer
        });
        this.saveData();
        this.renderAll();
        this.openStudentProfile(studentId);
    }
    deleteAchievement(studentId, achievementId) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        student.achievements = student.achievements.filter((a) => a.id !== achievementId);
        this.saveData();
        this.renderAll();
        if (this.activeProfileId === studentId) {
            this.openStudentProfile(studentId);
        }
    }
    exportBackup() {
        const dataStr = JSON.stringify(this.students, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `athar-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }
    importBackup(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(String(event.target?.result || '[]'));
                if (!Array.isArray(parsed)) {
                    alert('ملف النسخة الاحتياطية غير صالح.');
                    return;
                }
                this.students = this.portfolioRecords(parsed);
                this.saveData();
                this.renderAll();
                alert(`✅ تم استعادة ${this.students.length} طالب بنجاح وحفظهم!`);
            }
            catch {
                alert('حدث خطأ أثناء قراءة الملف. تأكد من اختيار ملف JSON صحيح.');
            }
        };
        reader.readAsText(file);
    }
    openStudentProfile(studentId) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        this.activeProfileId = student.id;
        document.getElementById('card-student-name').textContent = student.fullName;
        document.getElementById('card-student-grade').textContent = `${student.grade} — ${student.section}`;
        document.getElementById('card-student-id').textContent = student.id;
        const qrContainer = document.getElementById('card-qr-box');
        qrContainer.innerHTML = '';
        const profileUrl = this.buildStudentPortalUrl(student);
        if (typeof QRCode !== 'undefined') {
            try {
                new QRCode(qrContainer, {
                    text: profileUrl,
                    width: 180,
                    height: 180,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.L
                });
            }
            catch {
                const fallbackUrl = this.buildStudentPortalUrl({ ...student, achievements: [] });
                new QRCode(qrContainer, {
                    text: fallbackUrl,
                    width: 180,
                    height: 180,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.L
                });
            }
        }
        const achList = document.getElementById('profile-achievements-list');
        if (student.achievements.length === 0) {
            achList.innerHTML = `<p class="empty-msg">لا توجد إنجازات مسجلة بعد. يمكنك إضافة إنجاز من لوحة الإدارة.</p>`;
        }
        else {
            achList.innerHTML = student.achievements
                .map((ach) => `
          <div class="achievement-item">
            <div class="ach-top-row">
              <span class="badge-category">${escapeText(ach.category)}</span>
              <button class="btn-mini-del" title="حذف الإنجاز" onclick="schoolApp.deleteAchievement('${student.id}', '${ach.id}')">✕</button>
            </div>
            <h4>${escapeText(ach.title)}</h4>
            <small>الجهة المانحة: ${escapeText(ach.issuer)} | التاريخ: ${escapeText(ach.date)}</small>
          </div>
        `)
                .join('');
        }
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
        document.getElementById('stat-students').textContent = String(totalStudents);
        document.getElementById('stat-achievements').textContent = String(totalAchievements);
        const achSelect = document.getElementById('ach-student-select');
        if (this.students.length === 0) {
            achSelect.innerHTML = `<option value="">لا يوجد طلاب مسجلون حالياً</option>`;
        }
        else {
            achSelect.innerHTML = this.students
                .map((s) => `<option value="${s.id}">${s.fullName} (${s.id})</option>`)
                .join('');
        }
        const tbody = document.getElementById('students-tbody');
        if (filtered.length === 0) {
            tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: #64748b; padding: 24px;">
            لا يوجد طلاب في السجل حالياً. أضف طالباً جديداً من النموذج أعلاه وسيتم حفظه تلقائياً.
          </td>
        </tr>
      `;
            return;
        }
        tbody.innerHTML = filtered
            .map((student) => {
            return `
          <tr>
            <td>${student.fullName}</td>
            <td>${student.grade} (${student.section})</td>
            <td><span class="ach-count">🏆 ${student.achievements.length}</span></td>
            <td class="actions-cell">
              <button class="btn btn-qr" onclick="schoolApp.openStudentProfile('${student.id}')">🪪 البطاقة والتعديل</button>
              <button class="btn btn-delete" onclick="schoolApp.deleteStudent('${student.id}')">🗑️ حذف</button>
            </td>
          </tr>
        `;
        })
            .join('');
    }
    initEventListeners() {
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
        document.getElementById('export-btn')?.addEventListener('click', () => this.exportBackup());
        document.getElementById('import-input')?.addEventListener('change', (e) => {
            const target = e.target;
            if (target.files && target.files[0]) {
                this.importBackup(target.files[0]);
                target.value = '';
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
