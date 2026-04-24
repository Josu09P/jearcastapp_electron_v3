const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const buildDir = path.join(__dirname, 'build');
const dashIconsDir = path.join(buildDir, 'icons-dash');
const sourceFile = path.join(buildDir, 'logo-app-dash-to-doc.png');

if (!fs.existsSync(dashIconsDir)) {
    fs.mkdirSync(dashIconsDir, { recursive: true });
}

async function convert() {
    console.log('🚀 Iniciando conversión de Icono Dash (Color) a múltiples tamaños...');
    
    const sizes = [16, 22, 24, 32, 48, 64, 128, 256, 512, 1024];

    try {
        for (const size of sizes) {
            const output = path.join(dashIconsDir, `${size}x${size}.png`);
            
            await sharp(sourceFile)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toFile(output);
            
            console.log(`✅ Dash Icon Generado: ${size}x${size}.png`);
        }
        console.log('✨ Proceso completado exitosamente.');
    } catch (err) {
        console.error('❌ Error durante la conversión:', err);
        process.exit(1);
    }
}

convert();
