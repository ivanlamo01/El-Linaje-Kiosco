const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, '../src/app/api');
const tempApiPath = path.join(__dirname, '../src/app/_api');

let moved = false;
try {
    if (fs.existsSync(apiPath)) {
        fs.renameSync(apiPath, tempApiPath);
        moved = true;
        console.log('Temporarily moved api folder to _api');
    }
    
    // Clean .next cache to prevent type errors from missing api routes
    const nextPath = path.join(__dirname, '../.next');
    if (fs.existsSync(nextPath)) {
        fs.rmSync(nextPath, { recursive: true, force: true });
        console.log('Cleaned .next directory');
    }
    
    execSync('cross-env NEXT_PUBLIC_IS_ELECTRON=true next build && electron-builder', { stdio: 'inherit' });
} catch (error) {
    console.error('Build failed', error);
    process.exit(1);
} finally {
    if (moved && fs.existsSync(tempApiPath)) {
        fs.renameSync(tempApiPath, apiPath);
        console.log('Restored api folder');
    }
}
