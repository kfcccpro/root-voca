import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'screenshots_v7'
OUT.mkdir(exist_ok=True)
INDEX = (ROOT / 'index.html').read_text(encoding='utf-8')
CSS = (ROOT / 'styles.css').read_text(encoding='utf-8')
APP = (ROOT / 'app.js').read_text(encoding='utf-8')
SCHEDULE = json.loads((ROOT / 'data' / 'voca_schedule.json').read_text(encoding='utf-8'))
CONTENT = json.loads((ROOT / 'data' / 'learning_units.json').read_text(encoding='utf-8'))
FIRST_WORD = CONTENT['units'][0]['words'][0]
FIRST_WORD_ID = str(FIRST_WORD['id'])
FIRST_WORD_TEXT = FIRST_WORD['word']
FIRST_MEANING = FIRST_WORD.get('quiz_meaning') or FIRST_WORD.get('meaning') or FIRST_WORD.get('meanings', [''])[0]

TEST_LOAD_DATA = """async function loadData() {
  runtime.schedule = window.__TEST_SCHEDULE__;
  runtime.content = window.__TEST_CONTENT__;
  runtime.content.units.forEach((unit) => runtime.unitMap.set(unit.id, unit));
  runtime.state = sanitizeState(loadState());
  persist('test_boot');
}"""
start = APP.index('async function loadData() {')
end = APP.index('\nfunction currentDayDef', start)
APP_TEST = (APP[:start] + TEST_LOAD_DATA + APP[end:]).replace('localStorage', 'window.__TEST_STORAGE__')

def base_state():
    return {
        'schemaVersion': 7,
        'dataVersion': '18day-root-integrated-360x1410-20260726-v7',
        'revision': 0,
        'updatedAt': None,
        'deviceId': 'test-device',
        'eventCounter': 0,
        'eventLog': [],
        'currentDay': 1,
        'completedDays': [],
        'settings': {
            'start':'19:30','end':'20:30','email':'sk01197375068@gmail.com',
            'autoMail':True,'shortenMastered':True,'blockMinutes':15,
            'preReviewLimit':8,'delayedReviewDailyLimit':15,'d3DailyLimit':8,
            'stableResponseMs':4000,'slowResponseMs':6000,
        },
        'mastery': {}, 'days': {}, 'spellingNotebook': {}, 'wrongHistory': {},
        'reviewSchedule': {}, 'pendingReports': [], 'sentReportIds': [],
        'sessions': [], 'sync': {'status':'local-safe','lastVerifiedAt':None,'error':''},
        'migrationNotice': ''
    }

def html_with_state(state=None):
    storage = {}
    if state is not None:
        storage['18dayRootStateV7'] = json.dumps(state, ensure_ascii=False)
    bootstrap = (
        '<script>'
        f'window.__TEST_DATA__={json.dumps(storage, ensure_ascii=False)};'
        'window.__TEST_STORAGE__={'
        'getItem:(k)=>Object.prototype.hasOwnProperty.call(window.__TEST_DATA__,k)?window.__TEST_DATA__[k]:null,'
        'setItem:(k,v)=>{window.__TEST_DATA__[k]=String(v)},'
        'removeItem:(k)=>{delete window.__TEST_DATA__[k]},'
        'clear:()=>{window.__TEST_DATA__={}}};'
        f'window.__TEST_SCHEDULE__={json.dumps(SCHEDULE, ensure_ascii=False)};'
        f'window.__TEST_CONTENT__={json.dumps(CONTENT, ensure_ascii=False)};'
        '</script>'
    )
    html = INDEX.replace('<link rel="stylesheet" href="styles.css">', f'<style>{CSS}</style>')
    return html.replace('<script src="app.js"></script>', bootstrap + f'<script>{APP_TEST}</script>')

async def new_page(context, state=None):
    page = await context.new_page()
    await page.set_content(html_with_state(state), wait_until='load')
    await page.wait_for_selector('#learnerHome:not(.hidden)')
    return page

async def responsive_checks(browser):
    for name, viewport in [
        ('pc', {'width':1440,'height':900}),
        ('tablet', {'width':820,'height':1180}),
        ('mobile', {'width':390,'height':844}),
        ('small', {'width':320,'height':720}),
    ]:
        ctx = await browser.new_context(viewport=viewport)
        page = await new_page(ctx, base_state())
        assert '18day_root' in await page.locator('#courseEyebrow').inner_text()
        assert await page.locator('.segment-step').count() == 4
        dims = await page.evaluate('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})')
        assert dims['sw'] <= dims['cw'] + 1, (name, dims)
        await page.screenshot(path=str(OUT / f'{name}_home.png'), full_page=True)
        await ctx.close()

