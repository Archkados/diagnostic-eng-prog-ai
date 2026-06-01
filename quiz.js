

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
  document.getElementById('nextSubmit').disabled = !(name && email);
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
    + reqRow('ХОЧЕТ ЧЕРЕЗ 3–6 МЕС', d.reqWant)
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
  + '<div class="logo-top">⚡ morrison</div>'
  + '<div class="logo">Morrison <span class="c">Code</span> <span class="a">Academy</span></div>'
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

  + '<div class="inline-h"><span class="ih-t">🇬🇧 Уровень английского</span><span class="badge green">'+e(d.engLevel)+'</span>'
  + '<span class="muted">'+d.engScore+' / '+d.engMax+' верных ('+d.pct+'%)</span></div>'
  + '<div class="bar"><span style="width:'+d.pct+'%"></span></div>'
  + '<div class="softbox green">'+e(R.englishText)+'</div>'

  + parentReq
  + '<div class="divider"></div>'

  + secLabel('ПРЕИМУЩЕСТВА КУРСА')
  + '<div class="advbox avoid">'+(R.advantages||[]).map(advItem).join('')+'</div>'

  + secLabel('ПЛАН РАЗВИТИЯ ПО МЕСЯЦАМ')
  + planRow('1 МЕСЯЦ','🌱','#dcfce7','#15803d','#f0fdf4','#bbf7d0',R.plan.m1)
  + planRow('3 МЕСЯЦА','🚀','#ede9fe','#6d28d9','#f5f3ff','#ddd6fe',R.plan.m3)
  + planRow('6 МЕСЯЦЕВ','🏆','#fef3c7','#b45309','#fffbeb','#fde68a',R.plan.m6)

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
    reqReason:    getSelected('opts-req-reason'),
    reqWorry:     getSelected('opts-req-worry'),
    reqExp:       getSelected('opts-req-exp'),
    reqWant:      getSelected('opts-req-want'),
    reqCriterion: getSelected('opts-req-criterion'),

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
      progExp: data.progExp, engLevel: data.engLevel, engScore: data.engScore, engMax: data.engMax, pct: pct,
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