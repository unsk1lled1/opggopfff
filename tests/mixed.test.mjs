import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,makeTurns,fingerprint,newSession,answer,revealOral,gradeOral,advance,summarize,snapshot,restoreSession,questionMode} from '../engine.js';
const bank=JSON.parse(await readFile(new URL('../questions.json',import.meta.url),'utf8'));
const turns=makeTurns(validateBank(bank).questionSets,bank.players);
const id=fingerprint(bank);
const roundTrip=s=>restoreSession(JSON.stringify(snapshot(s,turns)),turns,id).session;
function reachFirstOral(){const s=newSession(turns,id);while(questionMode(turns[s.cursor])!=='oral'){answer(s,turns,turns[s.cursor].correctAnswer);advance(s,turns);}return s;}

test('supplied bank contains 50 per player, 75 choice and 25 oral',()=>{
  assert.deepEqual(bank.players.map(p=>p.id),['erkenaz','alsu']);
  assert.deepEqual(Object.values(bank.questionSets).map(qs=>qs.length),[50,50]);
  assert.equal(turns.length,100);
  assert.equal(turns.filter(q=>q.mode==='choice').length,75);
  assert.equal(turns.filter(q=>q.mode==='oral').length,25);
});
test('indexed choices preserve original order through start and reload',()=>{
  for(let n=0;n<3;n++){
    const s=roundTrip(newSession(turns,id));
    turns.forEach((q,i)=>assert.deepEqual(s.optionOrders[i],q.mode==='oral'?[]:q.options));
  }
});
test('oral requires reveal and explicit grade; reveal does not award points',()=>{
  const s=reachFirstOral(),q=turns[s.cursor],before=summarize(s,turns);
  assert.equal(gradeOral(s,turns,true),false);
  assert.equal(answer(s,turns,q.correctAnswer),false);
  assert.equal(advance(s,turns),false);
  assert.equal(revealOral(s,turns),true);
  assert.equal(revealOral(s,turns),false);
  assert.deepEqual(summarize(s,turns),before);
  assert.equal(advance(s,turns),false);
  assert.equal(gradeOral(s,turns,'true'),false);
});
test('reload between reveal and grade keeps reveal and permits exactly one point',()=>{
  let s=reachFirstOral();const q=turns[s.cursor];
  revealOral(s,turns);s=roundTrip(s);
  assert.ok(s.revealedQuestionIds.includes(q.id));
  const before=summarize(s,turns)[q.respondent].correct;
  assert.equal(gradeOral(s,turns,true),true);
  assert.equal(gradeOral(s,turns,true),false);
  assert.equal(gradeOral(s,turns,false),false);
  assert.equal(summarize(s,turns)[q.respondent].correct,before+1);
  s=roundTrip(s);
  assert.equal(gradeOral(s,turns,true),false);
  assert.equal(s.responses.at(-1).gradedBy,q.reader);
  assert.equal(advance(s,turns),true);
});
test('oral wrong answers enter review data without fabricated selected text',()=>{
  const s=reachFirstOral(),q=turns[s.cursor];revealOral(s,turns);gradeOral(s,turns,false);
  assert.equal(s.responses.at(-1).selectedAnswer,null);
  assert.equal(s.responses.at(-1).mode,'oral');
  assert.equal(summarize(s,turns)[q.respondent].wrong,1);
  assert.ok(snapshot(s,turns).errors.includes(q.id));
  assert.equal(roundTrip(s).responses.at(-1).correct,false);
});
test('entire mixed bank finishes at 50 points each; all stages survive reload',()=>{
  let s=newSession(turns,id);
  for(let i=0;i<100;i++){
    const q=turns[i];assert.equal(q.respondent,i%2?'erkenaz':'alsu');
    if(q.mode==='oral'){revealOral(s,turns);s=roundTrip(s);gradeOral(s,turns,true);}
    else answer(s,turns,q.options[q.correctIndex]);
    s=roundTrip(s);advance(s,turns);s=roundTrip(s);
  }
  assert.equal(s.status,'completed');assert.equal(summarize(s,turns).erkenaz.correct,50);assert.equal(summarize(s,turns).alsu.correct,50);
});
test('reject inconsistent indexes, reordered saved choices and premature oral reveals',()=>{
  const copy=structuredClone(bank);copy.questionSets.forAlsu[0].correctIndex=(copy.questionSets.forAlsu[0].correctIndex+1)%4;
  assert.throws(()=>validateBank(copy),/correctIndex/);
  const s=newSession(turns,id);s.optionOrders[0].reverse();assert.equal(roundTrip(s),null);
  const premature=newSession(turns,id);premature.revealedQuestionIds.push(turns.find(q=>q.mode==='oral').id);assert.equal(roundTrip(premature),null);
});
