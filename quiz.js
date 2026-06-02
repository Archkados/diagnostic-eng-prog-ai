

const ORAL_SLIDES = {
  13: { question: "What is your favourite animal?", fieldId: "eng-oral-1" },
  14: { question: "Where are you from?",            fieldId: "eng-oral-2" },
  15: { question: "How are you?",                   fieldId: "eng-oral-3" },
  47: { question: "What is your favourite school subject? Why?", fieldId: "eng-oral-4" },
  48: { question: "What time do you get up?",        fieldId: "eng-oral-5" },
  49: { question: "What are your hobbies?",          fieldId: "eng-oral-6" },
};

let mediaRecorder  = null;
let audioChunks    = [];
let recordingSlide = null;
let recordingTimer = null;

async function startRecording(slideNum) {
  const btn    = document.getElementById('btn-record-' + slideNum);
  const status = document.getElementById('rec-status-' + slideNum);
  const wave   = document.getElementById('rec-waveform-' + slideNum);

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    recordingSlide = slideNum;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      wave.classList.remove('active');
      clearTimeout(recordingTimer);

      btn.disabled = true;
      btn.innerHTML = '<span class="rec-icon">⏳</span> Анализируем...';
      btn.className = 'btn-record';
      status.textContent = 'Отправляем на анализ...';

      const blob = new Blob(audioChunks, { type: mimeType });
      await analyzeAudio(blob, slideNum);
    };

    mediaRecorder.start();
    btn.className = 'btn-record recording';
    btn.innerHTML = '<span class="rec-icon">⏹️</span> Остановить запись';
    status.textContent = 'Запись идёт... (макс. 15 сек)';
    wave.classList.add('active');

    recordingTimer = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, 15000);

  } catch (err) {
    status.textContent = '⚠️ Нет доступа к микрофону. Разрешите доступ в браузере.';
    console.error(err);
  }
}

