// Dropzone Navigator - Tree-like interface
class S3Navigator {
    constructor() {
        this.currentPath = '';
        this.rootPrefix = ''; // The minimum prefix user has access to
        this.credentials = {};
        this.isConnected = false;
        this.setupEventListeners();
        this.loadSavedCredentials();
        this.updateStatus('Ready to connect');
    }

    setupEventListeners() {
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.addEventListener('click', () => this.connect());
        
        const clearSavedBtn = document.getElementById('clearSaved');
        clearSavedBtn.addEventListener('click', () => this.clearSavedCredentials());
        
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.addEventListener('click', () => this.selectFiles());
        
        const fileInput = document.getElementById('fileInput');
        fileInput.addEventListener('change', (e) => this.handleFileSelection(e));
        
        // Listen for upload progress from main process
        window.awsApi.onUploadProgress((event, data) => {
            this.updateUploadProgress(data);
        });
        
        // Enter key to connect
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.isConnected) {
                this.connect();
            }
        });
    }

    loadSavedCredentials() {
        try {
            const saved = localStorage.getItem('s3NavCredentials');
            if (saved) {
                const creds = JSON.parse(saved);
                document.getElementById('accessKey').value = creds.accessKey || '';
                document.getElementById('secretKey').value = creds.secretKey || '';
                document.getElementById('bucketArn').value = creds.bucketArn || '';
                document.getElementById('dropzoneFolder').value = creds.dropzoneFolder || '';
                
                const notice = document.getElementById('savedCredsNotice');
                notice.style.display = 'block';
                
                const clearBtn = document.getElementById('clearSaved');
                clearBtn.style.display = 'block';
                
                this.updateStatus('Saved credentials loaded. Click Connect to use them.');
            }
        } catch (error) {
            console.error('Error loading saved credentials:', error);
            this.clearSavedCredentials();
        }
    }

    saveCredentials() {
        try {
            const creds = {
                accessKey: this.credentials.accessKey,
                secretKey: this.credentials.secretKey,
                bucketArn: this.credentials.bucketArn,
                dropzoneFolder: this.credentials.dropzoneFolder
            };
            localStorage.setItem('s3NavCredentials', JSON.stringify(creds));
            
            const clearBtn = document.getElementById('clearSaved');
            clearBtn.style.display = 'block';
        } catch (error) {
            console.error('Error saving credentials:', error);
        }
    }

    clearSavedCredentials() {
        // Clear saved credentials
        localStorage.removeItem('s3NavCredentials');
        
        // Reset UI state completely
        this.disconnect();
        
        // Clear form fields
        document.getElementById('accessKey').value = '';
        document.getElementById('secretKey').value = '';
        document.getElementById('bucketArn').value = '';
        document.getElementById('dropzoneFolder').value = '';
        
        // Hide UI elements
        const notice = document.getElementById('savedCredsNotice');
        notice.style.display = 'none';
        
        const clearBtn = document.getElementById('clearSaved');
        clearBtn.style.display = 'none';
        
        this.updateStatus('Saved credentials cleared. Please enter credentials to connect.');
    }

    disconnect() {
        // Reset connection state
        this.isConnected = false;
        this.currentPath = '';
        this.rootPrefix = '';
        this.credentials = {};
        
        // Reset connect button
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect to S3';
        connectBtn.style.background = '#16a34a';
        
        // Hide upload button
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.style.display = 'none';
        
        // Hide breadcrumb
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.style.display = 'none';
        
        // Reset tree container to initial state
        const container = document.getElementById('treeContainer');
        container.innerHTML = '<div class="empty">Enter your S3 credentials above and click "Connect to S3" to start browsing</div>';
    }

    async connect() {
        const accessKey = document.getElementById('accessKey').value.trim();
        const secretKey = document.getElementById('secretKey').value.trim();
        const bucketArn = document.getElementById('bucketArn').value.trim();
        const dropzoneFolder = document.getElementById('dropzoneFolder').value.trim();
        const region = 'us-east-1'; // Default region

        if (!accessKey || !secretKey || !bucketArn || !dropzoneFolder) {
            this.showError('Please fill in all credential fields');
            return;
        }

        this.credentials = { accessKey, secretKey, bucketArn, region, dropzoneFolder };
        
        const { amgId, suffix } = parseAccessPointArn(bucketArn);

        // Set the root prefix - this is the minimum prefix user has access to
        this.rootPrefix = 'inbox/' + amgId + '/';
        if (dropzoneFolder != '/') {
            this.rootPrefix = 'inbox/' + amgId + '/' + dropzoneFolder + '/';
        }

        const connectBtn = document.getElementById('connectBtn');
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
        
        this.updateStatus('Connecting to S3...');

        try {
            await this.loadFolder(this.rootPrefix);
            this.isConnected = true;
            connectBtn.textContent = 'Connected ✓';
            connectBtn.style.background = '#059669';
            this.updateStatus('Connected successfully');
            this.showBreadcrumb();
            this.showUploadButton();
            this.saveCredentials(); // Save credentials after successful connection
        } catch (error) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect to S3';
            this.showError(`Connection failed: ${error.message || error}`);
            this.updateStatus('Connection failed');
        }
    }

    async loadFolder(prefix) {
        // Prevent navigation above root prefix
        if (prefix.length < this.rootPrefix.length || !prefix.startsWith(this.rootPrefix)) {
            prefix = this.rootPrefix;
        }

        this.showLoading();
        this.currentPath = prefix;
        
        try {
            console.log(prefix)
            const result = await window.awsApi.listObjects({
                ...this.credentials,
                prefix: prefix
            });

            const data = JSON.parse(result);
            this.renderTree(data.folders || [], data.files || [], prefix);
            this.updateBreadcrumb(prefix);
            this.updateStatus(`Loaded ${(data.folders?.length || 0) + (data.files?.length || 0)} items`);
        } catch (error) {
            this.showError(`Error loading folder: ${error.message || error}`);
            this.updateStatus('Error loading folder');
        }
    }

    renderTree(folders, files, currentPrefix) {
        const container = document.getElementById('treeContainer');
        container.innerHTML = '';

        // If no items, show empty state
        if (folders.length === 0 && files.length === 0) {
            container.innerHTML = '<div class="empty">This folder is empty</div>';
            return;
        }

        // Render folders first
        folders.forEach(folderPath => {
            const folderName = this.extractFolderName(folderPath, currentPrefix);
            const item = this.createTreeItem(folderName, 'folder', folderPath);
            container.appendChild(item);
        });

        // Render files
        files.forEach(filePath => {
            const fileName = this.extractFileName(filePath, currentPrefix);
            const item = this.createTreeItem(fileName, 'file', filePath);
            container.appendChild(item);
        });
    }

    createTreeItem(name, type, fullPath) {
        const item = document.createElement('div');
        item.className = `tree-item ${type}`;
        
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = type === 'folder' ? '📁' : '📄';
        
        const text = document.createElement('span');
        text.className = 'tree-text';
        text.textContent = name;
        
        item.appendChild(icon);
        item.appendChild(text);
        
        if (type === 'folder') {
            item.addEventListener('click', () => this.loadFolder(fullPath));
            item.title = `Click to open ${name}`;
        } else {
            item.title = `File: ${name}`;
        }
        
        return item;
    }

    extractFolderName(folderPath, currentPrefix) {
        // Remove current prefix and trailing slash
        let name = folderPath.replace(currentPrefix, '');
        name = name.replace(/\/$/, '');
        return name || folderPath;
    }

    extractFileName(filePath, currentPrefix) {
        // Remove current prefix and get just the filename
        let name = filePath.replace(currentPrefix, '');
        return name || filePath.split('/').pop();
    }

    updateBreadcrumb(currentPrefix) {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = '';
        
        // Calculate relative path from root prefix to current prefix
        const relativePath = currentPrefix.replace(this.rootPrefix, '');
        
        // Root item (represents the root prefix the user has access to)
        const rootItem = document.createElement('span');
        rootItem.className = 'breadcrumb-item';
        rootItem.textContent = '🏠 Root';
        rootItem.dataset.path = this.rootPrefix;
        rootItem.addEventListener('click', () => this.loadFolder(this.rootPrefix));
        breadcrumb.appendChild(rootItem);
        
        // Build path segments from the relative path
        if (relativePath) {
            const segments = relativePath.split('/').filter(Boolean);
            let buildPath = this.rootPrefix;
            
            segments.forEach((segment, index) => {
                buildPath += segment + '/';
                
                // Add separator
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.textContent = ' / ';
                breadcrumb.appendChild(separator);
                
                // Add segment
                const segmentItem = document.createElement('span');
                segmentItem.className = 'breadcrumb-item';
                segmentItem.textContent = segment;
                segmentItem.dataset.path = buildPath;
                segmentItem.addEventListener('click', () => this.loadFolder(buildPath));
                breadcrumb.appendChild(segmentItem);
            });
        }
    }

    showBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.style.display = 'flex';
    }

    showUploadButton() {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.style.display = 'flex';
    }

    selectFiles() {
        const fileInput = document.getElementById('fileInput');
        fileInput.click();
    }

    async handleFileSelection(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        // Reset file input
        event.target.value = '';

        // Prepare file data
        const fileData = files.map(file => ({
            name: file.name,
            path: file.path, // Available in Electron
            size: file.size,
            type: file.type
        }));

        this.showUploadModal();
        
        try {
            const result = await window.awsApi.uploadFiles({
                ...this.credentials,
                prefix: this.currentPath,
                files: fileData
            });

            this.hideUploadModal();
            
            if (result.success) {
                this.updateStatus(`Upload complete: ${result.successCount}/${result.totalFiles} files uploaded successfully`);
                
                if (result.errorCount > 0) {
                    this.showError(`${result.errorCount} files failed to upload. Check console for details.`);
                }
                
                // Refresh current folder to show new files
                await this.loadFolder(this.currentPath);
            } else {
                this.showError('Upload failed');
            }
            
        } catch (error) {
            this.hideUploadModal();
            this.showError(`Upload failed: ${error.message || error}`);
            this.updateStatus('Upload failed');
        }
    }

    showUploadModal() {
        const overlay = document.getElementById('uploadOverlay');
        overlay.style.display = 'flex';
        
        const title = document.getElementById('uploadModalTitle');
        title.textContent = 'Uploading Files...';
        
        const progressBar = document.getElementById('modalProgressBar');
        progressBar.style.width = '0%';
        
        const progressText = document.getElementById('modalProgressText');
        progressText.textContent = 'Preparing upload...';
    }

    hideUploadModal() {
        const overlay = document.getElementById('uploadOverlay');
        overlay.style.display = 'none';
    }

    updateUploadProgress(data) {
        if (data.type === 'progress') {
            const progressBar = document.getElementById('modalProgressBar');
            const progressText = document.getElementById('modalProgressText');
            
            const overallProgress = ((data.currentFile - 1) / data.totalFiles + data.fileProgress / 100 / data.totalFiles) * 100;
            progressBar.style.width = `${overallProgress}%`;
            
            if (data.fileProgress === 100) {
                progressText.textContent = `Completed: ${data.fileName} (${data.currentFile}/${data.totalFiles})`;
            } else {
                progressText.textContent = `Uploading: ${data.fileName} (${data.currentFile}/${data.totalFiles}) - ${data.fileProgress}%`;
            }
        }
    }

    showLoading() {
        const container = document.getElementById('treeContainer');
        container.innerHTML = '<div class="loading">📁 Loading...</div>';
    }

    showError(message) {
        const container = document.getElementById('treeContainer');
        container.innerHTML = `<div class="error">❌ ${message}</div>`;
    }

    updateStatus(message) {
        const status = document.getElementById('status');
        status.textContent = message;
    }
}

function parseAccessPointArn(arn) {
    // 1: everything up to "accesspoint/" is discarded
    // 2: ([^-]+)      — "capture as many non-'-' chars as possible"  → the access-point ID
    // 3: (?:-(.+))?   — optionally "-" plus "capture the rest"        → the folder name
    [accPref,accName] = arn.split("/", 2)
    m = accName.split("-", 2)
    console.log(m[0])
    return {
        amgId:m[0],
        suffix: m[1]
    };
}

// Initialize the navigator when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new S3Navigator();
});