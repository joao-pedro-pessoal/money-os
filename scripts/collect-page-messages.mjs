import ts from 'typescript';import fs from 'node:fs';import path from 'node:path';
const source=JSON.parse(fs.readFileSync(fs.existsSync('.local-checkpoints/i18n/full-source.json') ? '.local-checkpoints/i18n/full-source.json' : 'src/lib/i18n/full/en.json','utf8'));
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['__tests__','i18n','legal'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(p))files.push(p);}}walk('src');
const raw=[];const expressions=[];
const add=s=>{if(/[A-Za-z]/.test(s)&&!/^https?:|^var\(--/.test(s))source[s]=s;};
function literal(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;if(ts.isTemplateExpression(n)){let s=n.head.text;n.templateSpans.forEach((span,i)=>s+=`{${i}}`+span.literal.text);return s;}return null;}
for(const file of files){const content=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
function visit(n){
 if (/src[\\/]lib[\\/](?:portfolio|trading|reports|alerts|library|widgets)[\\/]|src[\\/]components[\\/]library[\\/]labels/.test(file) && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && !ts.isImportDeclaration(n.parent)) {
   const value=literal(n);
   if(value && (/^[A-Z][a-z]/.test(value) || /[a-z] [a-z]/i.test(value)) && !/^https?:|^\.?\.?\//.test(value)) add(value);
 }
 if(ts.isJsxText(n)&&/[A-Za-z]/.test(n.text))raw.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart()).line+1,text:n.text.trim()});
 if(ts.isJsxExpression(n)&&n.expression&&!ts.isJsxAttribute(n.parent)){const v=n.expression.getText(ast);if(!v.includes('uiText(')&&!v.includes('=>')&&/label|Label|\.title|\.detail|\.message|\.reason|\.hint|\.help|\.description|periodName|reportName|dayName|monthName/.test(v))expressions.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart()).line+1,text:v});}
 if(ts.isPropertyAssignment(n)&&/^(label|title|subtitle|description|hint|help|text|note|message|detail|reason|summary|explanation|name)$/.test(n.name.getText(ast).replace(/["']/g,''))){const value=literal(n.initializer);if(value)add(value);}
 if(ts.isNewExpression(n)&&n.expression.getText(ast)==='Error'&&n.arguments?.[0]){const value=literal(n.arguments[0]);if(value)add(value);}
 if(ts.isCallExpression(n)&&['uiText','t'].includes(n.expression.getText(ast))&&n.arguments[0]){const value=literal(n.arguments[0]);if(value)add(value);}
 if(ts.isStringLiteral(n)&&n.parent&&ts.isJsxAttribute(n.parent)&&/^(title|label|placeholder|aria-label|data-label|description|summary|hint|lede|eyebrow)$/.test(n.parent.name.text))add(n.text);
 ts.forEachChild(n,visit);
}visit(ast);}
const manifest=JSON.parse(fs.readFileSync('src/lib/pwa/manifest.json','utf8'));
add(manifest.description);for(const shortcut of manifest.shortcuts){add(shortcut.name);if(shortcut.short_name)add(shortcut.short_name);add(shortcut.description);}
for(let month=0;month<12;month++)for(const format of ['long','short']){const name=new Intl.DateTimeFormat('en-GB',{month:format,timeZone:'UTC'}).format(new Date(Date.UTC(2026,month,1)));add(name);add(name+' {0}');}
for(const word of ['weekly','monthly','annual','custom','week','month','year','period','weeks','months','years','periods','Long','Short','long','short','over','near','ok','new','Simple','Complex'])add(word);
fs.mkdirSync('.local-checkpoints/i18n',{recursive:true});
fs.writeFileSync('.local-checkpoints/i18n/full-source.json',JSON.stringify(source,null,2)+'\n');
fs.writeFileSync('.local-checkpoints/i18n/untranslated.json',JSON.stringify({raw,expressions},null,2));
console.log(JSON.stringify({messages:Object.keys(source).length,raw:raw.length,expressions:expressions.length}));
