const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath, callback);
        } else if (filePath.endsWith('.html')) {
            callback(filePath);
        }
    }
}

let modifiedCount = 0;

walkDir(publicDir, (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Remove text-based logo and replace with image.
    // E.g., >GOLD <span>GYS</span>< or >GOLD GYS< inside .brand-logo
    // There are multiple variations.
    
    // Pattern 1: GOLD <span>GYS</span>
    content = content.replace(/GOLD\s*<span>GYS<\/span>/g, '<img src="/img/logo.png" alt="GoldGYS" class="header-logo">');
    
    // Pattern 2: login.html might just have text styling that we need to handle or specific classes.
    // Let's also check if there is an <img already. If so, don't replace again.
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        modifiedCount++;
        console.log(`Updated: ${path.relative(publicDir, filePath)}`);
    }
});

console.log(`Finished checking HTMLs. Total modified: ${modifiedCount}`);
