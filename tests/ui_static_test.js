const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const checks = {
  title_root_18day: html.includes('<title>root_18day</title>'),
  brand_root_18day: html.includes('id="courseEyebrow">root_18day'),
  dark_design_tokens: css.includes('--bg:#0E1016') && css.includes('--grad:linear-gradient(120deg,#6C5CE7 0%,#00E5D4 100%)'),
  simple_home_single_start: (html.match(/id="startButton"/g) || []).length === 1,
  no_home_explanation: !html.includes('한 번 시작하면') && !html.includes('오늘 학습을 시작하세요'),
  no_question_instruction: !js.includes('먼저 4지선다 보기를 보고') && !js.includes('키보드 <span'),
  compact_wrong_screen: js.includes('ROOT + WORD') && js.includes("next.textContent = 'NEXT'"),
  mandatory_mail_button: html.includes('id="sendCompletionMail"') && html.includes('SEND REPORT'),
  tests_retained: fs.existsSync(path.join(root, 'tests', 'logic_test.js')),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
console.log(JSON.stringify({ pass: failed.length === 0, checks, failed }, null, 2));
process.exit(failed.length ? 1 : 0);
