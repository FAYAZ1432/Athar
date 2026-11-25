const students = new Map([
 ['noura',{name:'نورة السالم',grade:'الصف الثاني المتوسط · أ',present:22,late:1,absent:0,award:'🏅 المركز الأول في معرض العلوم',theme:'forest'}],
 ['omar',{name:'عمر الحربي',grade:'الصف الثالث المتوسط · ب',present:20,late:2,absent:1,award:'🏅 شهادة التميز في القراءة',theme:'night'}]
]);
const id = document.documentElement.dataset.student;
const student = students.get(id);
const el = id => document.getElementById(id);
if (!student) el('missing').hidden = false;
else {
 const key = 'athar-demo-theme:' + id;
 const themes = ['forest','night','clay'];
 const picker = el('theme');
 let saved; try { saved = localStorage.getItem(key); } catch {}
 function apply(theme) { document.documentElement.dataset.theme = theme; picker.value = theme; }
 apply(themes.includes(saved) ? saved : student.theme);
 picker.addEventListener('change', () => { apply(picker.value); try { localStorage.setItem(key,picker.value); } catch {} });
 for (const field of ['name','grade','present','late','absent','award']) el(field).textContent = student[field];
 document.title = student.name + ' | أثر';
 el('profile').hidden = false;
}
