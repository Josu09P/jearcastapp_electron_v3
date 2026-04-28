const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, 'build');
const icoOutputDir = path.join(buildDir, 'icons-ico');

if (!fs.existsSync(icoOutputDir)) {
    fs.mkdirSync(icoOutputDir, { recursive: true });
}

const sourceFile = path.join(buildDir, 'logo-app-menu.png');
const mainOutputFile = path.join(buildDir, 'icon.ico');

const sizes = [16, 32, 48, 64, 128, 256];

async function processIcons() {
    console.log('🚀 Iniciando proceso de generación de iconos ICO...');
    
    // 1. Generar icon.ico principal
    try {
        await generateSingleIco(sourceFile, mainOutputFile, sizes);
        console.log(`✅ Main icon.ico generado: ${mainOutputFile}`);
    } catch (err) {
        console.error('❌ Error generando main icon.ico:', err);
    }

    // 2. Convertir carpetas existentes
    const foldersToConvert = ['icons-dash', 'icons-top'];
    for (const folder of foldersToConvert) {
        const folderPath = path.join(buildDir, folder);
        if (fs.existsSync(folderPath)) {
            console.log(`📂 Procesando carpeta: ${folder}...`);
            const targetDir = path.join(icoOutputDir, folder);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

            const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.png'));
            for (const file of files) {
                const sourcePath = path.join(folderPath, file);
                const targetPath = path.join(targetDir, file.replace('.png', '.ico'));
                
                // Para archivos individuales de un solo tamaño
                try {
                    const buffer = await sharp(sourcePath).toBuffer();
                    // Extraer tamaño del nombre del archivo si es posible (ej: 32x32.png)
                    const match = file.match(/(\d+)x/);
                    const size = match ? parseInt(match[1]) : 256;
                    
                    const icoBuffer = createIco([{ buffer, size }]);
                    fs.writeFileSync(targetPath, icoBuffer);
                    console.log(`   ✅ Convertido: ${file} -> ${path.basename(targetPath)}`);
                } catch (err) {
                    console.error(`   ❌ Error convirtiendo ${file}:`, err);
                }
            }
        }
    }
    
    console.log('✨ Proceso completado exitosamente.');
}

async function generateSingleIco(source, output, icoSizes) {
    const pngBuffers = [];
    for (const size of icoSizes) {
        const buffer = await sharp(source)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toBuffer();
        pngBuffers.push({ buffer, size });
    }
    const icoBuffer = createIco(pngBuffers);
    fs.writeFileSync(output, icoBuffer);
}

function createIco(pngs) {
    const headerSize = 6;
    const directorySize = 16 * pngs.length;
    const buffer = Buffer.alloc(headerSize + directorySize + pngs.reduce((acc, p) => acc + p.buffer.length, 0));

    buffer.writeUInt16LE(0, 0); 
    buffer.writeUInt16LE(1, 2); 
    buffer.writeUInt16LE(pngs.length, 4);

    let offset = headerSize + directorySize;
    pngs.forEach((png, i) => {
        const entryOffset = headerSize + i * 16;
        const width = png.size >= 256 ? 0 : png.size;
        const height = png.size >= 256 ? 0 : png.size;

        buffer[entryOffset] = width;
        buffer[entryOffset + 1] = height;
        buffer[entryOffset + 2] = 0; 
        buffer[entryOffset + 3] = 0; 
        buffer.writeUInt16LE(1, entryOffset + 4); 
        buffer.writeUInt16LE(32, entryOffset + 6); 
        buffer.writeUInt32LE(png.buffer.length, entryOffset + 8); 
        buffer.writeUInt32LE(offset, entryOffset + 12); 

        png.buffer.copy(buffer, offset);
        offset += png.buffer.length;
    });

    return buffer;
}

processIcons();