async function analyzeAudio(blob, slideNum) {
  const info     = ORAL_SLIDES[slideNum];
  const feedback = document.getElementById('oral-feedback-' + slideNum);
  const btn      = document.getElementById('btn-record-' + slideNum);
  const status   = document.getElementById('rec-status-' + slideNum);

  feedback.className = 'oral-feedback loading';
  feedback.textContent = '🔄 Распознаём речь...';

  try {

    const audioB64 = await blobToBase64(blob);

    const res = await fetch(WEB_APP_URL, {
      method: 'POST',

      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'speaking',
        question: info.question,
        audio: audioB64,
        mime: blob.type || 'audio/webm'
      })
    });

    const data = JSON.parse(await res.text());

    if (!data || !data.ok || !data.transcript) {
      const msg = (data && data.error === 'no_transcript')
        ? 'Речь не распознана. Попробуйте ещё раз — говорите громче и чётче.'
        : 'Не удалось получить оценку. Попробуйте записать ещё раз.';
      showOralError(slideNum, msg);
      return;
    }

    const transcript = data.transcript;
    const scores = {
      fluency: data.fluency,
      pronunciation: data.pronunciation,
      grammar: data.grammar,
      comment: data.comment
    };

    const summary = `Транскрипт: "${transcript}" | Беглость: ${scores.fluency}/10 | Произношение: ${scores.pronunciation}/10 | Грамматика: ${scores.grammar}/10 | Комментарий: ${scores.comment}`;
    document.getElementById(info.fieldId).value = summary;

    const colorClass = (n) => n >= 8 ? 'score-green' : n >= 5 ? 'score-yellow' : 'score-red';

    feedback.className = 'oral-feedback show';
    feedback.innerHTML = `
      <div class="of-transcript">💬 Мы услышали: <em>"${transcript}"</em></div>
      <div class="of-scores">
        <div class="of-score-item ${colorClass(scores.fluency)}">
          <div class="score-val">${scores.fluency}<span style="font-size:11px">/10</span></div>
          <div class="score-lbl">Беглость</div>
        </div>
        <div class="of-score-item ${colorClass(scores.pronunciation)}">
          <div class="score-val">${scores.pronunciation}<span style="font-size:11px">/10</span></div>
          <div class="score-lbl">Произношение</div>
        </div>
        <div class="of-score-item ${colorClass(scores.grammar)}">
          <div class="score-val">${scores.grammar}<span style="font-size:11px">/10</span></div>
          <div class="score-lbl">Грамматика</div>
        </div>
      </div>
      <div class="of-comment">💡 ${scores.comment}</div>
    `;

    status.textContent = '';
    btn.className = 'btn-record done';
    btn.innerHTML = '<span class="rec-icon">✅</span> Записать ещё раз';
    btn.disabled  = false;
    btn.onclick   = () => retryRecording(slideNum);

    document.getElementById('next' + slideNum).disabled = false;

  } catch (err) {
    console.error(err);
    showOralError(slideNum, 'Ошибка соединения. Проверьте интернет и попробуйте снова.');
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function showOralError(slideNum, msg) {
  const feedback = document.getElementById('oral-feedback-' + slideNum);
  const btn      = document.getElementById('btn-record-' + slideNum);
  feedback.className = 'oral-feedback show';
  feedback.innerHTML = `<div class="of-comment" style="color:#c62828;">⚠️ ${msg}</div>`;
  btn.className = 'btn-record';
  btn.innerHTML = '<span class="rec-icon">🎙️</span> Попробовать снова';
  btn.disabled  = false;
  btn.onclick   = () => startRecording(slideNum);
}

function retryRecording(slideNum) {
  const feedback = document.getElementById('oral-feedback-' + slideNum);
  const btn      = document.getElementById('btn-record-' + slideNum);
  const status   = document.getElementById('rec-status-' + slideNum);
  feedback.className = 'oral-feedback';
  feedback.innerHTML = '';
  status.textContent = '';
  btn.className  = 'btn-record';
  btn.innerHTML  = '<span class="rec-icon">🎙️</span> Начать запись';
  btn.onclick    = () => startRecording(slideNum);
  document.getElementById('next' + slideNum).disabled = true;
  const info = ORAL_SLIDES[slideNum];
  if (info) document.getElementById(info.fieldId).value = '';
}

function skipAudio(slideNum, fieldId) {
  const field = document.getElementById(fieldId);
  if (field) field.value = 'аудио не записано';

  const nextBtn = document.getElementById('next' + slideNum);
  if (nextBtn) nextBtn.disabled = false;

  const skipBtn = document.querySelector('#slide-' + slideNum + ' .btn-skip-audio');
  if (skipBtn) {
    skipBtn.textContent = '✓ Пропущено — можно продолжить';
    skipBtn.style.color = '#16a34a';
    skipBtn.style.borderColor = '#16a34a';
    skipBtn.disabled = true;
  }
}

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxhtEQCSBDXxp-Grji-SKSOjsyhNtLzgd6KbISzz7cFfmFCcJCreYvvziosyR-Th9gI2A/exec";

// Достаём ID сделки amoCRM из ссылки. Поддерживаем несколько вариантов имени параметра,
// чтобы бот мог формировать ссылку как удобнее:
//   ?lead_id=123  /  ?leadId=123  /  ?lead=123  /  ?utm_content=123  /  ?utm_term=123
// Если ID в ссылке нет — вернётся '' и бэкенд создаст новую сделку, как раньше.
function getLeadId() {
  try {
    var p = new URLSearchParams(window.location.search);
    var keys = ['lead_id', 'leadId', 'lead', 'deal_id', 'dealId', 'utm_content', 'utm_term'];
    for (var i = 0; i < keys.length; i++) {
      var v = (p.get(keys[i]) || '').trim();
      if (v && /^\d+$/.test(v)) return v;   // только числовой ID
    }
  } catch (e) {}
  return '';
}

const KIDS_SLIDES  = [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,26];
const TEENS_SLIDES = [38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,66];

let engBranch = 'kids';
let engMax    = 17;

let route    = [];
let routePos = 0;
let includeProg = true;

let engScore = 0;

let progExpScore = 0;

function selectProgExp(btn, groupId, score, slideNum) {
  document.querySelectorAll('#' + groupId + ' .opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  progExpScore = score;
  const nextBtn = document.getElementById('next' + slideNum);
  if (nextBtn) nextBtn.disabled = false;
}

function getProgLevel() {
  if (progExpScore >= 5) return 'Advanced — уже делает свои проекты';
  if (progExpScore >= 3) return 'Creator — есть опыт HTML/CSS или Python';
  if (progExpScore >= 1) return 'Explorer — пробовал визуальные среды';
  return 'Beginner — ещё не программировал';
}

function buildRoute() {
  const age = parseInt(document.getElementById('ageRange').value, 10) || 10;
  const isTeen = age >= 12;
  engBranch = isTeen ? 'teens' : 'kids';
  engMax    = isTeen ? 27 : 17;
  const english = isTeen ? TEENS_SLIDES : KIDS_SLIDES;
  const prog = includeProg ? [29,30,31,32,33,34,35,36] : [];
  route = [1,2,3, 69, 4,5,6, ...english, ...prog, 70,71,72,73,74, 37];
}

function showSlide(id) {
  document.querySelectorAll('.quiz-slide').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('slide-' + id);
  if (el) el.classList.add('active');
}

function startQuiz() {
  document.getElementById('hero').style.display = 'none';
  document.getElementById('quizWrap').classList.add('active');
  includeProg = true;
  buildRoute();
  routePos = 0;
  showSlide(route[0]);
  updateProgress();
}

function updateProgress() {
  const total = route.length;
  const pct = total > 1 ? (routePos / (total - 1)) * 100 : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('stepLabel').textContent = (routePos + 1) + ' из ' + total;
}

function goNext(step) {

  if (route[routePos] === 2) buildRoute();
  if (routePos < route.length - 1) routePos++;
  showSlide(route[routePos]);
  updateProgress();
  window.scrollTo(0, 0);
}

function goBack(step) {
  if (routePos > 0) routePos--;
  showSlide(route[routePos]);
  updateProgress();
  window.scrollTo(0, 0);
}

function selectOpt(btn, groupId) {
  document.querySelectorAll('#' + groupId + ' .opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function toggleOpt(btn, groupId) {
  btn.classList.toggle('selected');
}

function autoNext(step) {
  const nextBtn = document.getElementById('next' + step);
  if (nextBtn) nextBtn.disabled = false;
}

function syncNext(groupId, nextBtnId) {
  const hasAny = !!document.querySelector('#' + groupId + ' .opt.selected');
  document.getElementById(nextBtnId).disabled = !hasAny;
}

const engAnswered = {};

function answerEngMulti(btn, qid, isCorrect, slideNum, totalQ) {
  const grid = btn.closest('.options-grid');
  if (engAnswered[qid] === true) {
    engScore = Math.max(0, engScore - 1);
  }
  grid.querySelectorAll('.opt').forEach(b => b.classList.remove('selected', 'correct', 'wrong'));
  btn.classList.add('selected');
  if (isCorrect) {
    engScore++;
    engAnswered[qid] = true;
  } else {
    engAnswered[qid] = false;
  }
  let answeredCount = 0;
  for (let i = 1; i <= totalQ; i++) {
    if (engAnswered[slideNum + '_' + i] !== undefined) answeredCount++;
  }
  const nextBtn = document.getElementById('next' + slideNum);
  if (nextBtn && answeredCount >= totalQ) nextBtn.disabled = false;
}

function answerEng(btn, slideNum, isCorrect) {
  const grid = btn.closest('.options-grid');

  if (engAnswered[slideNum] === true) {
    engScore = Math.max(0, engScore - 1);
  }

  grid.querySelectorAll('.opt').forEach(b => {
    b.classList.remove('selected', 'correct', 'wrong');
  });

  btn.classList.add('selected');

  if (isCorrect) {
    engScore++;
    engAnswered[slideNum] = true;
  } else {
    engAnswered[slideNum] = false;
  }

  const nextBtn = document.getElementById('next' + slideNum);
  if (nextBtn) nextBtn.disabled = false;
}

function answerEngIntro(btn, slideNum) {
  document.querySelectorAll('#opts-eng-1 .opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const nextBtn = document.getElementById('next' + slideNum);
  if (nextBtn) nextBtn.disabled = false;
}

function getEngLevel() {
  const s = engScore;
  if (engBranch === 'teens') {

    if (s >= 26) return 'Upper-Intermediate';
    if (s >= 20) return 'Intermediate';
    if (s >= 14) return 'Pre-Intermediate';
    if (s >= 7)  return 'Elementary';
    return 'Beginner';
  }

  if (s >= 15) return 'Upper-Intermediate';
  if (s >= 12) return 'Intermediate';
  if (s >= 8)  return 'Pre-Intermediate';
  if (s >= 4)  return 'Elementary';
  return 'Beginner';
}

function getSelected(groupId) {
  const sel = document.querySelector('#' + groupId + ' .opt.selected');
  if (!sel) return 'не указано';
  const strong = sel.querySelector('strong');
  const span   = sel.querySelector('span');
  return strong
    ? strong.textContent.trim() + (span ? ' — ' + span.textContent.trim() : '')
    : sel.textContent.trim();
}

function oralVal(i) {
  const ids = engBranch === 'teens'
    ? ['eng-oral-4','eng-oral-5','eng-oral-6']
    : ['eng-oral-1','eng-oral-2','eng-oral-3'];
  const el = document.getElementById(ids[i]);
  return (el && el.value) ? el.value : 'не записано';
}

function getMultiSelected(groupId) {
  const selected = document.querySelectorAll('#' + groupId + ' .opt.selected');
  if (!selected.length) return 'не указано';
  return Array.from(selected)
    .map(btn => (btn.querySelector('strong') || btn).textContent.trim())
    .filter(Boolean)
    .join(', ');
}

function checkContact() {
  const name  = document.getElementById('parentName').value.trim();
  const email = document.getElementById('parentEmail').value.trim();
  const phone = document.getElementById('parentPhone').value.trim();
  document.getElementById('nextSubmit').disabled = !(name && email && phone.length >= 6);
}

function buildReportHTML(d, R) {
  var ACA_PHONE = '+7 (707) 593 87 66';
  var ACA_SITE  = 'https://morrison-academy.kz/';
  function e(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function pill(label, value){
    return '<div class="pill"><div class="pill-l">'+e(label)+'</div><div class="pill-v">'+e(value||'—')+'</div></div>';
  }
  function secLabel(t){ return '<div class="sec-label"><span class="dot"></span>'+e(t)+'</div>'; }
  function diagItem(text, color){
    return '<div class="di"><span class="di-mk" style="background:'+color+'">'+(color==='#16a34a'?'✓':'↑')+'</span><span>'+e(text)+'</span></div>';
  }
  function bullets(arr, color){
    var mark = color==='#16a34a' ? '✓' : '↑';
    return (arr||[]).map(function(t){
      return '<div class="di"><span class="di-mk" style="background:'+color+'">'+mark+'</span><span>'+e(t)+'</span></div>';
    }).join('');
  }
  function advItem(t){ return '<div class="adv"><span class="adv-dot"></span><span>'+e(t)+'</span></div>'; }
  function planRow(badge, icon, badgeBg, badgeFg, boxBg, boxBorder, text){
    return '<div class="plan-row">'
      + '<div class="plan-badge" style="background:'+badgeBg+';color:'+badgeFg+'"><div class="plan-ic">'+icon+'</div>'+badge+'</div>'
      + '<div class="plan-box" style="background:'+boxBg+';border-color:'+boxBorder+'">'+e(text)+'</div>'
      + '</div>';
  }

  var hasProg = d.hasProg;
  var interestsPill = d.interests ? pill('ИНТЕРЕСЫ', d.interests) : pill('КЛАСС', d.childClass);
  var phonePill = (d.parentPhone && d.parentPhone!=='не указан') ? pill('ТЕЛЕФОН', d.parentPhone) : pill('EMAIL', d.parentEmail);

  function reqRow(label, value){
    if(!value || value==='—') return '';
    return '<div class="req-row"><span class="req-l">'+e(label)+'</span><span class="req-v">'+e(value)+'</span></div>';
  }
  var reqRows = ''
    + reqRow('ПРИЧИНА ОБРАЩЕНИЯ', d.reqReason)
    + reqRow('БЕСПОКОИТ', d.reqWorry)
    + reqRow('ОПЫТ С КУРСАМИ', d.reqExp)
    + reqRow('ХОЧЕТ ПОЛУЧИТЬ', d.reqWant)
    + reqRow('КРИТЕРИЙ ВЫБОРА', d.reqCriterion)
    + ((d.notes && d.notes!=='нет') ? reqRow('ПОЖЕЛАНИЯ', d.notes) : '');
  var parentReq = reqRows
    ? '<div class="req-box"><div class="req-h">👨‍👩‍👧 Запрос родителя</div>'+reqRows+'</div>'
    : '';

  var css = ''
  + '*{box-sizing:border-box;margin:0;padding:0;}'
  + 'body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#1e293b;background:#ffffff;}'
  + '.page{width:100%;margin:0 auto;padding:0 0 10px;}'
  + '.hd{background:#2f7ef5;color:#fff;border-radius:16px 16px 0 0;padding:26px 32px;display:flex;justify-content:space-between;align-items:flex-start;}'
  + '.hd .logo-top{font-size:12px;color:#cfe2ff;font-weight:600;}'
  + '.hd .logo{font-size:23px;font-weight:800;margin:3px 0 1px;}'
  + '.hd .logo .c{color:#ffd84d;}.hd .logo .a{color:#bcd7ff;}'
  + '.hd .logo-sub{font-size:11px;color:#cfe2ff;}'
  + '.hd .contacts{text-align:right;font-size:12px;color:#e3eeff;line-height:1.7;}'
  + '.band{background:#F9C416;padding:22px 32px;}'
  + '.band .kicker{font-size:11px;font-weight:800;letter-spacing:1px;color:#7a5c00;}'
  + '.band .title{font-size:25px;font-weight:800;color:#1e293b;margin:8px 0 3px;}'
  + '.band .sub{font-size:12px;color:#7a5c00;}'
  + '.body{padding:6px 32px 0;}'
  + '.sec-label{display:inline-flex;align-items:center;gap:7px;background:#e8f1ff;color:#2f7ef5;font-size:11px;font-weight:800;letter-spacing:.6px;border-radius:20px;padding:6px 14px;margin:24px 0 14px;}'
  + '.sec-label .dot{width:7px;height:7px;border-radius:50%;background:#2f7ef5;display:inline-block;}'
  + '.pills{width:100%;}'
  + '.pills:after{content:"";display:table;clear:both;}'
  + '.pill{float:left;width:31.5%;margin:0 2.75% 10px 0;background:#f1f5f9;border-radius:12px;padding:10px 16px;min-height:48px;}'
  + '.pill:nth-child(3n){margin-right:0;}'
  + '.pill-l{font-size:10px;font-weight:800;letter-spacing:.5px;color:#94a3b8;}'
  + '.pill-v{font-size:13px;color:#1e293b;margin-top:2px;}'
  + '.divider{height:1px;background:#e8edf3;margin:22px 0;}'
  + '.course{display:flex;align-items:center;gap:18px;border:2px solid #F9C416;border-radius:16px;padding:18px 22px;background:#fffdf5;}'
  + '.course-ic{width:54px;height:54px;border-radius:14px;background:#F9C416;display:flex;align-items:center;justify-content:center;font-size:26px;flex:0 0 auto;}'
  + '.course-name{font-size:18px;font-weight:800;}.course-name .age{color:#2f7ef5;}'
  + '.course-sub{font-size:12px;color:#64748b;margin-top:3px;}'
  + '.para{font-size:13px;line-height:1.65;color:#334155;margin:14px 2px;}'
  + '.two{display:flex;gap:16px;}'
  + '.col{flex:1;border-radius:16px;padding:16px 18px;}'
  + '.col.green{background:#ecfdf5;border:1px solid #bbf7d0;}'
  + '.col.amber{background:#fffbeb;border:1px solid #fde68a;}'
  + '.col-h{font-size:14px;font-weight:800;margin-bottom:10px;}'
  + '.col.green .col-h{color:#15803d;}.col.amber .col-h{color:#b45309;}'
  + '.di{display:flex;gap:9px;align-items:flex-start;margin:8px 0;font-size:12.5px;line-height:1.5;color:#334155;}'
  + '.di-mk{flex:0 0 auto;width:18px;height:18px;border-radius:50%;color:#fff;font-size:11px;font-weight:bold;display:flex;align-items:center;justify-content:center;margin-top:1px;}'
  + '.tipbox{background:#eff6ff;border-radius:16px;padding:16px 18px;margin:18px 0;}'
  + '.tipbox .th{font-weight:800;margin-bottom:6px;color:#1e293b;}'
  + '.tipbox .tt{font-size:12.5px;line-height:1.6;color:#334155;}'
  + '.inline-h{display:flex;align-items:center;gap:10px;margin:18px 0 8px;}'
  + '.inline-h .ih-t{font-size:15px;font-weight:800;}'
  + '.badge{font-size:11px;font-weight:700;border-radius:16px;padding:4px 13px;}'
  + '.badge.violet{background:#ede9fe;color:#6d28d9;}'
  + '.badge.green{background:#dcfce7;color:#15803d;}'
  + '.badge.blue{background:#dbeafe;color:#1d4ed8;}'
  + '.muted{font-size:12px;color:#64748b;}'
  + '.bar{height:11px;border-radius:7px;background:#e2e8f0;overflow:hidden;margin:9px 0;}'
  + '.bar > span{display:block;height:100%;background:#16a34a;border-radius:7px;}'
  + '.softbox{border-radius:16px;padding:14px 18px;font-size:12.5px;line-height:1.6;color:#334155;}'
  + '.softbox.green{background:#f0fdf4;}'
  + '.req-box{background:#fff7ed;border-radius:16px;padding:16px 18px;margin:16px 0;}'
  + '.req-h{font-weight:800;color:#b45309;margin-bottom:10px;}'
  + '.req-row{display:flex;gap:10px;font-size:12.5px;margin:5px 0;}'
  + '.req-l{font-size:10px;font-weight:800;letter-spacing:.5px;color:#9a7b3a;flex:0 0 160px;width:160px;padding-right:10px;padding-top:2px;}'
  + '.req-v{color:#334155;}'
  + '.advbox{background:#f8fafc;border-radius:16px;padding:16px 20px;}'
  + '.adv{display:flex;gap:10px;align-items:flex-start;margin:9px 0;font-size:12.5px;color:#334155;line-height:1.5;}'
  + '.adv-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#2f7ef5;margin-top:6px;}'
  + '.plan-row{display:flex;gap:14px;align-items:stretch;margin:10px 0;}'
  + '.plan-badge{flex:0 0 104px;border-radius:14px;font-size:11px;font-weight:800;letter-spacing:.5px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 6px;text-align:center;}'
  + '.plan-ic{font-size:20px;margin-bottom:4px;}'
  + '.plan-box{flex:1;border:1px solid;border-radius:14px;padding:14px 16px;font-size:12.5px;line-height:1.6;color:#334155;}'
  + '.quote{background:#fffbeb;border-radius:16px;padding:18px 22px;margin-bottom:6px;}'
  + '.quote .q{font-size:34px;color:#F9C416;line-height:.5;font-weight:800;}'
  + '.quote .qt{font-size:13px;line-height:1.7;font-style:italic;color:#475569;margin-top:6px;}'
  + '.ft{display:flex;justify-content:space-between;border-top:1px solid #e8edf3;margin-top:24px;padding:16px 32px 4px;font-size:11px;color:#94a3b8;}'
  + '.ft .r{color:#2f7ef5;font-weight:600;}'
  + '.avoid{page-break-inside:avoid;}';

  return ''
  + '<div class="page">'

  + '<div class="hd"><div>'
  + '<img src="data:image/jpeg;base64,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" alt="Morrison Academy" style="height:46px;border-radius:8px;display:block;margin-bottom:6px;">'
  + '<div class="logo-sub">IT-школа для детей</div>'
  + '</div><div class="contacts">'+e(ACA_PHONE)+'<br>'+e(ACA_SITE)+'<br>'+e(d.date)+'</div></div>'

  + '<div class="band"><div class="kicker">ПЕРСОНАЛЬНОЕ КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</div>'
  + '<div class="title">для '+e(d.childName)+'</div>'
  + '<div class="sub">Подготовлено специально для вас · '+e(d.date)+'</div></div>'

  + '<div class="body">'

  + secLabel('ДАННЫЕ АНКЕТЫ')
  + '<div class="pills">'
  + pill('РЕБЁНОК', d.childName + (d.childAge?', '+d.childAge+' лет':''))
  + pill('РОДИТЕЛЬ', d.parentName)
  + phonePill
  + interestsPill
  + pill('ОПЫТ КОДА', hasProg ? d.progExp : 'не проходил')
  + pill('АНГЛИЙСКИЙ', d.engLevel)
  + pill('ИИ', d.aiUsage)
  + pill('ЗНАКОМ С ИИ', d.aiAwareness)
  + pill('ТИП', d.diagType)
  + '</div>'
  + '<div class="divider"></div>'

  + secLabel('РЕКОМЕНДОВАННЫЙ КУРС')
  + '<div class="course avoid"><div class="course-ic">'+d.courseIcon+'</div><div>'
  + '<div class="course-name">'+e(d.courseName)+' — <span class="age">возраст '+e(d.courseAge)+'</span></div>'
  + '<div class="course-sub">'+e(d.courseSchedule)+'</div></div></div>'
  + '<div class="para">'+e(R.courseReason)+'</div>'
  + '<div class="divider"></div>'

  + secLabel('ДИАГНОСТИКА РЕБЁНКА')
  + '<div class="two avoid">'
  + '<div class="col green"><div class="col-h">💪 Сильные стороны</div>'+bullets(R.strengths,'#16a34a')+'</div>'
  + '<div class="col amber"><div class="col-h">🌱 Зоны роста</div>'+bullets(R.growth,'#d97706')+'</div>'
  + '</div>'

  + '<div class="tipbox avoid"><div class="th">🎯 Как лучше учить '+e(d.childName)+'</div><div class="tt">'+e(R.howToTeach)+'</div></div>'

  + '<div class="inline-h"><span class="ih-t">🤖 ИИ-инструменты</span><span class="badge violet">'+e(R.aiToolsLevel)+'</span></div>'
  + '<div class="para" style="margin-top:0">'+e(R.aiToolsText)+'</div>'

  + (hasProg
      ? '<div class="inline-h"><span class="ih-t">💻 Программирование</span><span class="badge blue">'+e(d.progLevel)+'</span></div>'
        + '<div class="para" style="margin-top:0">'+e(R.progText || R.aiToolsText)+'</div>'
      : '')

  + '<div class="inline-h"><span class="ih-t">🇬🇧 Уровень английского</span><span class="badge green">'+e(d.engLevel)+'</span>'
  + '<span class="muted">'+d.engScore+' / '+d.engMax+' верных ('+d.pct+'%)</span></div>'
  + '<div class="bar"><span style="width:'+d.pct+'%"></span></div>'
  + '<div class="softbox green">'+e(R.englishText)+'</div>'

  + parentReq
  + '<div class="divider"></div>'

  + secLabel('ПРЕИМУЩЕСТВА КУРСА')
  + '<div class="advbox avoid">'+(R.advantages||[]).map(advItem).join('')+'</div>'

  + secLabel('ПЛАН РАЗВИТИЯ ПО НЕДЕЛЯМ')
  + planRow('2 НЕДЕЛИ','🌱','#dcfce7','#15803d','#f0fdf4','#bbf7d0',R.plan.m1)
  + planRow('6 НЕДЕЛЬ','🚀','#ede9fe','#6d28d9','#f5f3ff','#ddd6fe',R.plan.m3)
  + planRow('8 НЕДЕЛЬ','🏆','#fef3c7','#b45309','#fffbeb','#fde68a',R.plan.m6)

  + secLabel('ЛИЧНОЕ ОБРАЩЕНИЕ')
  + '<div class="quote avoid"><div class="q">“</div><div class="qt">'+e(R.personalMessage)+'</div></div>'

  + '</div>'

  + '<div class="ft"><span>Morrison Code Academy · '+e(d.date)+'</span><span class="r">'+e(ACA_PHONE)+'  ·  '+e(ACA_SITE)+'</span></div>'

  + '</div>'
  + '<style>'+css+'</style>';
}

async function submitQuiz() {
  const parentName  = document.getElementById('parentName').value.trim();
  const parentEmail = document.getElementById('parentEmail').value.trim();
  const parentPhone = ((document.getElementById('parentPhone') || {}).value || '').trim();
  const errorMsg    = document.getElementById('errorMsg');

  if (!parentName || !parentEmail) {
    errorMsg.style.display = 'block';
    return;
  }
  errorMsg.style.display = 'none';

  const data = {

    childName:  document.getElementById('childName').value.trim(),
    childAge:   document.getElementById('ageRange').value,
    childClass: (document.getElementById('childClass').value || '').trim() || 'не указан',
    interests:   getMultiSelected('opts-interests'),
    reqReason:    getMultiSelected('opts-req-reason'),
    reqWorry:     getMultiSelected('opts-req-worry'),
    reqExp:       getMultiSelected('opts-req-exp'),
    reqWant:      getMultiSelected('opts-req-want'),
    reqCriterion: getMultiSelected('opts-req-criterion'),

    aiAwareness: getSelected('opts-ai-awareness'),
    aiUsage:     getSelected('opts-ai-usage'),
    aiPurpose:   getMultiSelected('opts-ai-purpose'),

    engBranch: engBranch,
    engMax:    engMax,
    engScore:  engScore,
    engLevel:  getEngLevel(),
    engOral1:  oralVal(0),
    engOral2:  oralVal(1),
    engOral3:  oralVal(2),

    progInterest: getSelected('opts-prog-1'),
    progTried:    getMultiSelected('opts-prog-2'),
    progGameView: getSelected('opts-prog-3'),
    progSteps:    getSelected('opts-prog-4'),
    progLikes:    getSelected('opts-prog-5'),
    progKnows:    getSelected('opts-prog-6'),
    progWants:    getMultiSelected('opts-prog-7'),
    progExp:      getSelected('opts-prog-8'),
    progScore:    progExpScore,
    progLevel:    getProgLevel(),

    parentName,
    parentEmail,
    parentPhone: parentPhone || 'не указан',
    notes: (document.getElementById('notes').value || '').trim() || 'нет',
    diagType: includeProg ? 'Английский + Программирование + ИИ' : 'Английский + ИИ',
    leadId: getLeadId(),
  };

  if (!includeProg) {
    ['progInterest','progTried','progGameView','progSteps','progLikes','progKnows','progWants','progExp']
      .forEach(k => data[k] = 'не проходил');
    data.progScore = '';
    data.progLevel = 'блок программирования отключён';
  }

  document.getElementById('quizWrap').classList.remove('active');
  document.getElementById('sendingScreen').classList.add('active');

  let pdfSent = false;
  try {

    const res = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: 'report' }, data))
    });
    const R = JSON.parse(await res.text());

    const isTeen = engBranch === 'teens';
    const ageLbl = isTeen ? '12–18 лет' : '6–11 лет';
    const course = includeProg
      ? { name: 'AI-лагерь PRO', schedule: 'Английский · Программирование · ИИ', icon: '🎮' }
      : { name: 'AI-лагерь Base', schedule: 'Английский · ИИ', icon: '🤖' };
    const pct = data.engMax ? Math.round(data.engScore / data.engMax * 100) : 0;

    const d = {
      childName: data.childName, childAge: data.childAge, childClass: data.childClass,
      hasProg: includeProg, parentName: data.parentName, parentPhone: data.parentPhone, parentEmail: data.parentEmail,
      progExp: data.progExp, progLevel: data.progLevel, engLevel: data.engLevel, engScore: data.engScore, engMax: data.engMax, pct: pct,
      aiUsage: data.aiUsage, aiAwareness: data.aiAwareness, diagType: data.diagType,
      interests: data.interests,
      reqReason: data.reqReason, reqWorry: data.reqWorry, reqExp: data.reqExp,
      reqWant: data.reqWant, reqCriterion: data.reqCriterion,
      courseName: course.name, courseAge: ageLbl, courseSchedule: course.schedule, courseIcon: course.icon,
      date: new Date().toLocaleDateString('ru-RU'), notes: data.notes
    };

    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (typeof html2canvas !== 'function' || typeof jsPDFCtor !== 'function') {
      throw new Error('PDF libs not loaded');
    }
    const PAGE_W = 794;
    const holder = document.createElement('div');

    holder.style.cssText = 'position:fixed;left:0;top:0;width:' + PAGE_W + 'px;background:#fff;z-index:-1;opacity:1;';
    const inner = buildReportHTML(d, R);
    holder.innerHTML = inner;

    const pageEl = holder.querySelector('.page');
    if (pageEl) { pageEl.style.width = PAGE_W + 'px'; pageEl.style.margin = '0'; }
    document.body.appendChild(holder);

    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 450)));

    const target = pageEl || holder;

    const canvas = await html2canvas(target, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      width: PAGE_W, windowWidth: PAGE_W, scrollX: 0, scrollY: 0
    });
    document.body.removeChild(holder);

    const jsPDF = jsPDFCtor;
    const pdfW = PAGE_W;
    const pdfH = Math.round(PAGE_W * 297 / 210);
    const pdf = new jsPDF({ unit: 'px', format: [pdfW, pdfH], orientation: 'portrait', hotfixes: ['px_scaling'] });

    const imgW = pdfW;
    const imgH = canvas.height * pdfW / canvas.width;
    const img = canvas.toDataURL('image/jpeg', 0.95);

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(img, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pdfH;
    while (heightLeft > 0) {
      position -= pdfH;
      pdf.addPage([pdfW, pdfH], 'portrait');
      pdf.addImage(img, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pdfH;
    }
    const blob = pdf.output('blob');

    const pdfB64 = await blobToBase64(blob);

    await fetch(WEB_APP_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: 'sendpdf', pdf: pdfB64 }, data))
    });
    pdfSent = true;
  } catch (err) {
    console.log('Клиентский PDF не удался, запасной путь (сервер):', err);
  }

  if (!pdfSent) {
    try {
      await fetch(WEB_APP_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) { console.log('Sent (no-cors fallback)'); }
  }

  setTimeout(() => {
    document.getElementById('sendingScreen').classList.remove('active');
    document.getElementById('successEmail').textContent = parentEmail;
    document.getElementById('successScreen').classList.add('active');
  }, pdfSent ? 300 : 2500);
}

