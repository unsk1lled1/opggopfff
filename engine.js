export const STORAGE_KEY = 'osnovy-prava.quiz.v1';
export const questionMode = q => q.mode ?? 'choice';
export const questionSetKey = id => `for${id[0].toUpperCase()}${id.slice(1)}`;
export const correctChoice = q => Number.isInteger(q.correctIndex) ? q.options[q.correctIndex] : q.correctAnswer;
export function validateBank(data) {
  if (!data || !Array.isArray(data.players) || data.players.length !== 2 || data.players.some(p => !p || typeof p.id !== 'string' || !/^[a-z][a-zA-Z0-9_-]*$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim()) || new Set(data.players.map(p=>p.id)).size !== 2) throw new Error('В players нужны два участника с разными id и непустыми именами.');
  const sets = data.questionSets;
  const keys = data.players.map(p=>questionSetKey(p.id));
  if (!sets || Object.keys(sets).length !== 2 || keys.some(key=>!Array.isArray(sets[key]))) throw new Error(`В questionSets нужны массивы ${keys.join(' и ')}.`);
  const ids = new Set();
  for (const [playerIndex, player] of data.players.entries()) {
    const key = keys[playerIndex], respondent = player.id, reader = data.players[1-playerIndex].id;
    sets[key].forEach((q, i) => {
      const label = `${key}, вопрос ${i + 1}`;
      if (!q || typeof q.id !== 'string' || !q.id.trim() || ids.has(q.id)) throw new Error(`${label}: нужен уникальный id.`);
      ids.add(q.id);
      if (q.number !== i + 1 || q.respondent !== respondent || q.reader !== reader) throw new Error(`${label}: проверьте number, reader и respondent.`);
      if (typeof q.question !== 'string' || !q.question.trim()) throw new Error(`${label}: не заполнен текст.`);
      if (!['choice','oral'].includes(questionMode(q))) throw new Error(`${label}: mode должен быть choice или oral.`);
      if (typeof q.correctAnswer !== 'string' || !q.correctAnswer.trim()) throw new Error(`${label}: заполните correctAnswer.`);
      if (questionMode(q) === 'choice') {
        if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim()) || new Set(q.options.map(o => o.trim().toLocaleLowerCase('ru'))).size !== 4) throw new Error(`${label}: нужны четыре разных непустых ответа.`);
        if (!q.options.includes(q.correctAnswer)) throw new Error(`${label}: correctAnswer должен точно совпадать с одним вариантом.`);
        if (q.correctIndex !== undefined && (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3 || q.options[q.correctIndex] !== q.correctAnswer)) throw new Error(`${label}: correctIndex должен указывать на correctAnswer (индекс от 0 до 3).`);
      } else if ((q.options !== undefined && (!Array.isArray(q.options) || q.options.length)) || q.correctIndex !== undefined) throw new Error(`${label}: у устного вопроса нет вариантов и correctIndex.`);
      if (['section','category'].some(k => q[k] !== undefined && typeof q[k] !== 'string')) throw new Error(`${label}: section и category должны быть строками.`);
    });
  }
  if ((sets[keys[0]].length === 0) !== (sets[keys[1]].length === 0)) throw new Error('Заполните оба банка вопросов. Демо доступно, только когда оба банка пусты.');
  return data;
}
export function makeTurns(sets, players = [{id:'player1'},{id:'player2'}]) {
  const turns = [];
  const [first, second] = players.map(p=>sets[questionSetKey(p.id)]);
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    if (second[i]) turns.push(second[i]);
    if (first[i]) turns.push(first[i]);
  }
  return turns;
}
export function fingerprint(data) {
  const text = JSON.stringify(data); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `v2-${(hash >>> 0).toString(16)}-${text.length}`;
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];}
  return result;
}
export function newSession(turns, bankId) {
  return {version:2, bankId, cursor:0, status:'active', responses:[], revealedQuestionIds:[], optionOrders:turns.map(q => questionMode(q)==='oral' ? [] : Number.isInteger(q.correctIndex) ? [...q.options] : shuffle(q.options)), startedAt:new Date().toISOString()};
}
const canRespond = (session, q) => Boolean(q && session.status === 'active' && session.responses.length === session.cursor);
export function answer(session, turns, selectedAnswer) {
  const q = turns[session.cursor];
  if (!canRespond(session,q) || questionMode(q)!=='choice' || !q.options.includes(selectedAnswer)) return false;
  session.responses.push({questionId:q.id, respondent:q.respondent, mode:'choice', selectedAnswer, correct:selectedAnswer === correctChoice(q)});
  return true;
}
export function revealOral(session, turns) {
  const q = turns[session.cursor];
  if (!canRespond(session,q) || questionMode(q)!=='oral' || session.revealedQuestionIds.includes(q.id)) return false;
  session.revealedQuestionIds.push(q.id);
  return true;
}
export function gradeOral(session, turns, correct) {
  const q = turns[session.cursor];
  if (!canRespond(session,q) || questionMode(q)!=='oral' || !session.revealedQuestionIds.includes(q.id) || typeof correct !== 'boolean') return false;
  session.responses.push({questionId:q.id, respondent:q.respondent, mode:'oral', selectedAnswer:null, correct, gradedBy:q.reader});
  return true;
}
export function advance(session, turns) {
  if (session.status !== 'active' || session.responses.length !== session.cursor + 1) return false;
  if (session.cursor === turns.length - 1) session.status = 'completed'; else session.cursor++;
  return true;
}
export function summarize(session, turns) {
  return Object.fromEntries([...new Set(turns.map(q=>q.respondent))].map(id => {
    const responses = session.responses.filter(r => r.respondent === id);
    const correct = responses.filter(r => r.correct).length;
    const total = turns.filter(q => q.respondent === id).length;
    return [id,{correct, wrong:responses.length-correct, answered:responses.length, total, percent:total ? Math.round(correct/total*100) : 0}];
  }));
}
export function snapshot(session, turns) {
  return {...session, scores:summarize(session, turns), errors:session.responses.filter(r => !r.correct).map(r => r.questionId), activeParticipant:session.status === 'completed' ? null : turns[session.cursor].respondent};
}
export function restoreSession(raw, turns, bankId) {
  if (!raw) return {session:null, reason:null};
  try {
    const s = JSON.parse(raw);
    if (s.bankId !== bankId) return {session:null, reason:'Банк вопросов обновлён. Доступна новая викторина.'};
    if (s.version !== 2 || !['active','completed'].includes(s.status) || !Number.isInteger(s.cursor) || s.cursor < 0 || s.cursor >= turns.length || !Array.isArray(s.responses) || !Array.isArray(s.optionOrders) || s.optionOrders.length !== turns.length || !Array.isArray(s.revealedQuestionIds) || new Set(s.revealedQuestionIds).size !== s.revealedQuestionIds.length) throw new Error();
    if (s.status === 'completed' ? s.responses.length !== turns.length || s.cursor !== turns.length-1 : ![s.cursor,s.cursor+1].includes(s.responses.length)) throw new Error();
    turns.forEach((q,i) => {
      const order = s.optionOrders[i];
      if (!Array.isArray(order)) throw new Error();
      if (questionMode(q)==='oral') {if(order.length)throw new Error();}
      else {
        if (order.length !== 4 || new Set(order).size !== 4 || order.some(o => !q.options.includes(o))) throw new Error();
        if (Number.isInteger(q.correctIndex) && order.some((o,j)=>o!==q.options[j])) throw new Error();
      }
    });
    s.revealedQuestionIds.forEach(id => {
      const index = turns.findIndex(q=>q.id===id);
      if(index<0 || index>s.cursor || questionMode(turns[index])!=='oral')throw new Error();
    });
    s.responses.forEach((r,i) => {
      const q = turns[i];
      if (r.questionId !== q.id || r.respondent !== q.respondent || r.mode !== questionMode(q) || typeof r.correct !== 'boolean') throw new Error();
      if (questionMode(q)==='oral') {
        if (r.selectedAnswer !== null || r.gradedBy !== q.reader || !s.revealedQuestionIds.includes(q.id)) throw new Error();
      } else if (!q.options.includes(r.selectedAnswer) || r.correct !== (r.selectedAnswer === correctChoice(q))) throw new Error();
    });
    return {session:s, reason:null};
  } catch {return {session:null, reason:'Сохранённый прогресс повреждён. Можно начать новую викторину.'};}
}
