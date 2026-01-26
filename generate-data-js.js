const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'data.csv');
const jsPath = path.join(__dirname, 'data-store.js');

try {
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const escapedData = csvData.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const jsContent = `window.DEFAULT_CSV_DATA = \`${escapedData}\`;`;
    fs.writeFileSync(jsPath, jsContent, 'utf8');
    console.log('Successfully generated data-store.js');
} catch (err) {
    console.error('Error generating data-store.js:', err);
    process.exit(1);
}
