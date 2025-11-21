# 📦 Dropzone Navigator

**Dropzone Navigator** is a cross-platform desktop application built with Electron that provides a user-friendly, tree-like file system interface for browsing and uploading files to Amazon S3 buckets through access points. It's designed for users who need secure, restricted access to specific S3 locations with an intuitive file manager experience.

For **Dropzone Root User** 
<img width="1283" height="249" alt="image" src="https://github.com/user-attachments/assets/032c26fd-a7c9-41cc-af6c-4e42c44b8f00" />

For **Content Partners** or **NonRootUsers**
In the last field, add the dropzone foldername to which content partner's credentials has access to


## ✨ Features

### 🔐 **Secure S3 Access**
- Connect using AWS Access Keys and S3 Access Point ARNs
- Automatic prefix-based access control (users can only access their designated folders)
- Support for folder-specific access points (e.g., `accesspoint/user123-documents`)
- Credentials are securely stored locally and can be remembered between sessions

### 🌳 **Tree-like File Navigation**
- Intuitive folder structure browsing similar to desktop file managers
- Breadcrumb navigation for easy path tracking and quick navigation
- Click folders to expand and explore nested directories
- Visual distinction between folders (📁) and files (📄)
- Prevents navigation above user's permitted access level

### 📤 **File Upload with Progress Tracking**
- Upload multiple files simultaneously to current folder location
- Real-time upload progress with file-by-file tracking
- Visual progress bar and status updates
- Automatic folder refresh after successful uploads
- Support for all file types with proper MIME type detection

### 💾 **Credential Management**
- Save credentials locally for convenience
- One-click credential clearing for security
- Auto-fill forms with saved credentials
- No sensitive data stored in recoverable format

### 🎨 **Modern UI/UX**
- Clean, responsive design that works on all screen sizes
- Professional color scheme with hover effects and smooth transitions
- Loading states and error handling with clear user feedback
- Status bar with real-time operation updates

## 🏗️ Technical Architecture

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Electron (Node.js)
- **AWS Integration**: AWS SDK v3 for JavaScript
- **Storage**: Local browser storage for credential persistence
- **Security**: Context isolation, disabled node integration, secure IPC communication

## 📋 Prerequisites

Before building or installing Dropzone Navigator, ensure you have:

