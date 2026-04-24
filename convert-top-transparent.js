const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const buildDir = path.join(__dirname, 'build');
const iconsDir = path.join(buildDir, 'icons-top');
const sourceFile = path.join(buildDir, 'logo-menu-top-1.png');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

async function convertWithTransparency() {
    console.log('🚀 Iniciando conversión con efecto de transparencia central...');
    
    const sizes = [16, 22, 24, 32, 48, 64, 128, 256, 512, 1024];

    try {
        // Obtenemos los metadatos de la imagen original
        const image = sharp(sourceFile);
        const metadata = await image.metadata();
        const { width, height } = metadata;

        // Creamos la máscara con las mismas dimensiones exactas
        const radius = Math.min(width, height) * 0.25; 
        const svgMask = Buffer.from(
            `<svg width="${width}" height="${height}">
                <circle cx="${width / 2}" cy="${height / 2}" r="${radius}" fill="black" />
            </svg>`
        );

        // Procesamos la imagen base una sola vez para aplicar la máscara
        const hollowImageBuffer = await image
            .composite([{
                input: svgMask,
                blend: 'dest-out'
            }])
            .png()
            .toBuffer();

        for (const size of sizes) {
            const output = path.join(iconsDir, `${size}x${size}.png`);
            
            await sharp(hollowImageBuffer)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toFile(output);
            
            console.log(`✅ Generado con centro hueco: ${size}x${size}.png`);
        }
        console.log('✨ Proceso completado exitosamente.');
    } catch (err) {
        console.error('❌ Error durante la conversión:', err);
        process.exit(1);
    }
}

convertWithTransparency();
