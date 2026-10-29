// Тег релиза (v1.2.3) должен совпадать с версией в package.json, иначе обновление не будет найдено.
const v = require('../package.json').version, ref = process.env.GITHUB_REF_NAME || '';
if (process.env.GITHUB_REF_TYPE === 'tag' && ref.replace(/^v/, '') !== v) { console.error(`Tag ${ref} does not match package.json version ${v}`); process.exit(1); }
console.log('version ok:', v);