- **Node.js** (version 16.0 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **Git** (for cloning the repository)
- **AWS CLI v2** available on the system PATH (the app checks automatically and blocks credential entry until found). Install it with one of the following commands and restart/refresh the app:
  - macOS: `brew install awscli`
  - Windows: `winget install --id Amazon.AWSCLI -e`
  - Linux (Debian/Ubuntu example): `sudo apt install awscli`
- **AWS Credentials** with S3 access permissions:
  - AWS Access Key ID
  - AWS Secret Access Key  
  - S3 Access Point ARN
  - Minimum required permissions: `s3:ListObjects`, `s3:PutObject`

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/milindghiya/dropzone_navigator.git
cd dropzone-navigator
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run in Development Mode
```bash
npm start
```

### 4. Build for Production
```bash
# Build for all platforms
npm run build

# Build for specific platform
npm run build:win     # Windows
npm run build:mac     # macOS  
npm run build:linux   # Linux
```

## 🔧 Development Setup

### Project Structure
```
dropzone_navigator/
├── main.js           # Electron main process
├── renderer.js       # Frontend application logic
├── preload.js        # Secure IPC bridge
├── index.html        # Main UI
├── package.json      # Dependencies and scripts
├── README.md         # This file
└── dist/            # Built applications (created after build)
```

### Available Scripts
```bash
npm start              # Run in development mode
npm run build          # Build for all platforms
npm run build:win      # Build for Windows (.exe)
npm run build:mac      # Build for macOS (.dmg)
npm run build:linux    # Build for Linux (.AppImage)
npm run clean          # Clean build directory
```

## 📦 Installation Instructions

### Windows

#### Option 1: Download Pre-built Executable
1. Download `Dropzone-Navigator-Setup-x.x.x.exe` from the [Releases](https://github.com/milindghiya/dropzone_navigator/releases) page
2. Run the installer and follow the installation wizard
3. Launch "Dropzone Navigator" from the Start Menu or Desktop

#### Option 2: Build from Source
```bash
# Install Node.js from https://nodejs.org/
# Open Command Prompt or PowerShell
git clone https://github.com/your-username/dropzone_navigator.git
cd dropzone_navigator
npm install
npm run build:win

# The installer will be in the dist/ folder
# Double-click the .exe file to install
```

### macOS

#### Option 1: Download Pre-built App
1. Download `Dropzone-Navigator-x.x.x.dmg` from the [Releases](https://github.com/milindghiya/dropzone_navigator/releases) page
2. Open the DMG file and drag "Dropzone Navigator" to Applications
3. Launch from Applications folder (you may need to allow the app in Security & Privacy settings)

#### Option 2: Build from Source
```bash
# Install Node.js from https://nodejs.org/ or using Homebrew:
brew install node

# Clone and build
git clone https://github.com/your-username/dropzone-navigator.git
cd dropzone-navigator
npm install
npm run build:mac

# The DMG file will be in the dist/ folder
# Double-click to mount and install
```

### Linux

#### Option 1: Download AppImage
1. Download `Dropzone-Navigator-x.x.x.AppImage` from the [Releases](https://github.com/milindghiya/dropzone_navigator/releases) page
2. Make it executable: `chmod +x Dropzone-Navigator-x.x.x.AppImage`
3. Run: `./Dropzone-Navigator-x.x.x.AppImage`

#### Option 2: Build from Source
```bash
# Install Node.js (Ubuntu/Debian example)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build
git clone https://github.com/your-username/dropzone_navigator.git
cd dropzone-navigator
npm install
npm run build:linux

# The AppImage will be in the dist/ folder
chmod +x dist/Dropzone-Navigator-*.AppImage
./dist/Dropzone-Navigator-*.AppImage
```

## 🎯 Usage Guide

### First-Time Setup
1. **Launch the Application**
2. **Confirm AWS CLI Availability**:
   - The header banner shows whether the AWS CLI was detected.
   - If missing, install it using the suggested command in the banner, then click the **Refresh** button to re-check (or restart the app).
   - Credential inputs stay disabled until AWS CLI is available because uploads rely on the CLI.
3. **Enter AWS Credentials**:
   - Access Key ID
   - Secret Access Key
   - S3 Access Point ARN (e.g., `arn:aws:s3:us-east-1:123456789012:accesspoint/user123`)
4. **Click "Connect to S3"**
5. **Start browsing your files!**

### Navigation
- **Browse Folders**: Click any folder icon (📁) to open it
- **Navigate Back**: Use the breadcrumb trail at the top
- **Upload Files**: Click the "📁 Upload Files" button in the top-right corner
- **Clear Credentials**: Use the "Clear Saved" button to remove stored credentials

### Upload Process
1. Navigate to the desired folder
2. Click "📁 Upload Files"
3. Select one or multiple files
4. Watch the progress bar as files upload
5. Files will appear in the current folder once upload completes

## ⚙️ Configuration

### Environment Variables
Create a `.env` file in the project root for development:
```env
NODE_ENV=development
```

### AWS Configuration
The application requires:
- **Region**: Defaults to `us-east-1` (currently not configurable via UI)
- **Access Point ARN**: Must follow format `arn:aws:s3:region:account:accesspoint/name`
- **Permissions**: Minimum `s3:ListObjects` and `s3:PutObject` for the specified access point

## 🔍 Troubleshooting

### Common Issues

**Connection Failed**
- Verify AWS credentials are correct
- Check Access Point ARN format
- Ensure proper S3 permissions are granted
- Verify network connectivity

**Upload Fails** 
- Check file permissions on local system
- Verify S3 PutObject permissions
- Ensure sufficient storage quota
- Check file size limits

**Application Won't Start**
- Ensure Node.js 16+ is installed
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and run `npm install` again

### Debug Mode
Run in development mode to see detailed logs:
```bash
npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/dropzone-navigator/issues)
- **Documentation**: This README and inline code comments
- **Community**: [GitHub Discussions](https://github.com/your-username/dropzone-navigator/discussions)

## 🏗️ Build Dependencies

The application will automatically include these dependencies when building:

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.x.x",
    "electron": "^latest"
  },
  "devDependencies": {
    "electron-builder": "^latest"
  }
}
```

## 🔄 Version History

**v1.0.0**: 
- Initial release with basic S3 browsing and upload functionality
- Added credential persistence and improved UI
- Enhanced upload progress tracking and error handling

---

Made with ❤️ using Electron and AWS SDK 

