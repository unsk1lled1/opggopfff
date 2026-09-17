import { STORAGE_KEY, validateBank, makeTurns, fingerprint, newSession, answer, advance, summarize, snapshot, restoreSession, questionMode, questionSetKey, revealOral, gradeOral } from './engine.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const coverTemplate = app.innerHTML;
const letters = ['A', 'B', 'C', 'D'];
let data, turns, bankId, session = null, isDemo = false, screen = 'home', filter = 'all', storageAvailable = true;
let countdownRun = 0, countdownActive = false;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const name = id => data.players.find(p => p.id === id).name;
const shortName = id => name(id).startsWith('[') ? 'Участник 2' : name(id);
const playerIds = () => data.players.map(p => p.id);
const initials = id => name(id).startsWith('[') ? 'II' : name(id).split(/\s+/).slice(0, 2).map(n => n[0]).join('');
const bankFor = id => data.questionSets[questionSetKey(id)];
const modeBadge = () => isDemo ? `<span class="mode-label">ДЕМОНСТРАЦИЯ · ${turns.length} ВОПРОСОВ</span>` : '<span class="mode-label">ПАРНАЯ ПРОВЕРКА ЗНАНИЙ</span>';
function notice(message) { const el = document.querySelector('#notice'); el.textContent = message; el.hidden = !message; }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(session, turns))); storageAvailable = true; }
  catch { storageAvailable = false; notice('Браузер не разрешает сохранение. Игра работает, но прогресс сохранится только до закрытия или обновления страницы.'); }
}
function show(next, focus = true) {
  if (next !== 'countdown' && countdownActive) cancelCountdown();
  screen = next;
  if (next === 'home') renderHome();
  if (next === 'game') renderGame();
  if (next === 'results') renderResults();
  if (next === 'review') renderReview();
  if (focus) { app.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
}
function renderHome() {
  app.innerHTML = coverTemplate;
  app.querySelector('.participants').innerHTML = playerIds().map((id, i) => `<div class="participant-tile"><span class="avatar">${escape(initials(id))}</span><div><small>УЧАСТНИК 0${i + 1}</small><strong>${escape(name(id))}</strong><span>${isDemo ? 50 : bankFor(id).length} вопросов</span></div></div>`).join('');
  if (!isDemo) app.querySelector('.cover-format').innerHTML = `${turns.length} вопросов <span>•</span> 2 участника <span>•</span> одна проверка знаний`;
  const button = app.querySelector('.start-button');
  button.disabled = false;
  button.dataset.action = session ? 'resume' : 'start';
  button.innerHTML = `${session ? session.status === 'completed' ? 'Посмотреть результаты' : 'Продолжить викторину' : 'Начать викторину'} <span aria-hidden="true">→</span>`;
  if (session) button.insertAdjacentHTML('afterend', '<button class="text-button restart-link" data-action="restart">Начать заново</button>');
  app.querySelector('.demo-note').innerHTML = isDemo ? `<span class="demo-badge">DEMO</span> Сейчас ${turns.length} пробных вопросов. Основной банк — позднее.` : '<span aria-hidden="true">◇</span> Прогресс автоматически сохраняется в этом браузере';
}
function scoreCard(id, active, justScored = false) {
  const s = summarize(session, turns)[id];
  return `<section class="score-card ${active ? 'is-active' : ''}" aria-label="${escape(name(id))}, счёт ${s.correct}"><div class="score-person"><span class="avatar">${escape(initials(id))}</span><div><span class="score-label">${active ? 'ОТВЕЧАЕТ СЕЙЧАС' : 'УЧАСТНИК'}</span><strong>${escape(name(id))}</strong></div></div><div class="score-numbers"><span>СЧЁТ</span><b class="${justScored ? 'score-pop' : ''}">${s.correct}</b>${justScored ? '<i class="plus-one">+1</i>' : ''}</div><div class="score-progress"><span>${s.answered} / ${s.total} вопросов</span><span>${s.total ? Math.round(s.answered / s.total * 100) : 0}%</span><progress value="${s.answered}" max="${s.total}" aria-label="Прогресс ${escape(shortName(id))}"></progress></div></section>`;
}
function renderChoice(q, response) {
  return `<div class="answers">${session.optionOrders[session.cursor].map((option, i) => {
    const correct = response && option === q.correctAnswer;
    const wrong = response && !response.correct && option === response.selectedAnswer;
    return `<button class="answer ${correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}" data-action="answer" data-option="${i}" ${response ? 'disabled' : ''}><span class="answer-letter">${letters[i]}</span><span class="answer-text">${escape(option)}</span>${correct ? '<span class="answer-state" aria-label="Правильный ответ">✓</span>' : wrong ? '<span class="answer-state" aria-label="Ваш неверный ответ">×</span>' : ''}</button>`;
  }).join('')}</div>`;
}
function renderOral(q, response) {
  const revealed = session.revealedQuestionIds.includes(q.id);
  if (!revealed) return `<div class="oral-prompt"><span class="oral-prompt-symbol" aria-hidden="true">◇</span><p>Сначала ответьте вслух.<br><span>Затем проверяющий откроет правильный ответ.</span></p><button class="button primary" data-action="reveal-oral">Показать ответ <span aria-hidden="true">↓</span></button></div>`;
  return `<div class="oral-revealed" role="region" aria-labelledby="oral-answer-label"><span class="oral-answer-label" id="oral-answer-label">Правильный ответ</span><p>${escape(q.correctAnswer)}</p></div>${response ? '' : `<div class="oral-assessment"><p>Проверяет: <strong>${escape(name(q.reader))}</strong><br>Засчитать устный ответ?</p><div class="oral-grade-buttons"><button class="button oral-correct" data-action="grade-oral" data-correct="true">Верно +1</button><button class="button oral-incorrect" data-action="grade-oral" data-correct="false">Неверно</button></div></div>`}`;
}
function renderGame(justScored = false) {
  const q = turns[session.cursor];
  const response = session.responses[session.cursor];
  const oral = questionMode(q) === 'oral';
  const revealed = oral && session.revealedQuestionIds.includes(q.id);
  const [first, second] = playerIds();
  const instruction = response ? 'Ответ принят. Обсудите результат перед следующим ходом.' : oral ? revealed ? 'Сравните устный ответ с образцом и выставьте оценку.' : 'Ответьте вслух — оценку выставит проверяющий участник.' : 'Выберите один правильный ответ';
  app.innerHTML = `<section class="game-page">
    <div class="game-topline"><button class="text-button" data-action="home">← <span>На главную</span></button>${modeBadge()}<span class="overall-progress">ХОД ${session.cursor + 1} <span>/ ${turns.length}</span></span></div>
    <div class="game-scoreboard">${scoreCard(first, q.respondent === first, justScored && q.respondent === first)}<div class="scoreboard-title"><span class="small-scales" aria-hidden="true">⚖</span><span>ОСНОВЫ ПРАВА</span><small>ПАРНАЯ РАБОТА</small></div>${scoreCard(second, q.respondent === second, justScored && q.respondent === second)}</div>
    <div class="turn-line"><span>${escape(name(q.reader))} задаёт вопрос</span><span class="turn-arrow" aria-hidden="true">→</span><strong>Отвечает: ${escape(name(q.respondent))}</strong></div>
    <article class="question-sheet ${response || revealed ? 'answered' : ''}" aria-labelledby="question-title">
      <div class="question-meta"><span>ВОПРОС ${String(q.number).padStart(2, '0')} <span class="meta-divider">/ ${bankFor(q.respondent).length}</span></span><span class="category">${escape(q.category || q.section || 'Основы права')}</span></div>
      ${oral ? '<div class="oral-badge">УСТНЫЙ ВОПРОС</div>' : ''}
      <h2 id="question-title">${escape(q.question)}</h2><p class="question-instruction">${instruction}</p>
      ${oral ? renderOral(q, response) : renderChoice(q, response)}
    </article>
    <div class="feedback-row" aria-live="polite" aria-atomic="true">${response ? `<div class="feedback ${response.correct ? 'correct-feedback' : 'wrong-feedback'}"><span class="feedback-symbol">${response.correct ? '✓' : '×'}</span><div><strong>${response.correct ? 'Верно. +1 балл' : 'Неверно. 0 баллов'}</strong><p>${oral ? `Оценка проверяющего: ${escape(name(q.reader))}.` : response.correct ? 'Хороший ответ. Продолжим проверку знаний.' : `Правильный ответ: ${escape(q.correctAnswer)}`}</p></div></div><button class="button primary" data-action="next">${session.cursor === turns.length - 1 ? 'Посмотреть результаты' : 'Следующий вопрос'} <span>→</span></button>` : `<span class="answer-hint"><span aria-hidden="true">◇</span> Не торопитесь — время на ответ не ограничено</span>${oral ? '' : '<span class="keyboard-hint">Клавиши <kbd>1</kbd>–<kbd>4</kbd> для ответа</span>'}`}</div>
    <div class="game-bottom"><details class="question-map"><summary>Карта вопросов <span>⌄</span></summary><div class="map-content">${playerIds().map(id => `<div class="map-player"><strong>${escape(name(id))}</strong><div class="map-grid">${bankFor(id).map(question => { const r = session.responses.find(item => item.questionId === question.id); const current = question.id === q.id; return `<span class="map-cell ${current ? 'current' : ''} ${r ? r.correct ? 'correct' : 'wrong' : ''}" ${current ? 'aria-current="step"' : ''} title="${question.number}: ${r ? r.correct ? 'верно' : 'ошибка' : current ? 'текущий' : 'ещё не отвечали'}">${question.number}</span>` }).join('')}</div></div>`).join('')}<div class="map-legend"><span><i></i> Впереди</span><span><i class="current"></i> Сейчас</span><span><i class="correct"></i> Верно</span><span><i class="wrong"></i> Ошибка</span></div></div></details><span class="save-label">${storageAvailable ? '✓ Прогресс сохранён' : 'Прогресс не сохраняется'}</span></div>
  </section>`;
}
function refreshAfterAction(scored, focusSelector) {
  const mapWasOpen = app.querySelector('.question-map')?.open;
  persist();
  renderGame(scored);
  app.querySelector('.question-map').open = mapWasOpen;
  app.querySelector(focusSelector)?.focus({ preventScroll: true });
}
function renderResults() {
  const stats = summarize(session, turns);
  const correct = stats[playerIds()[0]].correct + stats[playerIds()[1]].correct;
  const winner = stats[playerIds()[0]].correct === stats[playerIds()[1]].correct ? 'Равный результат' : `Лучший результат — ${name(stats[playerIds()[0]].correct > stats[playerIds()[1]].correct ? playerIds()[0] : playerIds()[1])}`;
  app.innerHTML = `<section class="results-page"><div class="page-kicker">${modeBadge()}</div><div class="result-emblem" aria-hidden="true">⚖</div><div class="eyebrow centered">ПОДВОДИМ ИТОГИ</div><h1 class="page-title">Проверка завершена</h1><p class="page-description">Каждый ответ — ещё один шаг к уверенным знаниям.</p><div class="result-cards">${playerIds().map((id, i) => `<article class="result-card"><span class="result-player-index">УЧАСТНИК 0${i + 1}</span><span class="avatar">${escape(initials(id))}</span><h2>${escape(name(id))}</h2><div class="result-score">${stats[id].correct}<span>/ ${stats[id].total}</span></div><div class="result-percent">${stats[id].percent}% <span>правильных ответов</span></div><progress value="${stats[id].correct}" max="${stats[id].total}" aria-label="Доля правильных ответов ${escape(shortName(id))}"></progress><div class="result-breakdown"><span>Верно <b>${stats[id].correct}</b></span><span>Ошибок <b>${stats[id].wrong}</b></span></div></article>`).join('')}</div><p class="winner"><span aria-hidden="true">◇</span> ${escape(winner)}</p><div class="total-stats"><div><strong>${correct}</strong><span>Правильные ответы</span></div><div><strong>${turns.length - correct}</strong><span>Ошибки</span></div><div><strong>${Math.round(correct / turns.length * 100)}%</strong><span>Общий процент</span></div></div><div class="result-actions"><button class="button primary" data-action="review">Работа над ошибками <span>→</span></button><button class="button" data-action="restart">Начать заново</button><button class="text-button" data-action="home">На главную</button></div>${isDemo ? '<p class="results-note">Демонстрация завершена. Это проверка интерфейса, а не знаний по праву.</p>' : ''}</section>`;
}
function renderReview() {
  const errors = session.responses.filter(r => !r.correct);
  const visible = errors.filter(r => filter === 'all' || r.respondent === filter);
  app.innerHTML = `<section class="review-page"><div class="game-topline"><button class="text-button" data-action="results">← К результатам</button>${modeBadge()}</div><div class="eyebrow">РАЗБИРАЕМ И ЗАПОМИНАЕМ</div><h1 class="page-title">Работа над ошибками</h1><p class="page-description">Вернитесь к сложным вопросам и обсудите правильные ответы.</p><div class="review-filters" role="group" aria-label="Показать ошибки участника">${[['all', 'Все ошибки'], [playerIds()[0], shortName(playerIds()[0])], [playerIds()[1], shortName(playerIds()[1])]].map(([id, label]) => `<button class="filter-button ${filter === id ? 'selected' : ''}" aria-pressed="${filter === id}" data-action="filter" data-filter="${id}">${escape(label)} <span>${errors.filter(r => id === 'all' || r.respondent === id).length}</span></button>`).join('')}</div><div class="review-list">${visible.length ? visible.map(r => { const q = turns.find(q => q.id === r.questionId); return `<article class="review-card"><div class="review-meta"><span>${escape(name(q.respondent))} · ВОПРОС ${q.number}</span><span>${escape(q.category || q.section || 'Основы права')}</span></div><h2>${escape(q.question)}</h2><div class="review-answer wrong-review"><span>×</span><div><small>${questionMode(q) === 'oral' ? 'Устный вопрос' : 'Выбранный ответ'}</small><p>${questionMode(q) === 'oral' ? 'Проверяющий не засчитал устный ответ.' : escape(r.selectedAnswer)}</p></div></div><div class="review-answer correct-review"><span>✓</span><div><small>Правильный ответ</small><p>${escape(q.correctAnswer)}</p></div></div></article>` }).join('') : `<div class="empty-review"><span aria-hidden="true">✓</span><h2>${errors.length ? 'У этого участника нет ошибок' : 'Все ответы верные'}</h2><p>${errors.length ? 'Можно посмотреть ошибки другого участника.' : 'Отличная работа. Все вопросы пройдены правильно.'}</p></div>`}</div></section>`;
}
function openRules() {
  modal.innerHTML = `<div class="dialog-kicker">ПОРЯДОК ПРОВЕДЕНИЯ</div><h2 id="modal-title">Диалог, в котором есть ответ</h2><ol><li>Участники по очереди читают друг другу вопросы. Первой вопрос задаёт ${escape(data ? shortName(playerIds()[0]) : 'Еркеназ')}.</li><li>В вопросах с вариантами выберите один ответ. В устных — сначала ответьте вслух, затем нажмите «Показать ответ» и оцените ответ кнопкой «Верно +1» или «Неверно». Верный ответ приносит 1 балл отвечающему.</li><li>Обсудите результат и переходите к следующему вопросу.</li><li>В конце сравните результаты и разберите ошибки.</li></ol>${isDemo ? '<p class="rules-demo">Сейчас доступна демонстрация: по 3 вопроса об интерфейсе каждому участнику.</p>' : ''}<div class="dialog-actions"><button class="button primary" data-action="close-modal">Всё понятно →</button></div>`;
  modal.showModal();
}
function restartDialog() {
  modal.innerHTML = '<div class="dialog-kicker">НОВАЯ ПОПЫТКА</div><h2 id="modal-title">Начать проверку заново?</h2><p>Счёт, ответы и прогресс обоих участников будут сброшены. Восстановить эту попытку не получится.</p><div class="dialog-actions"><button class="button" data-action="close-modal" autofocus>Отмена</button><button class="button primary" data-action="confirm-restart">Начать заново</button></div>';
  modal.showModal();
}
const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
function setPageChromeInactive(inactive) {
  document.querySelectorAll('.site-header, .site-footer, #notice').forEach(element => { element.inert = inactive; });
}
function cancelCountdown() {
  countdownRun += 1;
  countdownActive = false;
  document.body.classList.remove('countdown-active');
  setPageChromeInactive(false);
}
function renderCountdown(value) {
  const firstQuestion = turns[0];
  const cue = { 3: 'Приготовьтесь', 2: 'Сосредоточьтесь', 1: 'Начинаем' }[value];
  const completed = 3 - value;
  screen = 'countdown';
  app.innerHTML = `<section class="countdown-screen" aria-live="assertive" aria-atomic="true" aria-label="До начала викторины ${value}">
    <div class="countdown-rays" aria-hidden="true"></div>
    <div class="countdown-frame">
      <div class="countdown-kicker"><span></span> ОСНОВЫ ПРАВА · ПАРНАЯ РАБОТА <span></span></div>
      <div class="countdown-heading"><span>ВИКТОРИНА НАЧИНАЕТСЯ</span><strong>Через несколько мгновений</strong></div>
      <div class="countdown-dial" aria-hidden="true">
        <svg viewBox="0 0 240 240" focusable="false"><circle class="countdown-track" cx="120" cy="120" r="108"></circle><circle class="countdown-progress" cx="120" cy="120" r="108"></circle></svg>
        <div class="countdown-orbit countdown-orbit-outer"></div><div class="countdown-orbit countdown-orbit-inner"></div>
        <div class="countdown-center"><span class="countdown-number">${value}</span><span class="countdown-scales">⚖</span></div>
      </div>
      <p class="countdown-cue">${cue}</p>
      <div class="countdown-handoff">
        <span><small>ЗАДАЁТ ПЕРВЫЙ ВОПРОС</small>${escape(name(firstQuestion.reader))}</span>
        <b aria-hidden="true">→</b>
        <span><small>ОТВЕЧАЕТ</small>${escape(name(firstQuestion.respondent))}</span>
      </div>
      <div class="countdown-steps" aria-hidden="true">${[0, 1, 2].map(index => `<i class="${index < completed ? 'is-complete' : index === completed ? 'is-current' : ''}"></i>`).join('')}</div>
      <p class="countdown-note"><span aria-hidden="true">◇</span> Первый вопрос откроется автоматически</p>
    </div>
  </section>`;
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
async function start() {
  if (countdownActive) return;
  notice('');
  session = newSession(turns, bankId);
  persist();
  const run = ++countdownRun;
  countdownActive = true;
  document.body.classList.add('countdown-active');
  setPageChromeInactive(true);
  for (let value = 3; value >= 1; value -= 1) {
    if (run !== countdownRun) return;
    renderCountdown(value);
    await wait(1000);
  }
  if (run !== countdownRun) return;
  countdownActive = false;
  document.body.classList.remove('countdown-active');
  setPageChromeInactive(false);
  show('game');
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (target.tagName === 'A') event.preventDefault();
  if (action === 'rules') { openRules(); return; }
  if (action === 'close-modal') { modal.close(); return; }
  if (!data) return;
  if (action === 'home') show('home');
  if (action === 'start') start();
  if (action === 'resume') show(session.status === 'completed' ? 'results' : 'game');
  if (action === 'restart') restartDialog();
  if (action === 'confirm-restart') { modal.close(); start(); }
  if (action === 'answer' && screen === 'game') {
    const selected = session.optionOrders[session.cursor][Number(target.dataset.option)];
    if (answer(session, turns, selected)) refreshAfterAction(session.responses[session.cursor].correct, '[data-action="next"]');
  }
  if (action === 'reveal-oral' && screen === 'game' && revealOral(session, turns)) refreshAfterAction(false, '[data-action="grade-oral"]');
  if (action === 'grade-oral' && screen === 'game' && gradeOral(session, turns, target.dataset.correct === 'true')) refreshAfterAction(session.responses[session.cursor].correct, '[data-action="next"]');
  if (action === 'next' && screen === 'game' && advance(session, turns)) { persist(); show(session.status === 'completed' ? 'results' : 'game'); }
  if (action === 'review' && session?.status === 'completed') { filter = 'all'; show('review'); }
  if (action === 'results' && session?.status === 'completed') show('results');
  if (action === 'filter' && screen === 'review') { filter = target.dataset.filter; renderReview(); app.querySelector(`[data-filter="${filter}"]`).focus({ preventScroll: true }); }
});
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || modal.open || screen !== 'game' || !/^[1-4]$/.test(event.key)) return;
  const button = app.querySelector(`[data-option="${Number(event.key) - 1}"]`);
  if (button && !button.disabled) { event.preventDefault(); button.click(); }
});
modal.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close(); } });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || !data) return;
  const restored = restoreSession(event.newValue, turns, bankId);
  session = restored.session;
  if (modal.open) modal.close();
  notice(restored.reason || 'Прогресс изменён в другой вкладке. Здесь показана актуальная попытка.');
  show('home');
});
async function init() {
  try {
    const response = await fetch('./questions.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Не удалось загрузить questions.json. Проверьте, что файл находится рядом с index.html.');
    data = validateBank(await response.json());
    isDemo = playerIds().every(id => bankFor(id).length === 0);
    if (isDemo) {
      const { demoQuestionSets } = await import('./demoQuestions.js');
      data = { ...data, questionSets: Object.fromEntries(data.players.map((p, i) => [questionSetKey(p.id), demoQuestionSets[i === 0 ? 'forPlayer1' : 'forPlayer2'].map(q => ({ ...q, respondent: p.id, reader: data.players[1 - i].id }))])) };
      validateBank(data);
    }
    turns = makeTurns(data.questionSets, data.players);
    bankId = fingerprint({ players: data.players, questionSets: data.questionSets, isDemo });
    try { const restored = restoreSession(localStorage.getItem(STORAGE_KEY), turns, bankId); session = restored.session; if (restored.reason) notice(restored.reason); }
    catch { storageAvailable = false; notice('Сохранение недоступно в этом браузере. Прогресс будет доступен до обновления страницы.'); }
    show('home', false);
    registerWebMCP();
  } catch (error) {
    app.innerHTML = `<section class="loading-error"><div class="eyebrow">БАНК ВОПРОСОВ</div><h1>Викторина пока недоступна</h1><p>${escape(location.protocol === 'file:' ? 'Запустите сайт локально командой npm start, затем откройте http://127.0.0.1:4173. Загрузка JSON требует локального веб-сервера.' : error.message)}</p><button class="button primary" onclick="location.reload()">Попробовать снова</button></section>`;
  }
}
function registerWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  try { Promise.resolve(context.registerTool({ name: 'get_quiz_progress', title: 'Прогресс викторины', description: 'Read the quiz mode, current screen and participant progress. Does not reveal unanswered questions or correct answers.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: async (input) => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.'); return { mode: isDemo ? 'demo' : 'real', screen, players: data.players, progress: session ? summarize(session, turns) : null, currentTurn: session ? session.cursor + 1 : null, totalTurns: turns.length }; } }, { signal: lifecycle.signal })).catch(() => { }); } catch { /* Optional browser API. */ }
}
init();
