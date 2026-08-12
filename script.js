// ---- Config ----
const STORAGE_PREFIX = 'ielts-plan:';

// ---- Helpers ----
function todayISO(){
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
const TODAY = todayISO();

function buildWeeks(schedule){
  const weeks = [];
  let cur = [];
  schedule.forEach((d, i) => {
    cur.push(d);
    if (d.weekday === "Sunday" || i === schedule.length - 1) {
      weeks.push(cur);
      cur = [];
    }
  });
  return weeks;
}
const WEEKS = buildWeeks(SCHEDULE);

const PHASES = [
  {n:1, name:"Diagnose", days:14},
  {n:2, name:"Rebuild", days:28},
  {n:3, name:"Simulate", days:21},
  {n:4, name:"Taper", days:8},
  {n:5, name:"Exam", days:2},
];

let checkedState = {}; // date -> Set of checked task indices
let activeWeek = 0;

// ---- Storage (localStorage) ----
function loadState(){
  SCHEDULE.forEach(day => {
    const raw = localStorage.getItem(STORAGE_PREFIX + day.date);
    if(raw){
      try{
        checkedState[day.date] = new Set(JSON.parse(raw));
      }catch(e){ /* corrupted entry, ignore */ }
    }
  });
}

function saveDay(date){
  const arr = Array.from(checkedState[date] || []);
  if(arr.length === 0){
    localStorage.removeItem(STORAGE_PREFIX + date);
  } else {
    localStorage.setItem(STORAGE_PREFIX + date, JSON.stringify(arr));
  }
}

function resetAllProgress(){
  if(!confirm('This clears every checked task on this device. Continue?')) return;
  SCHEDULE.forEach(day => localStorage.removeItem(STORAGE_PREFIX + day.date));
  checkedState = {};
  render();
}

// ---- Stats ----
function dayStats(day){
  const set = checkedState[day.date] || new Set();
  return {checked: set.size, total: day.tasks.length};
}

function overallStats(){
  let checked = 0, total = 0;
  SCHEDULE.forEach(d => {
    const s = dayStats(d);
    checked += s.checked; total += s.total;
  });
  return {checked, total};
}

// ---- Render ----
function renderDial(){
  const {checked, total} = overallStats();
  const pct = total ? Math.round((checked/total)*100) : 0;
  const ring = document.getElementById('dial-ring');
  const circumference = 188.4;
  ring.setAttribute('stroke-dashoffset', circumference - (circumference*pct/100));
  document.getElementById('dial-pct').textContent = pct + '%';
  document.getElementById('dial-count').textContent = checked + ' / ' + total;
}

function renderCountdown(){
  const today = new Date(TODAY + 'T00:00:00');
  const exam = new Date(SCHEDULE[SCHEDULE.length-1].date + 'T00:00:00');
  const days = Math.round((exam - today) / 86400000);
  const el = document.getElementById('days-left');
  el.textContent = days >= 0 ? days : 'Exam day passed';
}

function renderPhaseTrack(){
  const track = document.getElementById('phase-track');
  track.innerHTML = '';
  PHASES.forEach(p => {
    const seg = document.createElement('div');
    seg.className = 'phase-seg';
    seg.style.flex = p.days;
    seg.textContent = p.n + '. ' + p.name;
    track.appendChild(seg);
  });
}

function renderWeekNav(){
  const nav = document.getElementById('week-nav');
  nav.innerHTML = '';
  WEEKS.forEach((w, i) => {
    const btn = document.createElement('button');
    btn.textContent = 'Wk ' + (i+1);
    if(i === activeWeek) btn.classList.add('active');
    btn.onclick = () => { activeWeek = i; render(); };
    nav.appendChild(btn);
  });
}

function fmtDateLabel(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
}

function renderDays(){
  const container = document.getElementById('days-container');
  container.innerHTML = '';
  const week = WEEKS[activeWeek];
  document.getElementById('week-title').textContent =
    'Week ' + (activeWeek+1) + '  \u00b7  ' + fmtDateLabel(week[0].date) + ' \u2192 ' + fmtDateLabel(week[week.length-1].date);

  week.forEach(day => {
    const card = document.createElement('div');
    card.className = 'day-card';
    card.id = 'day-' + day.date;
    if(day.is_mock) card.classList.add('mock');
    if(day.date === TODAY) card.classList.add('today');
    if(day.phase_name === 'Exam Day') card.classList.add('exam');

    const set = checkedState[day.date] || new Set();
    const stats = dayStats(day);

    let tagClass = '';
    let tagText = day.phase_name;
    if(day.is_mock){ tagClass='mock'; tagText='Mock Test'; }
    if(day.phase_name === 'Exam Day'){ tagClass='exam'; tagText='Exam Day'; }

    card.innerHTML = `
      <div class="day-head">
        <div>
          <div class="day-date">${fmtDateLabel(day.date)}${day.date===TODAY?' &middot; TODAY':''}</div>
          <div class="day-weekday">${day.weekday}</div>
        </div>
        <div class="day-tag ${tagClass}">${tagText}</div>
      </div>
      ${day.note ? `<div class="day-note">${day.note}</div>` : ''}
      <ul class="tasks">
        ${day.tasks.map((t, idx) => `
          <li class="${set.has(idx) ? 'checked' : ''}" data-idx="${idx}">
            <input type="checkbox" ${set.has(idx) ? 'checked' : ''} data-date="${day.date}" data-idx="${idx}">
            <span class="txt">${t.text}</span>
            ${t.minutes > 0 ? `<span class="mins">${t.minutes}m</span>` : ''}
          </li>
        `).join('')}
      </ul>
      <div class="day-foot">
        <span class="day-total">Total: ${day.total_minutes} min</span>
        <span class="day-progress">${stats.checked}/${stats.total} done</span>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const date = e.target.dataset.date;
      const idx = parseInt(e.target.dataset.idx);
      if(!checkedState[date]) checkedState[date] = new Set();
      if(e.target.checked) checkedState[date].add(idx);
      else checkedState[date].delete(idx);
      saveDay(date);
      renderDays();
      renderDial();
    });
  });
}

function render(){
  renderWeekNav();
  renderDays();
  renderDial();
}

document.getElementById('jump-today').addEventListener('click', () => {
  const idx = WEEKS.findIndex(w => w.some(d => d.date === TODAY));
  if(idx >= 0){
    activeWeek = idx; render();
    setTimeout(() => {
      const el = document.getElementById('day-' + TODAY);
      if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
    }, 50);
  } else {
    alert("Today's date isn't in the plan range (" + SCHEDULE[0].date + ' to ' + SCHEDULE[SCHEDULE.length-1].date + ').');
  }
});

document.getElementById('reset-progress').addEventListener('click', resetAllProgress);

(function init(){
  loadState();
  renderCountdown();
  renderPhaseTrack();
  const todayWeekIdx = WEEKS.findIndex(w => w.some(d => d.date === TODAY));
  activeWeek = todayWeekIdx >= 0 ? todayWeekIdx : 0;
  render();
})();
