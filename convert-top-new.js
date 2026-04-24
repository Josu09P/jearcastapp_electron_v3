const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const buildDir = path.join(__dirname, 'build');
const iconsDir = path.join(buildDir, 'icons-top');
const sourceFile = path.join(buildDir, 'logo-menu-top-1.png');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

async function convert() {
    console.log('🚀 Iniciando conversión de logo-menu-top-1.png a múltiples tamaños...');
    
    const sizes = [16, 22, 24, 32, 48, 64, 128, 256, 512, 1024];

    try {
        for (const size of sizes) {
            const output = path.join(iconsDir, `${size}x${size}.png`);
            
            await sharp(sourceFile)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toFile(output);
            
            console.log(`✅ Generado: ${output}`);
        }
        console.log('✨ Proceso completado exitosamente.');
    } catch (err) {
        console.error('❌ Error durante la conversión:', err);
        process.exit(1);
    }
}

convert();
