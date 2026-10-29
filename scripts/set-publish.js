// Перед сборкой в CI прописывает в package.json репозиторий GitHub, откуда лаунчер будет брать обновления.
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
if (!owner || !repo) { console.error('GITHUB_REPOSITORY is not set'); process.exit(1); }
p.build.publish = [{ provider: 'github', owner, repo, releaseType: /-/.test(p.version) ? 'prerelease' : 'release' }];
fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
console.log(`publish target: ${owner}/${repo} (${p.build.publish[0].releaseType})`);
