cd ~/rutas/rutas/Jearcastapp_electron_v3

# Limpiar
rm -rf build-dir .flatpak-builder dist_electron

# Recompilar
flatpak-builder --force-clean --install-deps-from=flathub build-dir flathub/com.jearcast.JearCast.yml

# Instalar
flatpak-builder --user --install --force-clean build-dir flathub/com.jearcast.JearCast.yml

# Ejecutar
flatpak run com.jearcast.JearCast