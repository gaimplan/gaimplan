# Deployment Guide - Gaimplan Knowledge Management

This guide covers building, packaging, and distributing Gaimplan for beta testing and production release.

## 👥 End Users vs Developers

### **Developers (Building from Source)**
⚠️ **Prerequisites required for development:**

## 📦 Building for Distribution

### Developer Prerequisites
- Node.js and npm installed
- Rust and Cargo installed
- Tauri CLI installed (`npm install -g @tauri-apps/cli`)
- ImageMagick installed (for icon conversion): `brew install imagemagick`

### Build Commands

#### Development Build
```bash
npm run tauri:dev
```

#### Production Build
```bash
npm run tauri:build
```

This creates:
- **App Bundle**: `/src-tauri/target/release/bundle/macos/gaimplan.app`
- **DMG Installer**: `/src-tauri/target/release/bundle/dmg/gaimplan_0.1.0_aarch64.dmg`

### **End Users (Beta Testers)**
✅ **No prerequisites required!** 
- Download the DMG installer 
- Double-click to mount, drag Gaimplan.app to Applications
- Launch and use immediately

## 🎨 Icon Management

### Photoshop Export Settings
For optimal icon quality, export from Photoshop with:
```
Format: PNG-24
Size: 512x512 pixels (or 1024x1024)
✅ Transparency checked
Quality: 100%
Resolution: 72 DPI
Color Mode: RGB (8-bit)
```

### Icon Conversion Process
After exporting from Photoshop, convert to RGBA format:
```bash
magick /path/to/your/icon.png -define png:color-type=6 /src-tauri/icons/icon.png
```

### macOS Icon Cache Clearing
After updating icons, clear the macOS cache:
```bash
rm -rf ~/Library/Caches/com.apple.iconservices.store
killall Dock
```

## 📱 Platform-Specific Builds

### macOS (Current)
- **Apple Silicon**: `npm run tauri:build` (default)
- **Intel**: Build on Intel Mac or use CI/CD
- **Universal**: `npm run tauri build -- --target universal-apple-darwin`

### Future Platforms
Configuration ready for:
- **Windows**: `.exe` and `.msi` installers
- **Linux**: `.deb`, `.rpm`, and `.AppImage` packages

## 🔧 Bundle Configuration

Current `tauri.conf.json` bundle settings:
```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"]
  }
}
```

### DMG Customization (Optional)
To customize DMG appearance:
```json
{
  "bundle": {
    "dmg": {
      "appPosition": { "x": 180, "y": 170 },
      "applicationFolderPosition": { "x": 480, "y": 170 },
      "windowSize": { "width": 660, "height": 400 }
    }
  }
}
```

## 📋 Distribution Checklist

### Pre-Release Testing
- [ ] Build completes without errors
- [ ] Icon displays correctly in all contexts (Dock, Finder, App Switcher)
- [ ] App launches and basic functionality works
- [ ] DMG installs correctly
- [ ] No "unsaved changes" dialogs after auto-save

### Beta Distribution
- [ ] Test DMG installation on clean macOS system
- [ ] Verify app works without development dependencies
- [ ] Test on both Apple Silicon and Intel Macs (if targeting both)
- [ ] Document known issues for beta testers

### Build Artifacts

#### Current Build Output
```
✅ App Bundle: Gaimplan.app (24MB)
✅ DMG Installer: Gaimplan_0.1.0_aarch64.dmg (8.8MB)
✅ Icon: 512x512 RGBA PNG format
✅ Target: Apple Silicon (M1/M2/M3)
```

#### File Locations
```
/src-tauri/target/release/bundle/
├── macos/
│   └── Gaimplan.app                    # App bundle for installation
└── dmg/
    └── Gaimplan_0.1.0_aarch64.dmg    # Distributable installer
```

## 🐛 Common Issues & Solutions

### Build Issues

#### "Icon is not RGBA"
**Cause**: Photoshop exported RGB instead of RGBA
**Solution**: Convert with `magick icon.png -define png:color-type=6 icon_fixed.png`

#### "Bundle identifier ends with .app"
**Warning**: `com.gaimplan.app` conflicts with `.app` extension
**Solution**: Consider changing to `com.gaimplan.notes` or similar

### Installation Issues

#### "App can't be opened because Apple cannot check it"
**Cause**: App not signed with Apple Developer certificate
**Solution**: User can right-click → Open, or sign app for distribution

#### Old icon still showing
**Cause**: macOS icon cache not cleared
**Solution**: Clear cache and restart Dock (see Icon Cache Clearing above)

## 🚀 Deployment Workflow

### For Beta Testing
1. Update version in `tauri.conf.json` and `package.json`
2. Run `npm run tauri:build`
3. Test DMG installation locally
4. Upload DMG to distribution platform (Google Drive, Dropbox, etc.)
5. Share with beta testers

### For Production Release
1. Code sign with Apple Developer certificate
2. Notarize with Apple (for Gatekeeper approval)
3. Create release notes
4. Upload to distribution platform or App Store
5. Announce release

## 📊 Build Statistics

### Current Build Performance
```
Build Time: ~16 seconds (Rust compilation)
Bundle Time: ~2 seconds (DMG creation)
Total Size: 8.8MB DMG / 24MB app bundle
Dependencies: 166 frontend modules bundled
```

### Optimization Opportunities
- Code splitting for faster loads (warning shown during build)
- Reduce bundle size with manual chunking
- Consider dynamic imports for large dependencies

## 🔄 Continuous Integration

### GitHub Actions (Future)
Recommended workflow for automated builds:
```yaml
# Build for multiple platforms
- macOS (Apple Silicon & Intel)
- Windows (x64)
- Linux (x64)
```

### Version Management
- Semantic versioning (0.1.0 → 0.1.1 → 0.2.0)
- Automated changelog generation
- Git tag integration with build process

---

## Current Status: ✅ Ready for Beta Distribution

The Gaimplan app is successfully packaged and ready for beta testing distribution. The DMG installer provides a professional installation experience for macOS users.