import { copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

async function copyPluginFiles() {
  const filesToCopy = [
    'manifest.json',
    'styles.css'
  ];

  // Ensure dist directory exists
  if (!existsSync('dist')) {
    await mkdir('dist');
  }

  // Copy files to dist directory
  for (const file of filesToCopy) {
    if (existsSync(file)) {
      await copyFile(file, `dist/${file}`);
      console.log(`✓ Copied ${file} to dist/`);
    } else {
      console.log(`⚠ ${file} not found, skipping`);
    }
  }
}

// Run copy process
copyPluginFiles().catch(console.error);