async def wrong_and_immediate_recall(browser):
    ctx = await browser.new_context(viewport={'width':1280,'height':900})
    page = await new_page(ctx, base_state())
    await page.click('#startButton')
    await page.click('#answerArea button')
    await page.wait_for_timeout(1700)
    options = page.locator('.option-button')
    wrong = None
    for i in range(await options.count()):
        opt = options.nth(i)
        if await opt.get_attribute('data-option-value') != FIRST_MEANING:
            wrong = opt
            break
    assert wrong is not None
    await wrong.click()
    assert await page.locator('.wrong-compare-card').count() == 1
    compare_text = await page.locator('.wrong-compare-card').inner_text()
    assert '내 선택' in compare_text and '실제 정답' in compare_text
    saved = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV7'))")
    assert FIRST_WORD_ID in saved['wrongHistory']
    assert saved['reviewSchedule'][FIRST_WORD_ID]['stage'] == 'D1_DUE'
    assert saved['days']['1']['phase'] == 'review'
    assert saved['revision'] > 0 and len(saved['eventLog']) > 0
    await page.get_by_role('button', name='철자로 바로 각인').click()
    await page.fill('#spellingInput', FIRST_WORD_TEXT)
    await page.click('#checkSpelling')
    await page.wait_for_timeout(650)
    saved = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV7'))")
    assert saved['mastery'][FIRST_WORD_ID]['recall']['correct'] >= 1
    assert saved['days']['1']['wordIndex'] >= 1
    await page.screenshot(path=str(OUT / 'wrong_compare.png'), full_page=True)
    await ctx.close()

async def due_review_check(browser):
    state = base_state()
    today = '2026-07-26'
    state['wrongHistory'][FIRST_WORD_ID] = {
        'wordId':FIRST_WORD_ID,'firstWrongAt':today+'T00:00:00Z','lastWrongAt':today+'T00:00:00Z',
        'totalWrong':1,'wrongTypes':['MEANING'],'directions':{'recognition':1,'recall':0,'etymology':0,'context':0},
        'selectedAnswer':'x','correctAnswer':FIRST_MEANING,'lastResponseMs':5000,'status':'ACTIVE','reviewLog':[]
    }
    state['reviewSchedule'][FIRST_WORD_ID] = {
        'wordId':FIRST_WORD_ID,'originDate':'2026-07-25','stage':'D1_DUE','dueDate':'2026-07-26',
        'reason':['D0_WRONG'],'priority':8,'correctStreak':0,'retryCount':0,'status':'ACTIVE','lastResult':None,'updatedAt':today+'T00:00:00Z'
    }
    ctx = await browser.new_context(viewport={'width':1024,'height':900})
    page = await new_page(ctx, state)
    await page.add_init_script("Date.prototype.__x=1")
    # Force the date helper in this page to match the test due date.
    await page.evaluate("window.__testToday='2026-07-26'")
    # dueDate is already <= real current date in the execution environment; start normally.
    await page.click('#startButton')
    await page.wait_for_selector('.review-stage-badge')
    assert 'D+1' in await page.locator('.review-stage-badge').inner_text()
    correct_button = page.locator(f'.option-button[data-option-value="{FIRST_MEANING}"]')
    await correct_button.click()
    await page.wait_for_timeout(800)
    saved = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV7'))")
    assert saved['reviewSchedule'][FIRST_WORD_ID]['stage'] in ('D6_DUE','D3_DUE')
    assert saved['days']['1']['preReviewDate'] is not None
    await page.screenshot(path=str(OUT / 'd1_review.png'), full_page=True)
    await ctx.close()

async def mini_reward_check(browser):
    ctx = await browser.new_context(viewport={'width':900,'height':800})
    page = await new_page(ctx, base_state())
    await page.click('#startButton')
    await page.evaluate("enterMiniReward('word'); renderSessionStep();")
    assert await page.locator('.mini-reward-panel').count() == 1
    assert '6개 학습 완료' in await page.locator('.mini-reward-panel').inner_text()
    await page.screenshot(path=str(OUT / 'mini_reward.png'), full_page=True)
    await ctx.close()


async def d1_wrong_to_d3(browser):
    state = base_state()
    today = '2026-07-26'
    state['wrongHistory'][FIRST_WORD_ID] = {
        'wordId':FIRST_WORD_ID,'firstWrongAt':today+'T00:00:00Z','lastWrongAt':today+'T00:00:00Z',
        'totalWrong':1,'wrongTypes':['MEANING'],'directions':{'recognition':1,'recall':0,'etymology':0,'context':0},
        'selectedAnswer':'x','correctAnswer':FIRST_MEANING,'lastResponseMs':5000,'status':'ACTIVE','reviewLog':[]
    }
    state['reviewSchedule'][FIRST_WORD_ID] = {
        'wordId':FIRST_WORD_ID,'originDate':'2026-07-25','stage':'D1_DUE','dueDate':'2026-07-26',
        'reason':['D0_WRONG'],'priority':8,'correctStreak':0,'retryCount':0,'status':'ACTIVE','lastResult':None,'updatedAt':today+'T00:00:00Z'
    }
    ctx = await browser.new_context(viewport={'width':1024,'height':900})
    page = await new_page(ctx, state)
    await page.click('#startButton')
    await page.wait_for_selector('.review-stage-badge')
    options = page.locator('.option-button')
    wrong = None
    for i in range(await options.count()):
        opt = options.nth(i)
        if await opt.get_attribute('data-option-value') != FIRST_MEANING:
            wrong = opt
            break
    await wrong.click()
    assert await page.locator('.wrong-compare-card').count() == 1
    await page.get_by_role('button', name='철자로 바로 확인').click()
    await page.fill('#spacedInput', FIRST_WORD_TEXT)
    await page.click('#checkSpaced')
    await page.get_by_role('button', name='다음 기억 확인').click()
    await page.wait_for_timeout(200)
    saved = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV7'))")
    assert saved['reviewSchedule'][FIRST_WORD_ID]['stage'] == 'D3_DUE'
    await ctx.close()

