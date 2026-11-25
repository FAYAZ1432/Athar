"use strict";
class SmartSchoolSystem {
    constructor() {
        this.students = [];
        this.STORAGE_KEY = 'athar_smart_school_permanent_v3';
        this.activeProfileId = null;
        this.isStudentPortalMode = false;
        this.loadData();
        this.checkStudentPortalMode();
        if (!this.isStudentPortalMode) {
            this.initEventListeners();
            this.renderAll();
        }
    }
    loadData() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved !== null) {
                const parsed = JSON.parse(saved);
                this.students = Array.isArray(parsed)
                    ? parsed.map((s) => ({
                        ...s,
                        excusedDays: typeof s.excusedDays === 'number' ? s.excusedDays : 0,
                        attendanceLogs: Array.isArray(s.attendanceLogs)
                            ? s.attendanceLogs.map((log, idx) => ({
                                ...log,
                                id: log.id || `LOG-${Date.now()}-${idx}`
                            }))
                            : []
                    }))
                    : [];
            }
            else {
                this.students = [];
                this.saveData();
            }
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
        const compact = {
            i: student.id,
            n: student.fullName,
            g: student.grade,
            s: student.section,
            p: student.presentDays,
            l: student.lateDays,
            e: student.excusedDays || 0,
            a: student.absentDays,
            logs: student.attendanceLogs.slice(0, 8).map((lg) => ({
                d: lg.date,
                t: lg.time,
                st: lg.status
            })),
            ach: student.achievements.slice(0, 8).map((ac) => ({
                t: ac.title,
                c: ac.category,
                d: ac.date,
                u: ac.issuer
            }))
        };
        const json = JSON.stringify(compact);
        const bytes = new TextEncoder().encode(json);
        let bin = '';
        bytes.forEach((b) => (bin += String.fromCharCode(b)));
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    decodeStudentPayload(encoded) {
        try {
            let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4)
                b64 += '=';
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++)
                bytes[i] = bin.charCodeAt(i);
            const json = new TextDecoder().decode(bytes);
            const c = JSON.parse(json);
            return {
                id: c.i,
                fullName: c.n,
                grade: c.g,
                section: c.s,
                presentDays: c.p || 0,
                lateDays: c.l || 0,
                excusedDays: c.e || 0,
                absentDays: c.a || 0,
                attendanceLogs: Array.isArray(c.logs)
                    ? c.logs.map((lg) => ({
                        date: lg.d,
                        time: lg.t,
                        status: lg.st,
                        method: 'جهاز قارئ الباركود'
                    }))
                    : [],
                achievements: Array.isArray(c.ach)
                    ? c.ach.map((ac, idx) => ({
                        id: `ACH-${idx}`,
                        title: ac.t,
                        category: ac.c,
                        date: ac.d,
                        issuer: ac.u
                    }))
                    : []
            };
        }
        catch {
            return null;
        }
    }
    checkStudentPortalMode() {
        const params = new URLSearchParams(window.location.search);
        const scannedId = params.get('student');
        const encodedData = params.get('data');
        if (!scannedId)
            return;
        this.isStudentPortalMode = true;
        document.body.classList.add('student-portal-mode');
        const localStudent = this.students.find((s) => s.id.toUpperCase() === scannedId.toUpperCase());
        const decodedStudent = encodedData ? this.decodeStudentPayload(encodedData) : null;
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
          <h2>⚠️ تعذر العثور على بيانات البطاقة</h2>
          <p>تأكد من مسح رمز QR الصحيح الصادر من المدرسة.</p>
        </div>
      `;
            return;
        }
        this.renderStudentPortal(targetStudent);
    }
    renderStudentPortal(student) {
        const rate = this.calculateAttendanceRate(student);
        const excused = student.excusedDays || 0;
        document.getElementById('portal-student-name').textContent = student.fullName;
        document.getElementById('portal-student-grade').textContent = `${student.grade} — ${student.section}`;
        document.getElementById('portal-student-id').textContent = student.id;
        document.getElementById('portal-present').textContent = String(student.presentDays);
        document.getElementById('portal-late').textContent = String(student.lateDays);
        document.getElementById('portal-excused').textContent = String(excused);
        document.getElementById('portal-absent').textContent = String(student.absentDays);
        document.getElementById('portal-rate').textContent = `${rate}%`;
        const achList = document.getElementById('portal-achievements-list');
        if (student.achievements.length === 0) {
            achList.innerHTML = `<p class="empty-msg">لا توجد إنجازات مسجلة في ملفك حتى الآن.</p>`;
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
        const logsList = document.getElementById('portal-logs-list');
        if (student.attendanceLogs.length === 0) {
            logsList.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; color: #64748b; padding: 14px;">
            لا توجد سجلات حضور أو غياب مسجلة بعد.
          </td>
        </tr>
      `;
        }
        else {
            logsList.innerHTML = student.attendanceLogs
                .map((log) => {
                const label = log.status === 'present'
                    ? 'حاضر'
                    : log.status === 'late'
                        ? 'متأخر'
                        : log.status === 'excused'
                            ? 'بعذر'
                            : 'غائب';
                return `
            <tr>
              <td>${log.date}</td>
              <td>${log.time}</td>
              <td><span class="status-pill ${log.status}">${label}</span></td>
            </tr>
          `;
            })
                .join('');
        }
    }
    recalculateStats(student) {
        student.presentDays = student.attendanceLogs.filter((l) => l.status === 'present').length;
        student.lateDays = student.attendanceLogs.filter((l) => l.status === 'late').length;
        student.excusedDays = student.attendanceLogs.filter((l) => l.status === 'excused').length;
        student.absentDays = student.attendanceLogs.filter((l) => l.status === 'absent').length;
    }
    calculateAttendanceRate(student) {
        const excused = student.excusedDays || 0;
        const effectiveTotal = student.presentDays + student.lateDays + student.absentDays;
        if (effectiveTotal === 0) {
            return excused > 0 ? 100 : 0;
        }
        const weightedPresent = student.presentDays + student.lateDays * 0.5;
        return Math.round((weightedPresent / effectiveTotal) * 100);
    }
    normalizeArabicKeyboard(raw) {
        const map = {
            'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p',
            'ش': 'a', 'س': 's', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ك': ':',
            'ئ': 'z', 'ء': 'x', 'ؤ': 'c', 'ر': 'v', 'ى': 'n', 'ة': 'm', 'و': ',', 'ز': '.', 'ظ': '/', '؟': '?'
        };
        const replacedLamAlef = raw.replace(/لا/g, 'b');
        return replacedLamAlef
            .split('')
            .map((ch) => map[ch] || ch)
            .join('');
    }
    extractStudentId(rawInput) {
        const normalized = this.normalizeArabicKeyboard(rawInput.trim());
        const urlMatch = normalized.match(/[?&]student=([^&]+)/i);
        if (urlMatch && urlMatch[1]) {
            return decodeURIComponent(urlMatch[1]).trim().toUpperCase();
        }
        return normalized.toUpperCase();
    }
    playBeep(isSuccess) {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx)
                return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = isSuccess ? 'sine' : 'sawtooth';
            osc.frequency.setValueAtTime(isSuccess ? 880 : 240, ctx.currentTime);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isSuccess ? 0.18 : 0.35));
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + (isSuccess ? 0.18 : 0.35));
        }
        catch {
            // تجاهل في حال عدم دعم الصوت
        }
    }
    scanAtGate(rawCode) {
        const extractedId = this.extractStudentId(rawCode);
        if (!extractedId)
            return;
        const student = this.students.find((s) => s.id.toUpperCase() === extractedId);
        const feedbackEl = document.getElementById('gate-feedback');
        if (!student) {
            this.playBeep(false);
            feedbackEl.className = 'gate-feedback error';
            feedbackEl.innerHTML = `❌ الباركود غير مسجل في النظام: <strong>${extractedId}</strong>`;
            return;
        }
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('ar-SA');
        const alreadyScannedToday = student.attendanceLogs.find((log) => log.date === dateStr && (log.status === 'present' || log.status === 'late'));
        if (alreadyScannedToday) {
            this.playBeep(false);
            feedbackEl.className = 'gate-feedback error';
            feedbackEl.innerHTML = `
        <div>
          ⚠️ <strong>تم تسجيل حضور هذا الطالب مسبقاً اليوم!</strong><br>
          <span>الطالب: <b>${student.fullName}</b> — سُجِّل في الساعة <b>${alreadyScannedToday.time}</b> (لن يُحتسب مرتين).</span>
        </div>
        <button class="btn btn-sm btn-light" onclick="schoolApp.openStudentProfile('${student.id}')">عرض البطاقة</button>
      `;
            return;
        }
        student.attendanceLogs.unshift({
            id: `LOG-${Date.now()}`,
            date: dateStr,
            time: timeStr,
            status: 'present',
            method: 'جهاز قارئ الباركود'
        });
        this.recalculateStats(student);
        this.saveData();
        this.renderAll();
        this.playBeep(true);
        feedbackEl.className = 'gate-feedback success';
        feedbackEl.innerHTML = `
      <div>
        ✅ <strong>تم مسح الباركود وتسجيل الحضور بنجاح!</strong><br>
        <span>الطالب: <b>${student.fullName}</b> (${student.grade}) — وقت الدخول: <b>${timeStr}</b></span>
      </div>
      <button class="btn btn-sm btn-light" onclick="schoolApp.openStudentProfile('${student.id}')">عرض البطاقة</button>
    `;
    }
    recordManualAttendance(studentId, status) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('ar-SA');
        student.attendanceLogs.unshift({
            id: `LOG-${Date.now()}`,
            date: dateStr,
            time: status === 'absent' || status === 'excused' ? '—' : timeStr,
            status,
            method: 'رصد إداري'
        });
        this.recalculateStats(student);
        this.saveData();
        this.renderAll();
        if (this.activeProfileId === studentId) {
            this.openStudentProfile(studentId);
        }
    }
    updateAttendanceLog(studentId, logId, newStatus) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        const log = student.attendanceLogs.find((l) => l.id === logId);
        if (!log)
            return;
        log.status = newStatus;
        log.method = 'رصد إداري';
        if (newStatus === 'absent' || newStatus === 'excused') {
            log.time = '—';
        }
        else if (log.time === '—') {
            log.time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        }
        this.recalculateStats(student);
        this.saveData();
        this.renderAll();
        if (this.activeProfileId === studentId) {
            this.openStudentProfile(studentId);
        }
    }
    deleteAttendanceLog(studentId, logId) {
        const student = this.students.find((s) => s.id === studentId);
        if (!student)
            return;
        student.attendanceLogs = student.attendanceLogs.filter((l) => l.id !== logId);
        this.recalculateStats(student);
        this.saveData();
        this.renderAll();
        if (this.activeProfileId === studentId) {
            this.openStudentProfile(studentId);
        }
    }
    addNewStudent(fullName, grade, section) {
        const randomNum = Math.floor(100000 + Math.random() * 899999);
        const newStudent = {
            id: `STU-${randomNum}`,
            fullName,
            grade,
            section,
            presentDays: 0,
            lateDays: 0,
            excusedDays: 0,
            absentDays: 0,
            attendanceLogs: [],
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
                this.students = parsed;
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
        const rate = this.calculateAttendanceRate(student);
        document.getElementById('card-student-name').textContent = student.fullName;
        document.getElementById('card-student-grade').textContent = `${student.grade} — ${student.section}`;
        document.getElementById('card-student-id').textContent = student.id;
        const qrContainer = document.getElementById('card-qr-box');
        qrContainer.innerHTML = '';
        const baseUrl = window.location.href.split('?')[0];
        const encodedPayload = this.encodeStudentPayload(student);
        const profileUrl = `${baseUrl}?student=${encodeURIComponent(student.id)}&data=${encodedPayload}`;
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: profileUrl,
                width: 120,
                height: 120,
                colorDark: '#0b2533',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
        }
        document.getElementById('profile-present').textContent = String(student.presentDays);
        document.getElementById('profile-late').textContent = String(student.lateDays);
        const excusedEl = document.getElementById('profile-excused');
        if (excusedEl)
            excusedEl.textContent = String(student.excusedDays || 0);
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
            <div class="ach-top-row">
              <span class="badge-category">${ach.category}</span>
              <button class="btn-mini-del" title="حذف الإنجاز" onclick="schoolApp.deleteAchievement('${student.id}', '${ach.id}')">✕</button>
            </div>
            <h4>${ach.title}</h4>
            <small>الجهة المانحة: ${ach.issuer} | التاريخ: ${ach.date}</small>
          </div>
        `)
                .join('');
        }
        const logsList = document.getElementById('profile-logs-list');
        if (student.attendanceLogs.length === 0) {
            logsList.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #64748b; padding: 14px;">
            لم يُسجَّل حضور لهذا الطالب بعد. امسح بطاقته في جهاز القارئ لتسجيل حضوره.
          </td>
        </tr>
      `;
        }
        else {
            logsList.innerHTML = student.attendanceLogs
                .slice(0, 10)
                .map((log) => {
                const logId = log.id || '';
                const label = log.status === 'present'
                    ? 'حاضر'
                    : log.status === 'late'
                        ? 'متأخر'
                        : log.status === 'excused'
                            ? 'بعذر'
                            : 'غائب';
                return `
            <tr>
              <td>${log.date}</td>
              <td>${log.time}</td>
              <td><span class="status-pill ${log.status}">${label}</span></td>
              <td>${log.method}</td>
              <td class="log-edit-cell">
                <select class="status-select" aria-label="تعديل الحالة" onchange="schoolApp.updateAttendanceLog('${student.id}', '${logId}', this.value)">
                  <option value="present" ${log.status === 'present' ? 'selected' : ''}>حاضر</option>
                  <option value="late" ${log.status === 'late' ? 'selected' : ''}>متأخر</option>
                  <option value="excused" ${log.status === 'excused' ? 'selected' : ''}>بعذر</option>
                  <option value="absent" ${log.status === 'absent' ? 'selected' : ''}>غائب</option>
                </select>
                <button class="btn-mini-del" title="حذف السجل" onclick="schoolApp.deleteAttendanceLog('${student.id}', '${logId}')">🗑️</button>
              </td>
            </tr>
          `;
            })
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
        const avgRate = totalStudents === 0
            ? 0
            : Math.round(this.students.reduce((acc, s) => acc + this.calculateAttendanceRate(s), 0) / totalStudents);
        document.getElementById('stat-students').textContent = String(totalStudents);
        document.getElementById('stat-rate').textContent = `${avgRate}%`;
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
            const excused = student.excusedDays || 0;
            return `
          <tr>
            <td><strong>${student.id}</strong></td>
            <td>${student.fullName}</td>
            <td>${student.grade} (${student.section})</td>
            <td>
              <div class="progress-wrap">
                <div class="progress-bar" style="width: ${rate}%"></div>
              </div>
              <small>${rate}% (${student.presentDays} حضور / ${excused} بعذر / ${student.absentDays} غياب)</small>
            </td>
            <td><span class="ach-count">🏆 ${student.achievements.length}</span></td>
            <td class="actions-cell">
              <button class="btn btn-present" onclick="schoolApp.recordManualAttendance('${student.id}', 'present')">حاضر</button>
              <button class="btn btn-late" onclick="schoolApp.recordManualAttendance('${student.id}', 'late')">متأخر</button>
              <button class="btn btn-excused" onclick="schoolApp.recordManualAttendance('${student.id}', 'excused')">بعذر</button>
              <button class="btn btn-absent" onclick="schoolApp.recordManualAttendance('${student.id}', 'absent')">غائب</button>
              <button class="btn btn-qr" onclick="schoolApp.openStudentProfile('${student.id}')">🪪 البطاقة والتعديل</button>
              <button class="btn btn-delete" onclick="schoolApp.deleteStudent('${student.id}')">🗑️ حذف</button>
            </td>
          </tr>
        `;
        })
            .join('');
    }
    initEventListeners() {
        const scannerInput = document.getElementById('barcode-scanner-input');
        const scanBtn = document.getElementById('gate-scan-btn');
        const gatePanel = document.querySelector('.gate-panel');
        const triggerBarcodeRead = () => {
            if (!scannerInput.value.trim())
                return;
            this.scanAtGate(scannerInput.value);
            scannerInput.value = '';
            scannerInput.focus();
        };
        scannerInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                triggerBarcodeRead();
            }
        });
        scanBtn?.addEventListener('click', () => triggerBarcodeRead());
        gatePanel?.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                scannerInput?.focus();
            }
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
            scannerInput?.focus();
        });
    }
}
const schoolApp = new SmartSchoolSystem();
window.schoolApp = schoolApp;
