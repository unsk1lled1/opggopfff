import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,makeTurns,fingerprint,newSession,answer,advance,summarize,snapshot,restoreSession} from '../engine.js';
import {demoQuestionSets} from '../demoQuestions.js';
const players = [{id:'player1',name:'Первый'},{id:'player2',name:'Второй'}];
const bank = {players,questionSets:demoQuestionSets};
const turns = makeTurns(demoQuestionSets);
const id = fingerprint(bank);
test('production bank is valid; demo is isolated', async()=>{
  const real=JSON.parse(await readFile(new URL('../questions.json',import.meta.url),'utf8'));
  validateBank(real);
  assert.notEqual(real.questionSets,demoQuestionSets);
  assert.equal(turns.length,6);
});
test('respondents alternate starting with player2',()=>{
  validateBank(bank);
  assert.deepEqual(turns.map(q=>q.respondent),['player2','player1','player2','player1','player2','player1']);
  assert.deepEqual(turns.map(q=>q.number),[1,1,2,2,3,3]);
});
test('no skipping, invalid answers or repeated scoring',()=>{
  const s=newSession(turns,id);
  assert.equal(advance(s,turns),false);
  assert.equal(answer(s,turns,'invalid'),false);
  assert.equal(answer(s,turns,turns[0].correctAnswer),true);
  assert.equal(answer(s,turns,turns[0].correctAnswer),false);
  assert.equal(summarize(s,turns).player2.correct,1);
  assert.equal(s.cursor,0);
  advance(s,turns);assert.equal(s.cursor,1);
});
test('answered question and shuffle survive reload without duplicate score',()=>{
  const s=newSession(turns,id);answer(s,turns,turns[0].correctAnswer);
  const restored=restoreSession(JSON.stringify(snapshot(s,turns)),turns,id).session;
  assert.deepEqual(restored.optionOrders,s.optionOrders);
  assert.equal(restored.responses[0].correct,true);
  assert.equal(answer(restored,turns,turns[0].correctAnswer),false);
  assert.equal(advance(restored,turns),true);
});
test('wrong answers, results and completed reload',()=>{
  const s=newSession(turns,id);
  for (const q of turns) {answer(s,turns,q.respondent==='player1'?q.correctAnswer:q.options.find(o=>o!==q.correctAnswer));advance(s,turns);}
  assert.equal(s.status,'completed');
  const stats=summarize(s,turns);
  assert.equal(stats.player1.percent,100);assert.equal(stats.player2.wrong,3);
  assert.equal(snapshot(s,turns).errors.length,3);
  assert.equal(restoreSession(JSON.stringify(s),turns,id).session.status,'completed');
  assert.equal(advance(s,turns),false);assert.equal(answer(s,turns,turns.at(-1).correctAnswer),false);
});
test('100 synthetic turns finish exactly at 50 points each, with no production data generated',()=>{
  const sets={};
  for (const p of [1,2]) sets[`forPlayer${p}`]=Array.from({length:50},(_,i)=>({...demoQuestionSets[`forPlayer${p}`][0],id:`fixture-${p}-${i}`,number:i+1}));
  validateBank({players,questionSets:sets});
  const all=makeTurns(sets);const s=newSession(all,'fixture');
  for(let i=0;i<100;i++){assert.equal(s.cursor,i);assert.equal(all[i].respondent,i%2?'player1':'player2');answer(s,all,all[i].correctAnswer);advance(s,all);if(i<99)assert.equal(s.status,'active');}
  assert.equal(s.status,'completed');assert.equal(s.responses.length,100);
  assert.equal(summarize(s,all).player1.correct,50);assert.equal(summarize(s,all).player2.correct,50);
});
test('changed and corrupted saves cannot contaminate a new bank',()=>{
  assert.equal(restoreSession('{bad',turns,id).session,null);
  const s=newSession(turns,id);answer(s,turns,turns[0].correctAnswer);
  assert.equal(restoreSession(JSON.stringify(s),turns,'new-bank').session,null);
  s.responses[0].correct=false;
  assert.equal(restoreSession(JSON.stringify(s),turns,id).session,null);
});
test('invalid real data is rejected instead of silently using demo',()=>{
  const copy=structuredClone(bank);copy.questionSets.forPlayer1[0].correctAnswer='missing';assert.throws(()=>validateBank(copy),/correctAnswer/);
  const empty=structuredClone(bank);empty.questionSets.forPlayer1=[];assert.throws(()=>validateBank(empty),/оба банка/);
  const dup=structuredClone(bank);dup.questionSets.forPlayer1[0].options[1]=dup.questionSets.forPlayer1[0].options[0];assert.throws(()=>validateBank(dup),/четыре разных/);
});
