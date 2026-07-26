import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / 'screenshots'
OUT.mkdir(exist_ok=True)

INDEX = (ROOT / 'index.html').read_text(encoding='utf-8')
CSS = (ROOT / 'styles.css').read_text(encoding='utf-8')
APP = (ROOT / 'app.js').read_text(encoding='utf-8')
SCHEDULE = json.loads((ROOT / 'data' / 'voca_schedule.json').read_text(encoding='utf-8'))
CONTENT = json.loads((ROOT / 'data' / 'learning_units.json').read_text(encoding='utf-8'))

TEST_LOAD_DATA = """async function loadData() {
  runtime.schedule = window.__TEST_SCHEDULE__;
  runtime.content = window.__TEST_CONTENT__;
  runtime.content.units.forEach((unit) => runtime.unitMap.set(unit.id, unit));
  runtime.state = sanitizeState(loadState());
  persist();
}"""
start = APP.index('async function loadData() {')
end = APP.index('\nfunction currentDayDef', start)
APP_TEST = (APP[:start] + TEST_LOAD_DATA + APP[end:]).replace('localStorage', 'window.__TEST_STORAGE__')

BASE_STATE = {
    'schemaVersion': 5,
    'dataVersion': '18day-root-single-entry-360x1410-20260726-v6',
    'currentDay': 1,
    'completedDays': [],
    'settings': {'start':'19:30','end':'20:30','email':'sk01197375068@gmail.com','autoMail':True,'shortenMastered':True,'blockMinutes':15},
    'mastery': {}, 'days': {}, 'spellingNotebook': {}, 'pendingReports': [], 'sentReportIds': [], 'migrationNotice': ''
}

def html_with_state(state=None):
    storage = {}
    if state is not None:
        storage['18dayRootStateV5'] = json.dumps(state, ensure_ascii=False)
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

async def base_checks(browser, name, viewport):
    context = await browser.new_context(viewport=viewport)
    page = await new_page(context, BASE_STATE)
    assert '18day_root' in await page.locator('#courseEyebrow').inner_text()
    assert '총 18DAY' in await page.locator('#statusChip').inner_text()
    assert await page.locator('.segment-step').count() == 4
    assert await page.locator('#blockList button').count() == 0
    assert '전체 연속 학습' in await page.locator('.continuous-day-section').inner_text()
    dims = await page.evaluate('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})')
    assert dims['sw'] <= dims['cw'] + 1, dims
    await page.screenshot(path=str(OUT / f'{name}_home.png'), full_page=True)
    await context.close()

async def interaction_checks(browser):
    # Wrong answer marking in the same flow.
    context = await browser.new_context(viewport={'width':1280,'height':900})
    page = await new_page(context, BASE_STATE)
    await page.click('#startButton')
    assert await page.locator('.root-panel').count() == 1
    await page.click('#answerArea button')
    await page.wait_for_timeout(1750)
    assert await page.locator('.option-button').count() == 4
    options = await page.locator('.option-button').all()
    correct = '1 진보, 발전 2 전진, 진행'
    wrong = None
    for option in options:
        if await option.get_attribute('data-option-value') != correct:
            wrong = option
            break
    assert wrong is not None
    await wrong.click()
    assert '오늘 오답' in await page.locator('.wrong-registered').inner_text()
    await page.close()

    # Integrated typing review, explicitly marked as today's error.
    review_state = json.loads(json.dumps(BASE_STATE))
    review_state['days'] = {'1': {
        'completedAt': None, 'completedBlocks': [], 'block': 0, 'phase': 'review', 'unitIndex': 0, 'wordIndex': 0,
        'reviewQueue': ['u1-w1'], 'reviewIndex': 0, 'typingAttempts': 0, 'reviewResolved': False,
        'answers': {'u1-w1':'wrong'}, 'stats': {'attempted':1,'correct':0,'wrong':1,'typed':0}
    }}
    review_state['spellingNotebook'] = {'u1-w1': {'pending':2,'successes':0,'lastWrongAt':'2026-07-26T00:00:00Z','lastResolvedAt':None}}
    page = await new_page(context, review_state)
    await page.click('#startButton')
    assert '오답 철자 각인 1 / 1' in await page.locator('#stageBadge').inner_text()
    assert '오늘 선택형 오답' in await page.locator('.error-origin-badge').inner_text()
    await page.close()

    # Keyboard 1-4 selection.
    page = await new_page(context, BASE_STATE)
    await page.click('#startButton')
    await page.click('#answerArea button')
    await page.wait_for_timeout(1750)
    await page.keyboard.press('1')
    assert await page.locator('.option-button:disabled').count() == 4
    await context.close()

