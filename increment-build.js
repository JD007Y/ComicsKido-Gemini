import fs from 'fs';
import path from 'path';

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
try {
  let content = fs.readFileSync(appPath, 'utf8');

  // Match major.minor.build like 1.0.0001
  const regex = /const BUILD_NUMBER = '(\d+)\.(\d+)\.(\d+)';/;
  const match = content.match(regex);

  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const buildNum = parseInt(match[3], 10) + 1;
    const paddedBuild = String(buildNum).padStart(4, '0');
    const newVersion = `${major}.${minor}.${paddedBuild}`;
    
    content = content.replace(regex, `const BUILD_NUMBER = '${newVersion}';`);
    fs.writeFileSync(appPath, content, 'utf8');
    console.log(`[BUILD SYSTEM] Automated version and build increment executed. New build context: ${newVersion}`);
  } else {
    // If mismatch, try legacy format replacement
    const legacyRegex = /const BUILD_NUMBER = '(\d+)\.(\d+)\.(\d+)\.(\d+)';/;
    if (content.match(legacyRegex)) {
      content = content.replace(legacyRegex, `const BUILD_NUMBER = '1.0.0001';`);
      fs.writeFileSync(appPath, content, 'utf8');
      console.log(`[BUILD SYSTEM] Initialized App version context to 1.0.0001`);
    } else {
      console.warn("[BUILD SYSTEM] const BUILD_NUMBER pattern not matched in src/App.tsx");
    }
  }
} catch (err) {
  console.error("[BUILD SYSTEM] Failed to read or write src/App.tsx for build increment:", err);
}
