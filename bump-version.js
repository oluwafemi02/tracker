#!/usr/bin/env node

/**
 * Version Bump Script
 * Automatically increments version numbers and updates relevant files
 * Usage: 
 *   node bump-version.js              (increments patch: 0.0.1 -> 0.0.2)
 *   node bump-version.js minor        (increments minor: 0.0.1 -> 0.1.0)
 *   node bump-version.js major        (increments major: 0.0.1 -> 1.0.0)
 *   node bump-version.js 1.2.3        (sets specific version)
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const bumpType = args[0] || 'patch';

// Read current version from version.json
const versionFilePath = path.join(__dirname, 'version.json');
const packageFilePath = path.join(__dirname, 'package.json');

let versionData, packageData;

try {
    versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
    packageData = JSON.parse(fs.readFileSync(packageFilePath, 'utf8'));
} catch (error) {
    console.error('Error reading version files:', error.message);
    process.exit(1);
}

// Function to increment version
function incrementVersion(version, type) {
    const parts = version.split('.').map(Number);
    
    switch (type) {
        case 'major':
            parts[0]++;
            parts[1] = 0;
            parts[2] = 0;
            break;
        case 'minor':
            parts[1]++;
            parts[2] = 0;
            break;
        case 'patch':
        default:
            parts[2]++;
            break;
    }
    
    return parts.join('.');
}

// Determine new version
let newVersion;
if (bumpType.match(/^\d+\.\d+\.\d+$/)) {
    // Specific version provided
    newVersion = bumpType;
} else {
    // Increment based on type
    newVersion = incrementVersion(versionData.version, bumpType);
}

// Update version.json
versionData.version = newVersion;
versionData.releaseDate = new Date().toISOString().split('T')[0];
versionData.previousVersion = packageData.version;

// Update package.json
packageData.version = newVersion;

// Write updated files
try {
    fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2) + '\n');
    fs.writeFileSync(packageFilePath, JSON.stringify(packageData, null, 2) + '\n');
    
    console.log(`✅ Version bumped from ${versionData.previousVersion} to ${newVersion}`);
    console.log(`📅 Release date: ${versionData.releaseDate}`);
    
    // Update version in service worker
    const swPath = path.join(__dirname, 'sw.js');
    if (fs.existsSync(swPath)) {
        let swContent = fs.readFileSync(swPath, 'utf8');
        // Update APP_VERSION constant
        swContent = swContent.replace(
            /const APP_VERSION = ['"].*['"];/,
            `const APP_VERSION = '${newVersion}';`
        );
        fs.writeFileSync(swPath, swContent);
        console.log('✅ Service worker updated');
    }
    
} catch (error) {
    console.error('Error writing version files:', error.message);
    process.exit(1);
}

// Create git commit message
console.log(`\n📝 Suggested commit message:`);
console.log(`chore: bump version to ${newVersion}`);