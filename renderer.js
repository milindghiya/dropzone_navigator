// Dropzone Navigator - Tree-like interface
class S3Navigator {
    constructor() {
        this.currentPath = '';
        this.rootPrefix = ''; // The minimum prefix user has access to
        this.credentials = {};
        this.isConnected = false;
        this.setupEventListeners();
        this.setupNewFolderDialog();
        this.updateStatus('Ready to connect');
    }

    setupEventListeners() {
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.addEventListener('click', () => this.connect());
        
        const clearSavedBtn = document.getElementById('clearSaved');
        clearSavedBtn.addEventListener('click', () => this.clearSavedCredentials());
        
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.addEventListener('click', () => this.selectFiles());

        const newFolderBtn = document.getElementById('newFolderBtn');
        newFolderBtn.addEventListener('click', () => this.promptNewFolder());
        
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

    setupNewFolderDialog() {
        const overlay = document.getElementById('newFolderOverlay');
        const input = document.getElementById('newFolderNameInput');
        const error = document.getElementById('newFolderError');
        const cancelBtn = document.getElementById('newFolderCancel');
        const createBtn = document.getElementById('newFolderCreate');

        if (!overlay || !input || !error || !cancelBtn || !createBtn) {
            console.warn('New folder dialog elements are missing in the DOM.');
            this.newFolderDialog = null;
            return;
        }

        overlay.setAttribute('tabindex', '-1');
        this.newFolderDialog = { overlay, input, error, cancelBtn, createBtn };
    }

    showNewFolderDialog() {
        if (!this.newFolderDialog) {
            return Promise.resolve(null);
        }

        const { overlay, input, error, cancelBtn, createBtn } = this.newFolderDialog;

        return new Promise((resolve) => {
            const resetState = () => {
                input.value = '';
                error.textContent = '';
                error.style.display = 'none';
            };

            const cleanup = () => {
                cancelBtn.removeEventListener('click', onCancel);
                createBtn.removeEventListener('click', onConfirm);
                input.removeEventListener('keydown', onKeyDown);
                overlay.style.display = 'none';
                resetState();
            };

            const onCancel = (event) => {
                event.preventDefault();
                cleanup();
                resolve(null);
            };

            const onConfirm = (event) => {
                event.preventDefault();
                const value = input.value || '';
                const trimmed = value.trim();

                if (!trimmed) {
                    error.textContent = 'Folder name cannot be empty.';
                    error.style.display = 'block';
                    return;
                }

                if (/[\\]/.test(trimmed) || trimmed.includes('..') || trimmed.includes('/')) {
                    error.textContent = 'Folder name cannot include path separators, backslashes, or "..".';
                    error.style.display = 'block';
                    return;
                }

                cleanup();
                resolve(trimmed);
            };

            const onKeyDown = (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    onConfirm(event);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    onCancel(event);
                }
            };

            cancelBtn.addEventListener('click', onCancel);
            createBtn.addEventListener('click', onConfirm);
            input.addEventListener('keydown', onKeyDown);
 
            resetState();
            overlay.style.display = 'flex';
            window.requestAnimationFrame(() => {
                input.focus();
            });
        });
    }
 
    saveCredentials() {
        // Intentionally left blank: credentials are never persisted to disk for security
    }

    clearSavedCredentials() {
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
        
        const newFolderBtn = document.getElementById('newFolderBtn');
        if (newFolderBtn) {
            newFolderBtn.style.display = 'none';
            newFolderBtn.disabled = false;
        }

        // Hide breadcrumb
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.style.display = 'none';
        
        // Reset tree container to initial state
        const container = document.getElementById('treeContainer');
        container.innerHTML = '<div class="empty">Enter your S3 credentials above and click "Connect to S3" to start browsing</div>';

        const clearBtn = document.getElementById('clearSaved');
        clearBtn.style.display = 'none';

        // Clear status message
        this.updateStatus('Disconnected. Ready to connect.');
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

        const newFolderBtn = document.getElementById('newFolderBtn');
        newFolderBtn.style.display = 'flex';
    }

    async promptNewFolder() {
        if (!this.isConnected) {
            window.alert('Please connect to S3 before creating a folder.');
            return;
        }
 
        const folderName = await this.showNewFolderDialog();
        if (!folderName) {
            return;
        }

        const trimmed = folderName.trim();
        if (!trimmed) {
            window.alert('Folder name cannot be empty.');
            return;
        }

        const newFolderBtn = document.getElementById('newFolderBtn');
        if (newFolderBtn) {
            newFolderBtn.disabled = true;
        }
 
        try {
            this.updateStatus(`Creating folder "${trimmed}"...`);
            await window.awsApi.createFolder({
                ...this.credentials,
                prefix: this.currentPath,
                folderName: trimmed
            });
 
            this.updateStatus(`Folder "${trimmed}" created successfully.`);
            await this.loadFolder(this.currentPath);
        } catch (error) {
            console.error('Failed to create folder:', error);
            const message = (error && error.message) ? error.message.replace('Create Folder Error: ', '') : 'Unknown error';
            this.updateStatus('Folder creation failed');
            window.alert(`Failed to create folder: ${message}`);
        } finally {
            if (newFolderBtn) {
                newFolderBtn.disabled = false;
            }
        }
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

        this.updateStatus('Uploading files using AWS CLI...');

        this.showUploadModal();
        
        try {
            const result = await window.awsApi.uploadFilesCli({
                ...this.credentials,
                prefix: this.currentPath,
                files: fileData
            });
 
            if (result.success && result.errorCount === 0) {
                this.hideUploadModal();
                this.updateStatus(`Upload complete: ${result.successCount}/${result.totalFiles} files uploaded successfully`);
                await this.loadFolder(this.currentPath);
            } else {
                const errors = result.errorCount || result.results.filter(r => !r.success).length;
                this.updateStatus(`Upload completed with ${errors} error${errors === 1 ? '' : 's'}.`);
                window.alert(`Upload failed for ${errors} file${errors === 1 ? '' : 's'}. Check connection and try again.`);
                this.hideUploadModal();
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
        progressText.style.color = '#1f2937';
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

        if (data.type === 'cli-log') {
            const progressText = document.getElementById('modalProgressText');
            const fileLine = `Uploading: ${data.fileName} (${data.currentFile}/${data.totalFiles})`;
            const cliLine = data.message ? `\n${data.message}` : '';
            progressText.textContent = `${fileLine}${cliLine}`;
            progressText.style.color = '#1f2937';
            return;
        }

        if (data.type === 'error') {
            const progressText = document.getElementById('modalProgressText');
            progressText.textContent = `Failed: ${data.fileName} — ${data.message}`;
            progressText.style.color = '#dc2626';
            this.updateStatus(`Upload failed for ${data.fileName}`);
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
    const [accPref, accName] = arn.split('/', 2);
    const m = accName.split('-', 2);
    return {
        amgId: m[0],
        suffix: m[1]
    };
}

// Initialize the navigator when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new S3Navigator();
});