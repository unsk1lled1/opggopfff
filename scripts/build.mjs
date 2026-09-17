import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateBank} from '../engine.js';
const root = path.resolve(import.meta.dirname,'..');
const files = ['index.html','styles.css','game.css','oral.css','app.js','engine.js','questions.json','questions.schema.json'];
const bank = validateBank(JSON.parse(await fs.readFile(path.join(root,'questions.json'),'utf8')));
const questionCount = Object.values(bank.questionSets).reduce((sum,qs)=>sum+qs.length,0);
const demo = questionCount === 0;
if (demo) files.push('demoQuestions.js');
for (const file of files.filter(f=>f.endsWith('.js'))) execFileSync(process.execPath,['--check',path.join(root,file)]);
JSON.parse(await fs.readFile(path.join(root,'questions.schema.json'),'utf8'));
await fs.mkdir(path.join(root,'dist'),{recursive:true});
for (const file of files) await fs.copyFile(path.join(root,file),path.join(root,'dist',file));
// A fixed known file only; never recursively delete a computed directory.
if (!demo) await fs.rm(path.join(root,'dist','demoQuestions.js'),{force:true});
await fs.cp(path.join(root,'assets'),path.join(root,'dist','assets'),{recursive:true});
const html = await fs.readFile(path.join(root,'dist','index.html'),'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^(?:https?:|data:)/.test(match[1])) await fs.access(path.join(root,'dist',match[1]));
}
console.log(`Готово: dist; ${demo ? '6 демонстрационных вопросов' : questionCount+' вопросов'}.`);
