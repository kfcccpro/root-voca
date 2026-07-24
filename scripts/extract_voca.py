import fitz, re, json, csv, collections, math
pdf='/mnt/data/능률보카 어원편_260714_175558.pdf'
doc=fitz.open(pdf)
starts={1:18,2:24,3:30,4:36,5:42,6:49,7:55,8:60,9:67,10:73,11:82,12:91,13:98,14:108,15:114,16:120,17:127,18:134,19:140,20:146,21:153,22:159,23:166,24:173,25:179,26:186,27:193,28:200,29:207,30:213,31:220,32:225,33:231,34:237,35:241,36:247,37:252,38:258,39:264,40:270,41:276,42:282,43:288,44:294,45:300,46:308,47:314,48:320,49:325,50:330,51:337,52:343,53:349,54:355,55:361,56:368,57:374,58:381,59:388,60:395}
start_list=sorted(starts.items(),key=lambda kv:kv[1])
def day_for_page(p):
    d=1
    for dd,sp in start_list:
        if p>=sp: d=dd
        else: break
    return d

def clean(s):
    s=s.replace('\u00ad','').replace('\ufeff','')
    s=re.sub(r'\s+',' ',s).strip()
    return s

headwords=[]; roots=[]
for pno in range(18,403):
    page=doc[pno-1]
    day=day_for_page(pno)
    data=page.get_text('dict')
    for block in data['blocks']:
        if 'lines' not in block: continue
        for line in block['lines']:
            x0,y0,x1,y1=line['bbox']
            spans=line['spans']
            # headword: large HelveticaNeue spans (exclude footer DAY number)
            hwparts=[]
            for s in spans:
                if 16.5 <= s['size'] <= 18.5 and s['font'].startswith('HelveticaNeueLTStd'):
                    t=s['text']
                    # exclude only blank
                    if t.strip(): hwparts.append(t)
            if hwparts and x0 < 260 and y0 < 720:
                hw=clean(''.join(hwparts))
                hw=re.sub(r'\s+$','',hw)
                # remove isolated footer/day labels and obvious nonwords
                if re.search(r'[A-Za-z]', hw) and hw.upper()!='DAY':
                    # reject header-like DAY 11 etc or lines with more than 4 tokens
                    if not re.fullmatch(r'DAY\s*\d+', hw, re.I):
                        # normalize spaces around hyphen/slash only, keep phrases
                        headwords.append({'day':day,'page':pno,'word':hw,'x':round(x0,1),'y':round(y0,1)})
            # root/prefix headings using DBSans-Black 20+
            rparts=[]
            for s in spans:
                if s['font']=='DBSans-Black' and s['size']>=20:
                    if s['text'].strip(): rparts.append(s['text'])
            if rparts and x0<260 and y0<720:
                rt=clean(''.join(rparts))
                rt=re.sub(r'\s+',' ',rt).strip()
                if re.search(r'[A-Za-z]',rt):
                    roots.append({'day':day,'page':pno,'root':rt,'type':'prefix_or_root','x':round(x0,1),'y':round(y0,1)})
            # suffix unit headings
            sparts=[]
            for s in spans:
                if s['font']=='HelveticaLTStd-Bold' and 15 <= s['size'] <= 17:
                    if s['text'].strip(): sparts.append(s['text'])
            if sparts and 82<=pno<=107 and x0<115 and y0<720:
                rt=clean(''.join(sparts))
                if rt.startswith('-'):
                    roots.append({'day':day,'page':pno,'root':rt,'type':'suffix','x':round(x0,1),'y':round(y0,1)})

# exact dedupe by page/y/word/root due occasional block duplicates
seen=set(); hw2=[]
for r in headwords:
    k=(r['page'],round(r['y'],1),r['word'])
    if k not in seen:
        seen.add(k); hw2.append(r)
headwords=hw2
seen=set(); rt2=[]
for r in roots:
    k=(r['page'],round(r['y'],1),r['root'])
    if k not in seen:
        seen.add(k); rt2.append(r)
roots=rt2

# save
for fn, rows, fields in [('/mnt/data/headwords.csv',headwords,['day','page','word','x','y']),('/mnt/data/roots.csv',roots,['day','page','root','type','x','y'])]:
    with open(fn,'w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)

print('headword entries',len(headwords),'unique',len(set(r['word'].lower() for r in headwords)))
print('roots',len(roots),'unique',len(set(r['root'].lower() for r in roots)))
print('\nCounts per day:')
for d in range(1,61):
    h=[r for r in headwords if r['day']==d]; rr=[r for r in roots if r['day']==d]
    print(f'{d:02d}: roots {len(rr):2d}, words {len(h):2d}')
print('\nFirst roots',roots[:30])
print('\nSuspicious headwords:')
for r in headwords:
    w=r['word']
    if len(w)>28 or re.search(r'[^A-Za-z0-9\-\' /().]',w) or len(w.split())>3:
        print(r)
