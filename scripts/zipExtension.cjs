const fs = require('fs-extra');
const path = require('path');
const JSZip = require('jszip');

async function zipDirectory(sourceDir, outPath) {
  try {
    const zip = new JSZip();
    
    await fs.ensureDir(path.dirname(outPath));
    
    async function addFilesToZip(dirPath, zipFolder) {
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          const folder = zipFolder.folder(file);
          await addFilesToZip(filePath, folder);
        } else {
          const fileData = await fs.readFile(filePath);
          const relativePath = path.relative(sourceDir, filePath);
          zipFolder.file(relativePath, fileData);
        }
      }
    }
    
    await addFilesToZip(sourceDir, zip);
    
    const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(outPath, zipContent);
    
    console.log(`Successfully created ${outPath}`);
  } catch (error) {
    console.error('Error creating zip file:', error);
    throw error;
  }
}

// 执行压缩
const extensionDir = path.resolve(__dirname, '../extension');
const outputPath = path.resolve(__dirname, '../public/extension.zip');

zipDirectory(extensionDir, outputPath)
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 