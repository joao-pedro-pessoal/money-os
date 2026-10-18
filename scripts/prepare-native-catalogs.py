"""Keep Android resources and offline copy in the same reviewed static catalogs."""
from pathlib import Path
import json,re,html,sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent.parent
main=ROOT/'android-shell/app/src/main'
source_path=ROOT/'.local-checkpoints/i18n/full-source.json'
source=json.loads(source_path.read_text(encoding='utf-8'))
resources={n.attrib['name']:n.text or '' for n in ET.parse(main/'res/values/strings.xml').getroot()}
resources.update(widget_description='Record an expense or income',widget_expense='− Expense',widget_income='+ Income',shortcut_expense='Expense',shortcut_expense_long='Record expense',shortcut_income='Income',shortcut_income_long='Record income')
for file in [main/'AndroidManifest.xml', *sorted((main/'res/layout').glob('*.xml'))]:
    text=file.read_text(encoding='utf-8')
    def replace(match):
        value=html.unescape(match[2])
        if value.startswith('@') or not re.search('[a-zA-Z]',value): return match[0]
        key='ui_'+re.sub('[^a-z0-9]+','_',value.lower()).strip('_')
        resources[key]=value
        return match[1]+'"@string/'+key+'"'
    text=re.sub(r'(android:(?:label|contentDescription)=)"([^"\n]+)"',replace,text)
    file.write_text(text,encoding='utf-8')
native=set(resources.values())
for file in (main/'java').rglob('*.java'):
    text=file.read_text(encoding='utf-8')
    for match in re.finditer(r'LocalText\.text\([^,]+,\s*("(?:[^"\\]|\\.)*")\)',text): native.add(json.loads(match[1]))
native.update(['Money OS','Net worth','Where the money is','Cash flow','Investments','Allocation','Winners & losers','Dividends','Open trades','Long','Short'])
offline=['No connection',"Your device can't reach the server right now. Nothing has been lost — this app keeps no figures on your phone, so there is simply nothing to show until it can read them again.",'If you run Money OS on your own machine, check it is switched on and that you are on the same network.','Try again']
for value in native|set(offline): source[value]=value
source_path.write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Save the English resource definitions even in collect mode, so subsequent runs are reproducible.
def xml(values):
    return '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'+''.join('    <string name="'+key+'" formatted="false">'+html.escape(value,quote=False).replace("'", "\\'").replace('"','\\"')+'</string>\n' for key,value in values.items())+'</resources>\n'
(main/'res/values/strings.xml').write_text(xml(resources),encoding='utf-8')
if '--collect' in sys.argv: sys.exit(0)
offline_catalogs={}
for file in sorted((ROOT/'src/lib/i18n/full').glob('*.json')):
    lang=file.stem;catalog=json.loads(file.read_text(encoding='utf-8'))
    missing=(native|set(offline))-catalog.keys()
    if missing: raise ValueError(f'{lang}: missing {len(missing)} messages')
    target=main/'assets/i18n'/file.name;target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps({s:catalog[s] for s in sorted(native)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if lang!='en':
        folder=main/'res'/('values-'+('zh-rCN' if lang=='zh-CN' else lang));folder.mkdir(exist_ok=True)
        (folder/'strings.xml').write_text(xml({key:catalog[value] for key,value in resources.items()}),encoding='utf-8')
    offline_catalogs[lang]=[catalog[s] for s in offline]
file=ROOT/'public/offline.html';text=file.read_text(encoding='utf-8')
text=re.sub(r'\s*<!-- i18n:start -->[\s\S]*?<!-- i18n:end -->','',text)
payload=json.dumps(offline_catalogs,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
script='\n    <!-- i18n:start --><script>\n(function(){var catalogs='+payload+';var lang="en";try{lang=localStorage.getItem("moneyos_language")||"en";}catch(e){}var words=catalogs[lang]||catalogs.en;document.documentElement.lang=catalogs[lang]?lang:"en";document.documentElement.dir=lang==="ar"?"rtl":"ltr";["h1","p:nth-of-type(1)","p:nth-of-type(2)","button"].forEach(function(selector,i){document.querySelector(selector).textContent=words[i];});document.title="Money OS — "+words[0];})();\n</script><!-- i18n:end -->\n'
file.write_text(text.replace('  </body>',script+'  </body>'),encoding='utf-8')
print('Android resources, native copy and offline page generated for 15 languages')