async def d6_stabilization(browser):
    state = base_state()
    today = '2026-07-26'
    state['wrongHistory'][FIRST_WORD_ID] = {
        'wordId':FIRST_WORD_ID,'firstWrongAt':'2026-07-20T00:00:00Z','lastWrongAt':'2026-07-20T00:00:00Z',
        'totalWrong':1,'wrongTypes':['MEANING'],'directions':{'recognition':1,'recall':0,'etymology':0,'context':0},
        'status':'ACTIVE','reviewLog':[]
    }
    state['reviewSchedule'][FIRST_WORD_ID] = {
        'wordId':FIRST_WORD_ID,'originDate':'2026-07-20','stage':'D6_DUE','dueDate':today,
        'reason':['D3_CORRECT'],'priority':6,'correctStreak':0,'retryCount':0,'status':'ACTIVE','lastResult':None,'updatedAt':today+'T00:00:00Z'
    }
    ctx = await browser.new_context(viewport={'width':1024,'height':900})
    page = await new_page(ctx, state)
    await page.click('#startButton')
    await page.wait_for_selector('#spacedInput')
    assert 'D+6' in await page.locator('#stageBadge').inner_text()
    await page.fill('#spacedInput', FIRST_WORD_TEXT)
    await page.click('#checkSpaced')
    await page.get_by_role('button', name='다음 기억 확인').click()
    saved = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV7'))")
    assert saved['reviewSchedule'][FIRST_WORD_ID]['status'] == 'STABLE'
    assert saved['wrongHistory'][FIRST_WORD_ID]['status'] == 'STABLE'
    await ctx.close()

async def post_course_review(browser):
    state = base_state()
    state['currentDay'] = 18
    state['completedDays'] = list(range(1, 19))
    state['days'] = {'18': {'completedAt':'2026-07-25T12:00:00Z','completedBlocks':[0,1,2,3],'block':3,'phase':'root','elapsedSeconds':1000,'answers':{},'stats':{}}}
    state['wrongHistory'][FIRST_WORD_ID] = {'wordId':FIRST_WORD_ID,'totalWrong':1,'status':'ACTIVE','wrongTypes':['MEANING'],'directions':{},'reviewLog':[]}
    state['reviewSchedule'][FIRST_WORD_ID] = {'wordId':FIRST_WORD_ID,'originDate':'2026-07-20','stage':'D6_DUE','dueDate':'2026-07-26','reason':[],'priority':8,'correctStreak':0,'retryCount':0,'status':'ACTIVE'}
    ctx = await browser.new_context(viewport={'width':900,'height':800})
    page = await new_page(ctx, state)
    assert '과정 후 기억 확인' in await page.locator('#startButton').inner_text()
    assert not await page.locator('#startButton').is_disabled()
    await page.click('#startButton')
    assert 'D+6' in await page.locator('#stageBadge').inner_text()
    await ctx.close()

async def mail_gate_check(browser):
    state = base_state()
    state['days'] = {'1': {
        'completedAt':None,'completedBlocks':[0,1,2,3],'block':3,'phase':'blockReward',
        'startedAt':None,'firstStartedAt':'2026-07-26T00:00:00Z','elapsedSeconds':600,
        'answers':{},'stats':{'attempted':80,'correct':70,'wrong':10,'typed':5,'reviewAttempted':2,'reviewCorrect':2,'reviewWrong':0}
    }}
    ctx = await browser.new_context(viewport={'width':390,'height':844})
    page = await new_page(ctx, state)
    await page.evaluate("window.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true}),text:async()=>'{\"ok\":true}'})")
    await page.click('#startButton')
    assert await page.locator('#mailGateModal:not(.hidden)').count() == 1
    await page.click('#sendCompletionMail')
    await page.wait_for_selector('#completionScreen:not(.hidden)', timeout=5000)
    saved = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV7'))")
    assert saved['days']['1']['completedAt']
    assert any(e['action']=='day_complete' for e in saved['eventLog'])
    await page.screenshot(path=str(OUT / 'mail_success.png'), full_page=True)
    await ctx.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        await responsive_checks(browser)
        await wrong_and_immediate_recall(browser)
        await due_review_check(browser)
        await d1_wrong_to_d3(browser)
        await d6_stabilization(browser)
        await post_course_review(browser)
        await mini_reward_check(browser)
        await mail_gate_check(browser)
        await browser.close()
    print('BROWSER_V7_OK')

if __name__ == '__main__':
    asyncio.run(main())