async def continuous_day_checks(browser):
    # Completed segment automatically moves to the next segment without returning home.
    state = json.loads(json.dumps(BASE_STATE))
    state['days'] = {'1': {
        'completedAt': None, 'completedBlocks':[0], 'block':0, 'phase':'blockReward', 'startedAt':'2026-07-26T00:00:00Z',
        'firstStartedAt':'2026-07-26T00:00:00Z', 'elapsedSeconds':60, 'unitIndex':0, 'wordIndex':0,
        'reviewQueue':[], 'reviewIndex':0, 'typingAttempts':0, 'reviewResolved':False,
        'answers':{}, 'stats':{'attempted':0,'correct':0,'wrong':0,'typed':0}
    }}
    context = await browser.new_context(viewport={'width':1280,'height':900})
    page = await new_page(context, state)
    assert '저장된 위치에서 계속' in await page.locator('#startButton').inner_text()
    await page.click('#startButton')
    assert await page.locator('#sessionScreen:not(.hidden)').count() == 1
    assert '다음 2구간을 자동으로' in await page.locator('.auto-next-notice').inner_text()
    await page.wait_for_timeout(1650)
    saved = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV5'))")
    assert saved['days']['1']['block'] == 1
    assert saved['days']['1']['phase'] == 'root'
    assert await page.locator('#sessionScreen:not(.hidden)').count() == 1
    assert '2/4 구간' in await page.locator('#sessionBlockLabel').inner_text()
    await context.close()

    # The last segment opens the required mail gate automatically.
    state = json.loads(json.dumps(BASE_STATE))
    state['days'] = {'1': {
        'completedAt': None, 'completedBlocks':[0,1,2,3], 'block':3, 'phase':'blockReward', 'startedAt':'2026-07-26T00:00:00Z',
        'firstStartedAt':'2026-07-26T00:00:00Z', 'elapsedSeconds':600, 'unitIndex':0, 'wordIndex':0,
        'reviewQueue':[], 'reviewIndex':0, 'typingAttempts':0, 'reviewResolved':False,
        'answers':{}, 'stats':{'attempted':80,'correct':70,'wrong':10,'typed':5}
    }}
    context = await browser.new_context(viewport={'width':390,'height':844})
    page = await new_page(context, state)
    await page.click('#startButton')
    await page.wait_for_timeout(1650)
    assert await page.locator('#mailGateModal:not(.hidden)').count() == 1
    assert '관리자에게 완료 보고' in await page.locator('#mailGateTitle').inner_text()
    await context.close()

async def mail_gate_success(browser):
    state = json.loads(json.dumps(BASE_STATE))
    state['days'] = {'1': {
        'completedAt': None, 'completedBlocks':[0,1,2,3], 'block':3, 'phase':'blockReward', 'startedAt':None,
        'firstStartedAt':'2026-07-26T00:00:00Z', 'elapsedSeconds':600, 'answers':{},
        'stats':{'attempted':80,'correct':70,'wrong':10,'typed':5}
    }}
    context = await browser.new_context(viewport={'width':1024,'height':900})
    page = await new_page(context, state)
    await page.evaluate("window.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true}),text:async()=>'{\"ok\":true}'})")
    await page.click('#startButton')
    assert await page.locator('#mailGateModal:not(.hidden)').count() == 1
    assert '관리자에게 완료 보고' in await page.locator('#mailGateTitle').inner_text()
    before = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV5')).days['1'].completedAt")
    assert before is None
    await page.click('#sendCompletionMail')
    await page.wait_for_selector('#completionScreen:not(.hidden)', timeout=5000)
    saved = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV5'))")
    assert saved['days']['1']['completedAt']
    assert 1 in saved['completedDays']
    await page.screenshot(path=str(OUT / 'mail_gate_success.png'), full_page=True)
    await context.close()

async def mail_gate_failure(browser):
    state = json.loads(json.dumps(BASE_STATE))
    state['days'] = {'1': {
        'completedAt': None, 'completedBlocks':[0,1,2,3], 'block':3, 'phase':'blockReward', 'startedAt':None,
        'firstStartedAt':'2026-07-26T00:00:00Z', 'elapsedSeconds':600, 'answers':{},
        'stats':{'attempted':80,'correct':70,'wrong':10,'typed':5}
    }}
    context = await browser.new_context(viewport={'width':390,'height':844})
    page = await new_page(context, state)
    await page.evaluate("() => { window.fetch=async()=>{throw new Error('test mail failure')}; return true; }")
    await page.click('#startButton')
    await page.click('#sendCompletionMail')
    await page.wait_for_timeout(250)
    assert '미완료' in await page.locator('#mailGateStatus').inner_text()
    completed = await page.evaluate("JSON.parse(window.__TEST_STORAGE__.getItem('18dayRootStateV5')).days['1'].completedAt")
    assert completed is None
    dims = await page.evaluate('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})')
    assert dims['sw'] <= dims['cw'] + 1, dims
    await page.screenshot(path=str(OUT / 'mail_gate_failure_mobile.png'), full_page=True)
    await context.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        await base_checks(browser, 'pc_1440', {'width':1440,'height':900})
        await base_checks(browser, 'tablet_820', {'width':820,'height':1180})
        await base_checks(browser, 'mobile_390', {'width':390,'height':844})
        await base_checks(browser, 'mobile_320', {'width':320,'height':720})
        await interaction_checks(browser)
        await continuous_day_checks(browser)
        await mail_gate_success(browser)
        await mail_gate_failure(browser)
        await browser.close()
    print('BROWSER_TEST_OK')

if __name__ == '__main__':
    asyncio.run(main())
