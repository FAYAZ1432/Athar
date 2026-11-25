const students = new Map([
 ['noura',{name:'نورة السالم',grade:'الصف الثاني المتوسط · أ',award:'🏅 المركز الأول في معرض العلوم',theme:'forest'}],
 ['omar',{name:'عمر الحربي',grade:'الصف الثالث المتوسط · ب',award:'🏅 شهادة التميز في القراءة',theme:'night'}]
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
 for (const field of ['name','grade','award']) el(field).textContent = student[field];
 initEditor();
 document.title = student.name + ' | أثر';
 el('profile').hidden = false;
}

function initEditor() {
 const key = `athar-demo-profile:${id}`;
 let profile = {};
 try { profile = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
 const bio = el('bio');
 const portrait = el('portrait');
 const validPhoto = value => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
 function render() {
  const text = typeof profile.bio === 'string' ? profile.bio : '';
  el('bio-text').textContent = bio.value = text;
  el('bio-text').hidden = !text;
  portrait.hidden = !validPhoto(profile.photo);
  if (portrait.hidden) portrait.removeAttribute('src'); else portrait.src = profile.photo;
 }
 render();
 if (location.hash === '#edit') el('edit').open = true;
 el('editor').addEventListener('submit', async event => {
  event.preventDefault();
  const file = el('photo').files[0];
  const next = {bio: bio.value.trim().slice(0, 500), photo: profile.photo};
  if (el('remove-photo').checked) next.photo = undefined;
  else if (file) {
   if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 524288) {
    el('feedback').textContent = 'اختر صورة مدعومة بحجم لا يتجاوز 512 كيلوبايت.'; return;
   }
   try {
    next.photo = await new Promise((resolve, reject) => {
     const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
    });
    const image = new Image(); image.src = next.photo; await image.decode();
   } catch { el('feedback').textContent = 'تعذر فتح الصورة.'; return; }
  }
  try { localStorage.setItem(key, JSON.stringify(next)); }
  catch { el('feedback').textContent = 'تعذر الحفظ في هذا المتصفح.'; return; }
  profile = next; el('photo').value = ''; el('remove-photo').checked = false; render();
  el('feedback').textContent = 'تم الحفظ في هذا المتصفح فقط.';
 });
}