function restart() {
  document.getElementById('successScreen').classList.remove('active');
  document.getElementById('hero').style.display = 'flex';

  includeProg = true;

  engScore = 0;
  progExpScore = 0;

  Object.keys(engAnswered).forEach(k => delete engAnswered[k]);

  ['childName', 'childClass', 'parentName', 'parentEmail', 'notes',
   'eng-oral-1', 'eng-oral-2', 'eng-oral-3',
   'eng-oral-4', 'eng-oral-5', 'eng-oral-6'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const ageRange = document.getElementById('ageRange');
  if (ageRange) ageRange.value = 10;
  const ageDisplay = document.getElementById('ageDisplay');
  if (ageDisplay) ageDisplay.textContent = '10 лет';

  document.querySelectorAll('.opt').forEach(b => {
    b.classList.remove('selected', 'correct', 'wrong');
    b.disabled = false;
  });

  document.querySelectorAll('.eng-feedback').forEach(el => {
    el.textContent = '';
    el.className = 'eng-feedback';
  });

  [13, 14, 15, 47, 48, 49].forEach(slideNum => {
    const feedback = document.getElementById('oral-feedback-' + slideNum);
    const btn      = document.getElementById('btn-record-' + slideNum);
    const status   = document.getElementById('rec-status-' + slideNum);
    const wave     = document.getElementById('rec-waveform-' + slideNum);
    if (feedback) { feedback.className = 'oral-feedback'; feedback.innerHTML = ''; }
    if (status)   { status.textContent = ''; }
    if (wave)     { wave.classList.remove('active'); }
    if (btn) {
      btn.className = 'btn-record';
      btn.innerHTML = '<span class="rec-icon">🎙️</span> Начать запись';
      btn.disabled  = false;
      btn.onclick   = () => startRecording(slideNum);
    }

    const nextBtn = document.getElementById('next' + slideNum);
    if (nextBtn) nextBtn.disabled = true;
  });

  document.querySelectorAll('.btn-skip-audio').forEach(btn => {
    btn.textContent = '🚫 Не могу записать аудио';
    btn.style.color = '';
    btn.style.borderColor = '';
    btn.disabled = false;
  });

  const toDisable = [
    'next1',
    'next4', 'next5', 'next6',
    'next7', 'next8', 'next9', 'next10', 'next11', 'next12',
    'next13', 'next14', 'next15',
    'next16', 'next17', 'next18', 'next19', 'next20', 'next21',
    'next22', 'next26',
    'next69', 'next70', 'next71', 'next72', 'next73', 'next74',
    'next29', 'next30', 'next31', 'next32', 'next33', 'next34', 'next35', 'next36',
    'next38', 'next39', 'next40', 'next41', 'next42', 'next43', 'next44', 'next45', 'next46', 'next47', 'next48', 'next49', 'next50', 'next51', 'next52', 'next53', 'next54', 'next55', 'next56', 'next57', 'next58', 'next59', 'next60', 'next61', 'next62', 'next66',
    'nextSubmit'
  ];
  toDisable.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  buildRoute();
  routePos = 0;
  document.querySelectorAll('.quiz-slide').forEach(s => s.classList.remove('active'));
  document.getElementById('slide-1').classList.add('active');
  document.getElementById('quizWrap').classList.remove('active');
  updateProgress();
}