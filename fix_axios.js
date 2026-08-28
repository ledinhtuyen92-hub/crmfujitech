const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.jsx')) {
      results.push(file);
    }
  });
  return results;
}
let changedFiles = 0;
walk('./frontend/src/pages').forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  let initC = c;
  // Use a simple string replace for the headers object to avoid regex capture group interpolation bugs
  c = c.replace(/api\.(post|patch|put)\(([^,]+),\s*([^,]+),\s*\{\s*headers:\s*\{\s*['"]Content-Type['"]:\s*['"]multipart\/form-data['"]\s*,?\s*\}\s*,?\s*\}\s*\)/g, 'api.$1Form($2, $3)');
  if (c !== initC) {
    fs.writeFileSync(f, c);
    console.log('Fixed', f);
    changedFiles++;
  }
});
console.log('Total fixed:', changedFiles);
