// Ghép Lib.gs + Code.gs thành 1 file AppsScript.gs để dán 1 lần. Chạy: node tools/build.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../backend');
const out = ['Lib.gs', 'Code.gs'].map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join(dir, f), 'utf8').trim()).join('\n\n');
fs.writeFileSync(path.join(dir, 'AppsScript.gs'),
  '// FILE TỰ SINH bằng `node tools/build.js` từ Lib.gs + Code.gs. Không sửa trực tiếp.\n' + out + '\n');
console.log('Đã tạo backend/AppsScript.gs');
