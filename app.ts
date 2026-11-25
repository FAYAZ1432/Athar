declare var QRCode: any;

type AttendanceStatus = 'present' | 'late' | 'absent';

interface AttendanceLog {
  date: string;
  time: string;
  status: AttendanceStatus;
  method: 'بوابة QR الذكية' | 'رصد إداري';
}

interface Achievement {
  id: string;
  title: string;
  category: 'جائزة ابتكار' | 'شهادة تفوق' | 'مسابقة علمية' | 'مشاركة مجتمعية';
  date: string;
  issuer: string;
}

interface Student {
  id: string;
  fullName: string;
  grade: string;
  section: string;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  attendanceLogs: AttendanceLog[];
  achievements: Achievement[];
}

class SmartSchoolSystem {
  private students: Student[] = [];
  private readonly STORAGE_KEY = 'athar_smart_school_permanent_v3';
  private activeProfileId: string | null = null;

  constructor() {
    this.loadData();
    this.initEventListeners();
    this.renderAll();
    this.checkUrlForStudentScan();
  }

  private loadData(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        this.students = Array.isArray(parsed) ? parsed : [];
      } else {
        this.students = [];
        this.saveData();
      }
    } catch {
      this.students = [];
    }
  }

  private saveData(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.students));
    } catch (error) {
      alert('تعذر الحفظ في المتصفح. تأكد أنك لا تستخدم وضع التصفح الخفي.');
    }
  }

  private calculateAttendanceRate(student: Student): number {
    const total = student.presentDays + student.lateDays + student.absentDays;
    if (total === 0) return 100;
    const weightedPresent = student.presentDays + student.lateDays * 0.5;
    return Math.round((weightedPresent / total) * 100);
  }

  private checkUrlForStudentScan(): void {
    const params = new URLSearchParams(window.location.search);
    const scannedId = params.get('student');
    if (scannedId) {
      const exists = this.students.find((s) => s.id === scannedId);
      if (exists) {
        this.openStudentProfile(scannedId);
      }
    }
  }

  public scanAtGate(studentId: string): void {
    const student = this.students.find((s) => s.id.toUpperCase() === studentId.trim().toUpperCase());
    const feedbackEl = document.getElementById('gate-feedback') as HTMLElement;

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

  public recordManualAttendance(studentId: string, status: AttendanceStatus): void {
    const student = this.students.find((s) => s.id === studentId);
    if (!student) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('ar-SA');

    if (status === 'present') student.presentDays += 1;
    if (status === 'late') student.lateDays += 1;
    if (status === 'absent') student.absentDays += 1;

    student.attendanceLogs.unshift({
      date: dateStr,
      time: status === 'absent' ? '—' : timeStr,
      status,
      method: 'رصد إداري'
    });

    this.saveData();
    this.renderAll();
  }

  public addNewStudent(fullName: string, grade: string, section: string): void {
    const randomNum = Math.floor(100000 + Math.random() * 899999);
    const newStudent: Student = {
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

  public deleteStudent(studentId: string): void {
    const student = this.students.find((s) => s.id === studentId);
    if (!student) return;

    const confirmed = confirm(`هل أنت متأكد من حذف ملف الطالب "${student.fullName}" نهائياً؟`);
    if (!confirmed) return;

    this.students = this.students.filter((s) => s.id !== studentId);
    this.saveData();
    this.renderAll();

    if (this.activeProfileId === studentId) {
      document.getElementById('profile-modal')?.classList.remove('open');
      this.activeProfileId = null;
    }
  }

  public addAchievement(
    studentId: string,
    title: string,
    category: Achievement['category'],
    issuer: string
  ): void {
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

  public deleteAchievement(studentId: string, achievementId: string): void {
    const student = this.students.find((s) => s.id === studentId);
    if (!student) return;

    student.achievements = student.achievements.filter((a) => a.id !== achievementId);
    this.saveData();
    this.renderAll();
    if (this.activeProfileId === studentId) {
      this.openStudentProfile(studentId);
    }
  }

  public exportBackup(): void {
    const dataStr = JSON.stringify(this.students, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `athar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  public importBackup(file: File): void {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || '[]'));
        if (!Array.isArray(parsed)) {
          alert('ملف النسخة الاحتياطية غير صالح.');
          return;
        }
        this.students = parsed;
        this.saveData();
        this.renderAll();
        alert(`✅ تم استعادة ${this.students.length} طالب بنجاح وحفظهم!`);
      } catch {
        alert('حدث خطأ أثناء قراءة الملف. تأكد من اختيار ملف JSON صحيح.');
      }
    };
    reader.readAsText(file);
  }

  public openStudentProfile(studentId: string): void {
    const student = this.students.find((s) => s.id === studentId);
    if (!student) return;

    this.activeProfileId = student.id;
    const rate = this.calculateAttendanceRate(student);

    (document.getElementById('card-student-name') as HTMLElement).textContent = student.fullName;
    (document.getElementById('card-student-grade') as HTMLElement).textContent = `${student.grade} — ${student.section}`;
    (document.getElementById('card-student-id') as HTMLElement).textContent = student.id;

    const qrContainer = document.getElementById('card-qr-box') as HTMLElement;
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

    (document.getElementById('profile-present') as HTMLElement).textContent = String(student.presentDays);
    (document.getElementById('profile-late') as HTMLElement).textContent = String(student.lateDays);
    (document.getElementById('profile-absent') as HTMLElement).textContent = String(student.absentDays);
    (document.getElementById('profile-rate') as HTMLElement).textContent = `${rate}%`;

    const achList = document.getElementById('profile-achievements-list') as HTMLElement;
    if (student.achievements.length === 0) {
      achList.innerHTML = `<p class="empty-msg">لا توجد إنجازات مسجلة بعد. يمكنك إضافة إنجاز من لوحة الإدارة.</p>`;
    } else {
      achList.innerHTML = student.achievements
        .map(
          (ach) => `
          <div class="achievement-item">
            <div class="ach-top-row">
              <span class="badge-category">${ach.category}</span>
              <button class="btn-mini-del" title="حذف الإنجاز" onclick="schoolApp.deleteAchievement('${student.id}', '${ach.id}')">✕</button>
            </div>
            <h4>${ach.title}</h4>
            <small>الجهة المانحة: ${ach.issuer} | التاريخ: ${ach.date}</small>
          </div>
        `
        )
        .join('');
    }

    const logsList = document.getElementById('profile-logs-list') as HTMLElement;
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

    const modal = document.getElementById('profile-modal') as HTMLElement;
    modal.classList.add('open');
  }

  private renderAll(): void {
    const searchInput = (document.getElementById('search-input') as HTMLInputElement)?.value.trim().toLowerCase() || '';
    const filtered = this.students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(searchInput) ||
        s.id.toLowerCase().includes(searchInput) ||
        s.grade.toLowerCase().includes(searchInput)
    );

    const totalStudents = this.students.length;
    const totalAchievements = this.students.reduce((acc, s) => acc + s.achievements.length, 0);
    const avgRate =
      totalStudents === 0
        ? 0
        : Math.round(this.students.reduce((acc, s) => acc + this.calculateAttendanceRate(s), 0) / totalStudents);

    (document.getElementById('stat-students') as HTMLElement).textContent = String(totalStudents);
    (document.getElementById('stat-rate') as HTMLElement).textContent = `${avgRate}%`;
    (document.getElementById('stat-achievements') as HTMLElement).textContent = String(totalAchievements);

    const gateSelect = document.getElementById('gate-student-select') as HTMLSelectElement;
    const achSelect = document.getElementById('ach-student-select') as HTMLSelectElement;

    if (this.students.length === 0) {
      const emptyOpt = `<option value="">لا يوجد طلاب مسجلون حالياً</option>`;
      gateSelect.innerHTML = emptyOpt;
      achSelect.innerHTML = emptyOpt;
    } else {
      const optionsHtml = this.students
        .map((s) => `<option value="${s.id}">${s.fullName} (${s.id})</option>`)
        .join('');
      gateSelect.innerHTML = optionsHtml;
      achSelect.innerHTML = optionsHtml;
    }

    const tbody = document.getElementById('students-tbody') as HTMLElement;
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: #64748b; padding: 24px;">
            لا يوجد طلاب في السجل حالياً. أضف طالباً جديداً من النموذج أعلاه وسيتم حفظه تلقائياً.
          </td>
        </tr>
      `;
      return;
    }

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

  private initEventListeners(): void {
    document.getElementById('gate-scan-btn')?.addEventListener('click', () => {
      const select = document.getElementById('gate-student-select') as HTMLSelectElement;
      if (select.value) this.scanAtGate(select.value);
    });

    document.getElementById('search-input')?.addEventListener('input', () => this.renderAll());

    document.getElementById('add-student-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('new-student-name') as HTMLInputElement;
      const gradeInput = document.getElementById('new-student-grade') as HTMLSelectElement;
      const sectionInput = document.getElementById('new-student-section') as HTMLInputElement;

      if (nameInput.value.trim()) {
        this.addNewStudent(nameInput.value.trim(), gradeInput.value, sectionInput.value.trim() || 'عام');
        nameInput.value = '';
        sectionInput.value = '';
      }
    });

    document.getElementById('add-ach-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const studentSelect = document.getElementById('ach-student-select') as HTMLSelectElement;
      const titleInput = document.getElementById('ach-title') as HTMLInputElement;
      const catSelect = document.getElementById('ach-category') as HTMLSelectElement;
      const issuerInput = document.getElementById('ach-issuer') as HTMLInputElement;

      if (titleInput.value.trim()) {
        this.addAchievement(
          studentSelect.value,
          titleInput.value.trim(),
          catSelect.value as Achievement['category'],
          issuerInput.value.trim() || 'إدارة المدرسة'
        );
        titleInput.value = '';
        issuerInput.value = '';
      }
    });

    document.getElementById('export-btn')?.addEventListener('click', () => this.exportBackup());

    document.getElementById('import-input')?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
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
(window as any).schoolApp = schoolApp;